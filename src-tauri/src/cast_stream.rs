use crate::export_stream::{share_frame, SharedFrame};
use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    io::{Read, Write},
    net::{Shutdown, TcpStream, ToSocketAddrs},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::JoinHandle,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{path::BaseDirectory, Emitter, Manager, State, WebviewWindow};

/**
 * Network cast, the sender (see src/lib/castStream.ts; the receiver is
 * receiver.rs). The page gives each frame as plain pixels in shared memory
 * (as a video export does), FFmpeg encodes them to AV1 with the graphics
 * card's encoder at its lowest delay, and each encoded frame goes to the
 * receiver over one TCP connection.
 *
 * A message, in both directions: 1 byte for its kind, the length in 4
 * bytes (big-endian), then the content.
 * - TEXT: JSON with a "type". The receiver starts with "hello" (its name
 *   and its screen's size), the sender answers with "config" (the video
 *   format). The receiver sends "ping" (the sender answers "pong" with its
 *   clock, so the receiver can compare the two clocks) and "report" (its
 *   numbers, which go to the page as a "cast-stream-report" event).
 * - FRAME: 16 bytes, then one encoded frame. Byte 0 is 1 for a key frame,
 *   else 2; bytes 4 to 7 are the frame's number; bytes 8 to 15 are the
 *   time the page took the picture, in ms since 1970 (a 64-bit float).
 */
pub const TEXT: u8 = 0;
pub const FRAME: u8 = 1;
/** The receiver listens on this TCP port. */
pub const PORT: u16 = 14530;
/** The longest wait for the receiver's answer when a stream starts. */
const CONNECT_WAIT: Duration = Duration::from_secs(3);
/** The largest message that is read; a longer one means a broken stream. */
const MAX_MESSAGE: usize = 64 * 1024 * 1024;

pub fn write_message(stream: &mut impl Write, kind: u8, content: &[u8]) -> std::io::Result<()> {
    let mut head = [kind, 0, 0, 0, 0];
    head[1..].copy_from_slice(&(content.len() as u32).to_be_bytes());
    stream.write_all(&head)?;
    stream.write_all(content)
}

pub fn read_message(stream: &mut impl Read) -> std::io::Result<(u8, Vec<u8>)> {
    let mut head = [0u8; 5];
    stream.read_exact(&mut head)?;
    let length = u32::from_be_bytes(head[1..].try_into().unwrap()) as usize;
    if length > MAX_MESSAGE {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "The message is too long"));
    }
    let mut content = vec![0; length];
    stream.read_exact(&mut content)?;
    Ok((head[0], content))
}

/** Milliseconds since 1970 on this PC's clock. */
pub fn clock_ms() -> f64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|time| time.as_secs_f64() * 1000.0).unwrap_or(0.0)
}

/** What the receiver says about itself when the sender connects. */
#[derive(Clone, Serialize, Deserialize)]
pub struct Hello {
    pub name: String,
    /** The receiver's screen, in pixels. */
    pub width: u32,
    pub height: u32,
}

/** What a started stream gives the page: the receiver's name, and the size of the frames to send. */
#[derive(Serialize)]
pub struct StreamInfo {
    name: String,
    width: u32,
    height: u32,
}

struct OpenStream {
    shared: SharedFrame,
    child: Child,
    stdin: Option<ChildStdin>,
    /** The capture times of the frames that FFmpeg has not given back yet, oldest first. */
    times: Arc<Mutex<VecDeque<f64>>>,
    /** Set when the receiver closed the connection, or the connection failed. */
    gone: Arc<AtomicBool>,
    receiver: TcpStream,
    threads: Vec<JoinHandle<()>>,
    errors: Option<JoinHandle<Vec<u8>>>,
}

impl OpenStream {
    /** Stops FFmpeg and closes the connection. Returns FFmpeg's error text. */
    fn close(mut self) -> String {
        drop(self.stdin.take());
        /* The connection closes first, so a thread that waits for the network cannot keep FFmpeg from its end. */
        let _ = self.receiver.shutdown(Shutdown::Both);
        let _ = self.child.wait();
        for thread in self.threads.drain(..) {
            let _ = thread.join();
        }
        let errors = self.errors.take().and_then(|errors| errors.join().ok()).unwrap_or_default();
        String::from_utf8_lossy(&errors).trim().to_string()
    }
}

#[derive(Default)]
pub struct CastStreams {
    open: Mutex<Option<OpenStream>>,
}

/** Windows process flag: no console window. */
#[cfg(windows)]
const NO_WINDOW: u32 = 0x0800_0000;

/** Whether an AV1 frame starts a new picture sequence: after the delimiter, its first part is a sequence header. */
fn is_key_frame(data: &[u8]) -> bool {
    let mut at = 0;
    while at + 2 <= data.len() {
        let kind = (data[at] >> 3) & 0x0f;
        if kind == 1 {
            return true;
        }
        if kind != 2 {
            return false;
        }
        /* The delimiter has a size byte of 0. */
        at += 2 + data[at + 1] as usize;
    }
    false
}

/** Reads FFmpeg's IVF output and sends each frame to the receiver. Ends when FFmpeg or the receiver closes. */
fn forward(mut output: impl Read, receiver: Arc<Mutex<TcpStream>>, times: Arc<Mutex<VecDeque<f64>>>, gone: Arc<AtomicBool>) {
    let mut file_head = [0u8; 32];
    if output.read_exact(&mut file_head).is_err() {
        return;
    }
    let mut number: u32 = 0;
    let mut head = [0u8; 12];
    let mut content = Vec::new();
    while output.read_exact(&mut head).is_ok() {
        let size = u32::from_le_bytes(head[..4].try_into().unwrap()) as usize;
        content.resize(16 + size, 0);
        if output.read_exact(&mut content[16..]).is_err() {
            return;
        }
        let taken = times.lock().ok().and_then(|mut times| times.pop_front()).unwrap_or(0.0);
        content[..16].fill(0);
        content[0] = if is_key_frame(&content[16..]) { 1 } else { 2 };
        content[4..8].copy_from_slice(&number.to_be_bytes());
        content[8..16].copy_from_slice(&taken.to_be_bytes());
        number = number.wrapping_add(1);
        let sent = receiver.lock().map(|mut receiver| write_message(&mut *receiver, FRAME, &content));
        if !matches!(sent, Ok(Ok(()))) {
            gone.store(true, Ordering::Relaxed);
            return;
        }
    }
}

/** Reads what the receiver sends: answers each ping with this PC's clock, and gives the reports to the page. Ends when the connection closes. */
fn listen(mut from: TcpStream, to: Arc<Mutex<TcpStream>>, gone: Arc<AtomicBool>, window: WebviewWindow) {
    while let Ok((kind, content)) = read_message(&mut from) {
        if kind != TEXT {
            continue;
        }
        let Ok(text) = String::from_utf8(content) else { continue };
        if text.starts_with(r#"{"type":"ping""#) {
            let sent = serde_json::from_str::<serde_json::Value>(&text).ok().and_then(|ping| ping.get("sent").and_then(|sent| sent.as_f64())).unwrap_or(0.0);
            let pong = format!(r#"{{"type":"pong","sent":{sent},"time":{}}}"#, clock_ms());
            if let Ok(mut to) = to.lock() {
                let _ = write_message(&mut *to, TEXT, pong.as_bytes());
            }
        } else {
            let _ = window.emit_to(window.label(), "cast-stream-report", text);
        }
    }
    gone.store(true, Ordering::Relaxed);
    let _ = window.emit_to(window.label(), "cast-stream-gone", ());
}

/**
 * Starts a stream to the receiver at "target" (a host name or address; the
 * port is PORT unless "target" has one). The frames have the shape of the
 * receiver's screen, and its size up to "max_height" pixels of height (a
 * projector can take a 4K signal and show 1080p; a larger stream than the
 * screen shows only costs speed). The page gets the shared frame memory in a
 * "sharedbufferreceived" event. A stream that is open already ends first.
 */
#[tauri::command(async)]
pub fn cast_stream_begin(window: WebviewWindow, streams: State<'_, CastStreams>, target: String, fps: u32, bit_rate: u32, max_height: u32) -> Result<StreamInfo, String> {
    let mut open = streams.open.lock().map_err(|_| "The stream is unavailable")?;
    if let Some(old) = open.take() {
        old.close();
    }
    if fps == 0 || fps > 240 {
        return Err(format!("The stream rate is invalid: {fps} frames a second"));
    }
    let ffmpeg = window.path().resolve("ffmpeg/ffmpeg.exe", BaseDirectory::Resource).map_err(|error| format!("Could not find FFmpeg: {error}"))?;
    let address = if target.contains(':') { target.clone() } else { format!("{target}:{PORT}") };
    let address = address.to_socket_addrs().ok().and_then(|mut addresses| addresses.find(|address| address.is_ipv4())).ok_or(format!("Could not find the receiver {target} on the network"))?;
    let mut receiver = TcpStream::connect_timeout(&address, CONNECT_WAIT).map_err(|error| format!("Could not connect to the receiver {target}: {error}"))?;
    let _ = receiver.set_nodelay(true);
    let _ = receiver.set_read_timeout(Some(CONNECT_WAIT));
    let hello = match read_message(&mut receiver) {
        Ok((TEXT, content)) => serde_json::from_slice::<Hello>(&content).map_err(|_| format!("{target} is not a Kaleido Sage receiver"))?,
        _ => return Err(format!("{target} did not answer as a Kaleido Sage receiver")),
    };
    let _ = receiver.set_read_timeout(None);
    /* The encoder needs even sizes. */
    let (screen_width, screen_height) = (hello.width.clamp(320, 7680), hello.height.clamp(240, 4320));
    let height = screen_height.min(max_height.clamp(240, 2160));
    let width = ((screen_width as u64 * height as u64 + screen_height as u64 / 2) / screen_height as u64) as u32;
    let (width, height) = (width.clamp(320, 3840) & !1, height & !1);
    let config = format!(r#"{{"type":"config","codec":"av01.0.09M.08","width":{width},"height":{height},"fps":{fps}}}"#);
    write_message(&mut receiver, TEXT, config.as_bytes()).map_err(|error| format!("Could not send to the receiver: {error}"))?;

    let (size, rate, bits, buffer, key_frames) = (format!("{width}x{height}"), fps.to_string(), bit_rate.to_string(), (bit_rate / 4).to_string(), (fps * 2).to_string());
    let mut command = Command::new(ffmpeg);
    command
        .args(["-hide_banner", "-loglevel", "error", "-fflags", "nobuffer", "-f", "rawvideo", "-pixel_format", "rgb0", "-video_size", &size, "-framerate", &rate, "-i", "pipe:0"])
        .args(["-c:v", "av1_nvenc", "-preset", "p4", "-tune", "ull", "-rc", "cbr", "-b:v", &bits, "-maxrate", &bits, "-bufsize", &buffer])
        .args(["-g", &key_frames, "-bf", "0", "-delay", "0", "-zerolatency", "1", "-fps_mode", "passthrough"])
        .args(["-f", "ivf", "-flush_packets", "1", "pipe:1"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(NO_WINDOW);
    }
    let mut child = command.spawn().map_err(|error| format!("Could not start FFmpeg: {error}"))?;
    let stdin = child.stdin.take();
    let times = Arc::new(Mutex::new(VecDeque::new()));
    let gone = Arc::new(AtomicBool::new(false));
    let (Ok(reading), Ok(writing)) = (receiver.try_clone(), receiver.try_clone()) else {
        let _ = child.kill();
        return Err("Could not use the connection to the receiver".into());
    };
    let writing = Arc::new(Mutex::new(writing));
    let mut threads = Vec::new();
    if let Some(output) = child.stdout.take() {
        let (writing, times, gone) = (writing.clone(), times.clone(), gone.clone());
        threads.push(std::thread::spawn(move || forward(output, writing, times, gone)));
    }
    {
        let (gone, window) = (gone.clone(), window.clone());
        threads.push(std::thread::spawn(move || listen(reading, writing, gone, window)));
    }
    let errors = child.stderr.take().map(|mut stderr| {
        std::thread::spawn(move || {
            let mut text = Vec::new();
            let _ = stderr.read_to_end(&mut text);
            text
        })
    });
    let Some(shared) = share_frame(&window, width as usize * height as usize * 4) else {
        let _ = child.kill();
        let _ = receiver.shutdown(Shutdown::Both);
        return Err("This web view cannot share memory with the app".into());
    };
    *open = Some(OpenStream { shared, child, stdin, times, gone, receiver, threads, errors });
    Ok(StreamInfo { name: hello.name, width, height })
}

/** Gives FFmpeg the frame in the shared memory; "taken" is the time the page took the picture. It waits while FFmpeg is busy, and the page waits for it before it writes the next frame. */
#[tauri::command(async)]
pub fn cast_stream_frame(streams: State<'_, CastStreams>, taken: f64) -> Result<(), String> {
    let mut open = streams.open.lock().map_err(|_| "The stream is unavailable")?;
    let stream = open.as_mut().ok_or("No stream is open")?;
    if stream.gone.load(Ordering::Relaxed) {
        return Err("The receiver closed the connection".into());
    }
    let stdin = stream.stdin.as_mut().ok_or("No stream is open")?;
    if let Ok(mut times) = stream.times.lock() {
        times.push_back(taken);
    }
    stdin.write_all(stream.shared.pixels()).map_err(|error| format!("The video encoder stopped: {error}"))
}

/** Ends the stream. Returns FFmpeg's error text, empty when all went well. */
#[tauri::command(async)]
pub fn cast_stream_end(streams: State<'_, CastStreams>) -> Result<String, String> {
    let stream = streams.open.lock().map_err(|_| "The stream is unavailable")?.take();
    Ok(stream.map(OpenStream::close).unwrap_or_default())
}
