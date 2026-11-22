use crate::export_stream::{share_frame, SharedFrame};
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    io::{Read, Write},
    net::{Shutdown, TcpStream, ToSocketAddrs},
    path::Path,
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
 * (as a video export does), FFmpeg encodes them to H.264 at its lowest
 * delay, and each encoded frame goes to the receiver over one TCP
 * connection. H.264 is the format that every PC can make and show: the
 * graphics chips of NVIDIA, AMD and Intel all encode it (see ENCODERS), a
 * processor can too, and every receiver's graphics chip decodes it. (The
 * first version used AV1, which only the newest NVIDIA cards encode.)
 * FFmpeg writes FLV, because that container gives one frame at a time with
 * its length, with no wait for the next frame.
 *
 * A message, in both directions: 1 byte for its kind, the length in 4
 * bytes (big-endian), then the content.
 * - TEXT: JSON with a "type". The receiver starts with "hello" (its name
 *   and its screen's size), the sender answers with "config" (the video
 *   format, with the decoder's settings in "description", in base64). The
 *   receiver sends "ping" (the sender answers "pong" with its
 *   clock, so the receiver can compare the two clocks) and "report" (its
 *   numbers, which go to the page as a "cast-stream-report" event).
 * - FRAME: 16 bytes, then one encoded frame (H.264, each part with its
 *   length before it, as the "description" says). Byte 0 is 1 for a key frame,
 *   else 2; bytes 4 to 7 are the frame's number; bytes 8 to 15 are the
 *   time the page took the picture, in ms since 1970 (a 64-bit float).
 * - AUDIO: one block of the app's music, not compressed (48 kHz stereo is
 *   1.5 Mbit/s, little next to the video). Bytes 0 to 7 are the time the
 *   block played in the app, as in FRAME; bytes 8 to 11 are the sample
 *   rate; then the samples, 16 bits each (little-endian), left and right
 *   in turn. The page makes the whole content (see castStream.ts).
 */
pub const TEXT: u8 = 0;
pub const FRAME: u8 = 1;
/** Kinds 2 and 3 are the receiver's own notes to its page (see receiver.rs). */
pub const AUDIO: u8 = 4;
/** The receiver listens on this TCP port for a sender, and on the same UDP port for a search (see cast_receivers). */
pub const PORT: u16 = 14530;
/** The number of this message layout. A sender and a receiver with different numbers do not work together. */
pub const PROTOCOL: u32 = 2;
/** What a sender sends to all PCs on the network to find the receivers; a receiver answers with its Hello. */
pub const SEARCH: &[u8] = b"KALEIDOSAGE-FIND 1";
/** How long a search waits for answers. */
const SEARCH_WAIT: Duration = Duration::from_millis(400);
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
    #[serde(default)]
    pub protocol: u32,
}

/** A receiver that a search found: its name, its network address, and its screen's size. */
#[derive(Serialize)]
pub struct FoundReceiver {
    name: String,
    address: String,
    width: u32,
    height: u32,
}

/**
 * Finds the receivers on the network. A search message goes from each of
 * this PC's network addresses to all PCs on that network, and each
 * receiver answers to the address it came from. Windows Firewall lets the
 * answers in with no question to the user, because they answer a message
 * that this app sent a moment before.
 */
#[tauri::command(async)]
pub fn cast_receivers() -> Vec<FoundReceiver> {
    let mut sockets = Vec::new();
    for interface in if_addrs::get_if_addrs().unwrap_or_default() {
        let if_addrs::IfAddr::V4(address) = &interface.addr else { continue };
        if address.ip.is_loopback() {
            continue;
        }
        let Ok(socket) = std::net::UdpSocket::bind((address.ip, 0)) else { continue };
        let _ = socket.set_broadcast(true);
        let _ = socket.set_read_timeout(Some(Duration::from_millis(40)));
        if let Some(broadcast) = address.broadcast {
            let _ = socket.send_to(SEARCH, (broadcast, PORT));
        }
        let _ = socket.send_to(SEARCH, (std::net::Ipv4Addr::BROADCAST, PORT));
        sockets.push(socket);
    }
    let mut found: Vec<FoundReceiver> = Vec::new();
    let started = std::time::Instant::now();
    let mut answer = [0u8; 2048];
    while started.elapsed() < SEARCH_WAIT {
        for socket in &sockets {
            let Ok((length, from)) = socket.recv_from(&mut answer) else { continue };
            let Ok(hello) = serde_json::from_slice::<Hello>(&answer[..length]) else { continue };
            if !found.iter().any(|receiver| receiver.name == hello.name) {
                found.push(FoundReceiver { name: hello.name, address: from.ip().to_string(), width: hello.width, height: hello.height });
            }
        }
    }
    found.sort_by(|a, b| a.name.cmp(&b.name));
    found
}

/** What a started stream gives the page: the receiver's name, the size of the frames to send, and what encodes them. */
#[derive(Serialize)]
pub struct StreamInfo {
    name: String,
    width: u32,
    height: u32,
    encoder: &'static str,
}

/** A video encoder of FFmpeg for the stream: its name, what it runs on (for the user), its options for the lowest delay, and whether it takes the page's RGB pixels as they are. */
struct Encoder {
    name: &'static str,
    runs_on: &'static str,
    options: &'static [&'static str],
    takes_rgb: bool,
}

/**
 * The encoders, in the order they are tried: the graphics chips first,
 * because they leave the processor to the picture, then the processor,
 * which every PC has. The first one that can encode two test frames at the
 * stream's size is used (see can_encode), and kept for the app's run.
 */
const ENCODERS: [Encoder; 4] = [
    Encoder { name: "h264_nvenc", runs_on: "the NVIDIA graphics card", options: &["-preset", "p4", "-tune", "ull", "-zerolatency", "1", "-rc", "cbr", "-delay", "0"], takes_rgb: true },
    Encoder { name: "h264_amf", runs_on: "the AMD graphics chip", options: &["-usage", "ultralowlatency", "-rc", "cbr"], takes_rgb: false },
    Encoder { name: "h264_qsv", runs_on: "the Intel graphics chip", options: &["-preset", "veryfast", "-async_depth", "1"], takes_rgb: false },
    Encoder { name: "libx264", runs_on: "the processor", options: &["-preset", "ultrafast", "-tune", "zerolatency"], takes_rgb: false },
];

/** For an encoder that does not take RGB: the conversion, with the BT.709 colors that players expect at this size. */
const TO_YUV: &str = "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p";

/** FFmpeg's options after the input for "encoder": constant bit rate, a key frame each 2 seconds, and no frames that wait for later frames. */
fn encoder_args(encoder: &Encoder, fps: u32, bit_rate: u32) -> Vec<String> {
    let mut args: Vec<String> = Vec::new();
    if !encoder.takes_rgb {
        args.extend(["-vf", TO_YUV, "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv"].map(String::from));
    }
    args.extend(["-c:v", encoder.name].map(String::from));
    args.extend(encoder.options.iter().map(|option| option.to_string()));
    let (bits, buffer, key_frames) = (bit_rate.to_string(), (bit_rate / 4).to_string(), (fps * 2).to_string());
    args.extend(["-b:v", &bits, "-maxrate", &bits, "-bufsize", &buffer, "-g", &key_frames, "-bf", "0", "-fps_mode", "passthrough"].map(String::from));
    args
}

/** Whether this PC can encode with "encoder" at this size: FFmpeg encodes two black frames, and the result is thrown away. */
fn can_encode(ffmpeg: &Path, encoder: &Encoder, width: u32, height: u32, fps: u32, bit_rate: u32) -> bool {
    let source = format!("color=black:size={width}x{height}:rate={fps},format=rgb0");
    let mut command = Command::new(ffmpeg);
    command
        .args(["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", &source, "-frames:v", "2"])
        .args(encoder_args(encoder, fps, bit_rate))
        .args(["-f", "null", "-"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(NO_WINDOW);
    }
    command.status().is_ok_and(|status| status.success())
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
    /** The connection of the open stream, for the sound: a frame that waits for FFmpeg keeps "open" locked, and the sound must not wait for it. */
    sound: Mutex<Option<Arc<Mutex<TcpStream>>>>,
    /** The encoder that worked (its place in ENCODERS), found at the first stream. */
    encoder: Mutex<Option<usize>>,
}

/** Windows process flag: no console window. */
#[cfg(windows)]
const NO_WINDOW: u32 = 0x0800_0000;

/** The size of the stream's frames, and their rate, for the "config" message. */
#[derive(Clone, Copy)]
struct Picture {
    width: u32,
    height: u32,
    fps: u32,
}

/**
 * Reads FFmpeg's FLV output and sends each frame to the receiver. Ends
 * when FFmpeg or the receiver closes. FLV is a file head of 13 bytes, then
 * tags: 11 bytes (the kind, 9 for video, and the length of the data in
 * bytes 1 to 3), the data, and 4 bytes that repeat the length. Video data
 * starts with 5 bytes: byte 0 has 1 in its high half for a key frame and 7
 * in its low half for H.264; byte 1 is 0 for the decoder's settings (they
 * come one time, before the first frame, and go to the receiver in the
 * "config" message) and 1 for a frame.
 */
fn forward(mut output: impl Read, receiver: Arc<Mutex<TcpStream>>, times: Arc<Mutex<VecDeque<f64>>>, gone: Arc<AtomicBool>, picture: Picture) {
    let mut file_head = [0u8; 13];
    if output.read_exact(&mut file_head).is_err() {
        return;
    }
    let mut number: u32 = 0;
    let mut head = [0u8; 11];
    let mut data = Vec::new();
    let mut content = Vec::new();
    while output.read_exact(&mut head).is_ok() {
        let size = u32::from_be_bytes([0, head[1], head[2], head[3]]) as usize;
        data.resize(size + 4, 0);
        if output.read_exact(&mut data).is_err() {
            return;
        }
        if head[0] & 0x1f != 9 || size < 5 || data[0] & 0x0f != 7 {
            continue;
        }
        let payload = &data[5..size];
        let sent = match data[1] {
            0 if payload.len() >= 4 => {
                let Picture { width, height, fps } = picture;
                let config = format!(
                    r#"{{"type":"config","codec":"avc1.{:02x}{:02x}{:02x}","width":{width},"height":{height},"fps":{fps},"description":"{}"}}"#,
                    payload[1],
                    payload[2],
                    payload[3],
                    base64::engine::general_purpose::STANDARD.encode(payload)
                );
                receiver.lock().map(|mut receiver| write_message(&mut *receiver, TEXT, config.as_bytes()))
            }
            1 => {
                let taken = times.lock().ok().and_then(|mut times| times.pop_front()).unwrap_or(0.0);
                content.clear();
                content.resize(16, 0);
                content[0] = if data[0] >> 4 == 1 { 1 } else { 2 };
                content[4..8].copy_from_slice(&number.to_be_bytes());
                content[8..16].copy_from_slice(&taken.to_be_bytes());
                content.extend_from_slice(payload);
                number = number.wrapping_add(1);
                receiver.lock().map(|mut receiver| write_message(&mut *receiver, FRAME, &content))
            }
            _ => continue,
        };
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
 * "encoder" is for tests: the name of one of ENCODERS to use, with no trial.
 */
#[tauri::command(async)]
pub fn cast_stream_begin(window: WebviewWindow, streams: State<'_, CastStreams>, target: String, fps: u32, bit_rate: u32, max_height: u32, encoder: Option<String>) -> Result<StreamInfo, String> {
    let mut open = streams.open.lock().map_err(|_| "The stream is unavailable")?;
    if let Some(old) = open.take() {
        if let Ok(mut sound) = streams.sound.lock() {
            *sound = None;
        }
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
    if hello.protocol != PROTOCOL {
        return Err(format!("{} has another version of Kaleido Sage. Update Kaleido Sage on both PCs.", hello.name));
    }
    /* The encoder needs even sizes. */
    let (screen_width, screen_height) = (hello.width.clamp(320, 7680), hello.height.clamp(240, 4320));
    let height = screen_height.min(max_height.clamp(240, 2160));
    let width = ((screen_width as u64 * height as u64 + screen_height as u64 / 2) / screen_height as u64) as u32;
    let (width, height) = (width.clamp(320, 3840) & !1, height & !1);
    /* The encoder: the one a test names, else the one that worked before, else the first that can encode at this size. */
    let chosen = match &encoder {
        Some(name) => ENCODERS.iter().position(|encoder| encoder.name == name).ok_or(format!("There is no encoder {name}"))?,
        None => {
            let mut kept = streams.encoder.lock().map_err(|_| "The stream is unavailable")?;
            match *kept {
                Some(chosen) => chosen,
                None => {
                    let found = ENCODERS.iter().position(|encoder| can_encode(&ffmpeg, encoder, width, height, fps, bit_rate)).ok_or("No video encoder works on this PC, also not the processor's.")?;
                    *kept = Some(found);
                    found
                }
            }
        }
    };
    let chosen = &ENCODERS[chosen];

    let (size, rate) = (format!("{width}x{height}"), fps.to_string());
    let mut command = Command::new(ffmpeg);
    command
        .args(["-hide_banner", "-loglevel", "error", "-fflags", "nobuffer", "-f", "rawvideo", "-pixel_format", "rgb0", "-video_size", &size, "-framerate", &rate, "-i", "pipe:0"])
        .args(encoder_args(chosen, fps, bit_rate))
        .args(["-f", "flv", "-flvflags", "no_duration_filesize", "-flush_packets", "1", "pipe:1"])
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
    let for_sound = writing.clone();
    let mut threads = Vec::new();
    if let Some(output) = child.stdout.take() {
        let (writing, times, gone) = (writing.clone(), times.clone(), gone.clone());
        let picture = Picture { width, height, fps };
        threads.push(std::thread::spawn(move || forward(output, writing, times, gone, picture)));
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
    if let Ok(mut sound) = streams.sound.lock() {
        *sound = Some(for_sound);
    }
    Ok(StreamInfo { name: hello.name, width, height, encoder: chosen.runs_on })
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

/** Sends one block of the app's music to the receiver: the raw request body is the content of an AUDIO message. With no stream, it does nothing. */
#[tauri::command(async)]
pub fn cast_stream_audio(streams: State<'_, CastStreams>, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(content) = request.body() else {
        return Err("The sound data is missing".into());
    };
    let receiver = streams.sound.lock().map_err(|_| "The stream is unavailable")?.clone();
    if let Some(receiver) = receiver {
        if let Ok(mut receiver) = receiver.lock() {
            let _ = write_message(&mut *receiver, AUDIO, content);
        }
    }
    Ok(())
}

/** Ends the stream. Returns FFmpeg's error text, empty when all went well. */
#[tauri::command(async)]
pub fn cast_stream_end(streams: State<'_, CastStreams>) -> Result<String, String> {
    if let Ok(mut sound) = streams.sound.lock() {
        *sound = None;
    }
    let stream = streams.open.lock().map_err(|_| "The stream is unavailable")?.take();
    Ok(stream.map(OpenStream::close).unwrap_or_default())
}
