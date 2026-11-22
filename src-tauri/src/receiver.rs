use crate::cast_stream::{read_message, write_message, Hello, PORT, TEXT};
use std::{
    net::{Shutdown, TcpListener, TcpStream},
    sync::{Arc, Mutex},
};
use tauri::{window::Color, AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tungstenite::{Message, WebSocket};

/**
 * Receiver mode: this PC shows the picture that a Kaleido Sage on another
 * PC sends over the network (the sender is cast_stream.rs, which also has
 * the message layout). The app starts in this mode with `--receiver`: it
 * has one full-screen window, the receiver window, which loads the same
 * page as the main window; its window label selects the receiver view
 * (src/components/ReceiverView.tsx). This side listens on PORT, takes one
 * sender at a time, and gives each of its messages to the page, which
 * decodes the video and shows it (src/lib/receiver.ts).
 *
 * The messages go to the page through a WebSocket on this PC only: the
 * page connects to a port that this side opens for it. The app's normal
 * channel to the page makes one more call for each large message, which
 * measured about 40 ms more delay on a small PC, with an uneven rhythm.
 */
pub const WINDOW: &str = "receiver";

/** Messages that this side makes for the page, next to the sender's TEXT and FRAME: a sender connected (the content is its address), and the sender is gone. */
const CONNECTED: u8 = 2;
const GONE: u8 = 3;

/** True when the app was started as a receiver. */
pub fn wanted() -> bool {
    std::env::args().any(|argument| argument == "--receiver")
}

#[derive(Default)]
struct Link {
    /** The page's end; a page that loads again connects again. */
    page: Option<WebSocket<TcpStream>>,
    /** The port on this PC that the page connects to; 0 until the first receiver_listen. */
    page_port: u16,
    /** The sender, and its number: a later sender has a higher one. */
    sender: Option<(u64, TcpStream)>,
    senders: u64,
}

#[derive(Default)]
pub struct Receiver {
    link: Arc<Mutex<Link>>,
}

/** Opens the receiver window, full screen and black, and closes the splash window. */
pub fn open_window(app: &AppHandle) -> tauri::Result<()> {
    /* WebView2 needs the same browser arguments in every window of the app. */
    let browser_args = app.config().app.windows.iter().find(|window| window.label == "main").and_then(|window| window.additional_browser_args.clone());
    let mut builder = WebviewWindowBuilder::new(app, WINDOW, WebviewUrl::App("index.html".into()));
    if let Some(args) = browser_args.as_deref() {
        builder = builder.additional_browser_args(args);
    }
    builder.title("Kaleido Sage Receiver").decorations(false).fullscreen(true).background_color(Color(0, 0, 0, 0xff)).build()?;
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.destroy();
    }
    Ok(())
}

fn to_page(link: &Arc<Mutex<Link>>, kind: u8, content: &[u8]) {
    let mut message = Vec::with_capacity(content.len() + 1);
    message.push(kind);
    message.extend_from_slice(content);
    if let Ok(mut link) = link.lock() {
        let failed = link.page.as_mut().is_some_and(|page| page.send(Message::Binary(message.into())).is_err());
        if failed {
            link.page = None;
        }
    }
}

/** Takes the page's connections; the newest one is the page. A page that loads again starts with no stream, so the sender's connection closes and the sender can start again. */
fn accept_page(listener: TcpListener, link: Arc<Mutex<Link>>) {
    for page in listener.incoming() {
        let Ok(page) = page else { continue };
        let _ = page.set_nodelay(true);
        let Ok(page) = tungstenite::accept(page) else { continue };
        let Ok(mut link) = link.lock() else { return };
        link.page = Some(page);
        if let Some((_, old)) = link.sender.take() {
            let _ = old.shutdown(Shutdown::Both);
        }
    }
}

/** The name and the screen size that the sender gets. */
fn hello(app: &AppHandle) -> Hello {
    let size = app.get_webview_window(WINDOW).and_then(|window| window.current_monitor().ok().flatten()).map(|monitor| *monitor.size());
    Hello {
        name: std::env::var("COMPUTERNAME").unwrap_or_else(|_| "Receiver".into()),
        width: size.map_or(1920, |size| size.width),
        height: size.map_or(1080, |size| size.height),
    }
}

/** Takes senders, one at a time: a new sender takes the place of the one before it. */
fn accept(listener: TcpListener, link: Arc<Mutex<Link>>, app: AppHandle) {
    for sender in listener.incoming() {
        let Ok(mut sender) = sender else { continue };
        let _ = sender.set_nodelay(true);
        let Ok(text) = serde_json::to_vec(&hello(&app)) else { continue };
        if write_message(&mut sender, TEXT, &text).is_err() {
            continue;
        }
        let (Ok(kept), Ok(address)) = (sender.try_clone(), sender.peer_addr()) else { continue };
        let number = {
            let Ok(mut link) = link.lock() else { return };
            if let Some((_, old)) = link.sender.take() {
                let _ = old.shutdown(Shutdown::Both);
            }
            link.senders += 1;
            link.sender = Some((link.senders, kept));
            link.senders
        };
        to_page(&link, CONNECTED, address.ip().to_string().as_bytes());
        let link = link.clone();
        std::thread::spawn(move || {
            while let Ok((kind, content)) = read_message(&mut sender) {
                to_page(&link, kind, &content);
            }
            /* Only the sender that is still the current one leaves the page with no sender. */
            let current = link.lock().map(|mut link| {
                let current = link.sender.as_ref().is_some_and(|(sender, _)| *sender == number);
                if current {
                    link.sender = None;
                }
                current
            });
            if current.unwrap_or(false) {
                to_page(&link, GONE, &[]);
            }
        });
    }
}

/** What the page gets when it is ready: this PC's name, and the port on this PC where the sender's messages come (a WebSocket). */
#[derive(serde::Serialize)]
pub struct ReceiverInfo {
    name: String,
    port: u16,
}

/** The page is ready. The first call starts to listen: on the network for a sender, and on this PC for the page. */
#[tauri::command]
pub fn receiver_listen(app: AppHandle, receiver: State<'_, Receiver>) -> Result<ReceiverInfo, String> {
    let mut link = receiver.link.lock().map_err(|_| "The receiver is unavailable")?;
    if link.page_port == 0 {
        let senders = TcpListener::bind(("0.0.0.0", PORT)).map_err(|error| format!("Could not listen on the network (port {PORT}): {error}"))?;
        let pages = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| format!("Could not open the page's port: {error}"))?;
        link.page_port = pages.local_addr().map_err(|error| format!("Could not open the page's port: {error}"))?.port();
        let (shared, app) = (receiver.link.clone(), app.clone());
        std::thread::spawn(move || accept(senders, shared, app));
        let shared = receiver.link.clone();
        std::thread::spawn(move || accept_page(pages, shared));
    }
    Ok(ReceiverInfo { name: hello(&app).name, port: link.page_port })
}

/** Sends a text message (a ping or a report) to the sender; with no sender, it does nothing. */
#[tauri::command]
pub fn receiver_send(receiver: State<'_, Receiver>, text: String) -> Result<(), String> {
    let mut link = receiver.link.lock().map_err(|_| "The receiver is unavailable")?;
    if let Some((_, sender)) = link.sender.as_mut() {
        let _ = write_message(sender, TEXT, text.as_bytes());
    }
    Ok(())
}
