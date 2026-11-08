use std::{
    collections::HashMap,
    fs::OpenOptions,
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, ExitStatus, Stdio},
    sync::{
        atomic::{AtomicU32, Ordering},
        Mutex,
    },
    thread::JoinHandle,
};
use tauri::{
    ipc::{InvokeBody, Request},
    path::BaseDirectory,
    Manager, State, WebviewWindow,
};

/** Windows process flags: no console window, and the app and its picture stay ahead of the encoder for the processor. */
#[cfg(windows)]
const PROCESS_FLAGS: u32 = 0x0800_0000 | 0x0000_4000;

/** The largest video side, in pixels. */
const MAX_SIDE: u32 = 8192;

struct VideoSettings<'a> {
    width: u32,
    height: u32,
    fps: u32,
    quality: &'a str,
    spherical: bool,
    /** A sound file that the video carries, or None. */
    audio: Option<&'a str>,
}

/**
 * The webview's shared memory object. It is held only to keep the memory,
 * and must be released on the window's thread (see SharedFrame's drop). The
 * window calls stay out of the test build, because a test program has no
 * manifest for the Windows libraries that they load.
 */
#[cfg(all(windows, not(test)))]
#[allow(dead_code)]
struct ComBuffer(webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2SharedBuffer);
#[cfg(all(windows, not(test)))]
unsafe impl Send for ComBuffer {}

/**
 * One frame of memory that the webview and the app share. Sending a 4K frame
 * through the normal call to the app takes about 270 ms, because the webview
 * copies all of its 33 MB. With this memory, the page writes the pixels into
 * it and only says that a frame is ready.
 */
#[cfg(all(windows, not(test)))]
struct SharedFrame {
    app: tauri::AppHandle,
    buffer: Option<ComBuffer>,
    data: *const u8,
    bytes: usize,
}
#[cfg(all(windows, not(test)))]
unsafe impl Send for SharedFrame {}

#[cfg(all(windows, not(test)))]
impl Drop for SharedFrame {
    fn drop(&mut self) {
        if let Some(buffer) = self.buffer.take() {
            let _ = self.app.run_on_main_thread(move || drop(buffer));
        }
    }
}

#[cfg(any(not(windows), test))]
struct SharedFrame {
    data: *const u8,
    bytes: usize,
}
#[cfg(any(not(windows), test))]
unsafe impl Send for SharedFrame {}

/** Makes a shared frame and gives it to the page, which gets a "sharedbufferreceived" event. None when this webview cannot do it: the frames then go the slow way. */
#[cfg(all(windows, not(test)))]
fn share_frame(window: &WebviewWindow, bytes: usize) -> Option<SharedFrame> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Environment12, ICoreWebView2_17, COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_WRITE};
    use windows_core::{Interface, PCWSTR};
    let (sender, receiver) = std::sync::mpsc::channel();
    window
        .with_webview(move |webview| {
            let made = (|| -> windows_core::Result<(ComBuffer, usize)> {
                unsafe {
                    let environment: ICoreWebView2Environment12 = webview.environment().cast()?;
                    let buffer = environment.CreateSharedBuffer(bytes as u64)?;
                    let mut data = std::ptr::null_mut();
                    buffer.Buffer(&mut data)?;
                    let core: ICoreWebView2_17 = webview.controller().CoreWebView2()?.cast()?;
                    core.PostSharedBufferToScript(&buffer, COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_WRITE, PCWSTR::null())?;
                    Ok((ComBuffer(buffer), data as usize))
                }
            })();
            let _ = sender.send(made);
        })
        .ok()?;
    match receiver.recv().ok()? {
        Ok((buffer, data)) => Some(SharedFrame { app: window.app_handle().clone(), buffer: Some(buffer), data: data as *const u8, bytes }),
        Err(error) => {
            eprintln!("Could not share memory with the page: {error}");
            None
        }
    }
}

#[cfg(any(not(windows), test))]
fn share_frame(_window: &WebviewWindow, _bytes: usize) -> Option<SharedFrame> {
    None
}

struct OpenExport {
    shared: Option<SharedFrame>,
    target: PathBuf,
    part: PathBuf,
    child: Child,
    stdin: Option<ChildStdin>,
    errors: Option<JoinHandle<Vec<u8>>>,
    frame_bytes: usize,
    spherical: bool,
}

impl OpenExport {
    /** Ends the input, waits for FFmpeg to stop, and gives its result and its error text. */
    fn close(&mut self) -> Result<(ExitStatus, String), String> {
        drop(self.stdin.take());
        let status = self.child.wait().map_err(|error| format!("Could not finish the video: {error}"))?;
        let errors = self.errors.take().and_then(|errors| errors.join().ok()).unwrap_or_default();
        Ok((status, String::from_utf8_lossy(&errors).trim().to_string()))
    }
}

/**
 * The video exports that are being made, by id. Each one is a separate
 * FFmpeg program: the webview sends each frame as plain pixels, and FFmpeg
 * encodes them and writes the MP4 to "<file>.part". The part file takes the
 * file's name only when the export is complete, so a stopped or failed
 * export leaves no broken video behind. A 360 video gets the mark that makes
 * headset players show it all around the viewer (see tag_spherical).
 */
#[derive(Default)]
pub struct Exports {
    next: AtomicU32,
    open: Mutex<HashMap<u32, OpenExport>>,
}

fn is_video_export(path: &Path) -> bool {
    path.is_absolute() && path.extension().and_then(|extension| extension.to_str()).is_some_and(|extension| extension.eq_ignore_ascii_case("mp4"))
}

/** The part file next to "target": "Clip.mp4" gives "Clip.mp4.part". */
fn part_path(target: &Path) -> PathBuf {
    let mut name = target.as_os_str().to_owned();
    name.push(".part");
    PathBuf::from(name)
}

/** Starts a program with no console window, and below the app in priority. */
fn quiet(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(PROCESS_FLAGS);
    }
    command
}

/**
 * The FFmpeg options after the input, for a quality. Standard and High are
 * H.264 with halved color, which every player opens. Best is H.265 with
 * full color in 10 bits; a 360 video keeps halved color, because headsets
 * cannot decode full color. All are converted with the BT.709 colors that
 * players expect from a video of this size.
 *
 * "gpu" uses the NVIDIA video encoder, about eight times as fast at 4K as
 * x264's slow preset. Its quantizers were measured against the x264 and x265
 * settings on a lossless 4K source, to give the same picture error at about
 * the same file size.
 */
fn encoder_args(quality: &str, fps: u32, spherical: bool, gpu: bool) -> Result<Vec<String>, String> {
    let (format, software, preset, crf, hardware, quantizer) = match (quality, spherical) {
        ("standard", _) => ("yuv420p", "libx264", "medium", "20", "h264_nvenc", "25"),
        ("high", _) => ("yuv420p", "libx264", "slow", "14", "h264_nvenc", "20"),
        ("best", false) => ("yuv444p10le", "libx265", "medium", "12", "hevc_nvenc", "18"),
        ("best", true) => ("yuv420p10le", "libx265", "medium", "12", "hevc_nvenc", "18"),
        _ => return Err(format!("Unknown video quality: {quality}")),
    };
    let filter = format!("scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format={format}");
    let key_frames = (fps * 2).to_string();
    let codec = if gpu { hardware } else { software };
    let mut args: Vec<String> = ["-vf", &filter, "-c:v", codec, "-g", &key_frames, "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv"]
        .iter()
        .map(|arg| arg.to_string())
        .collect();
    if gpu {
        args.extend(["-preset", "p5", "-tune", "hq", "-rc", "constqp", "-qp", quantizer].map(String::from));
    } else {
        args.extend(["-preset", preset, "-crf", crf].map(String::from));
    }
    if codec == "libx265" {
        args.extend(["-x265-params", "log-level=error"].map(String::from));
    }
    if codec == "libx265" || codec == "hevc_nvenc" {
        args.extend(["-tag:v", "hvc1"].map(String::from));
    }
    Ok(args)
}

/** Whether this PC's graphics card can encode with "args" at this size: FFmpeg encodes two black frames, and the result is thrown away. */
fn gpu_can_encode(ffmpeg: &Path, width: u32, height: u32, fps: u32, args: &[String]) -> bool {
    let source = format!("color=black:size={width}x{height}:rate={fps}");
    let mut command = Command::new(ffmpeg);
    command
        .args(["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", &source, "-frames:v", "2"])
        .args(args)
        .args(["-f", "null", "-"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    quiet(&mut command).status().is_ok_and(|status| status.success())
}

impl Exports {
    fn begin(&self, ffmpeg: &Path, path: &str, settings: VideoSettings) -> Result<u32, String> {
        let target = PathBuf::from(path);
        if !is_video_export(&target) {
            return Err("The export path is invalid".into());
        }
        let VideoSettings { width, height, fps, quality, spherical, audio } = settings;
        if width == 0 || height == 0 || width > MAX_SIDE || height > MAX_SIDE || width % 2 != 0 || height % 2 != 0 || !matches!(fps, 30 | 60) {
            return Err(format!("The video size is invalid: {width} x {height}, {fps} frames a second"));
        }
        /* The graphics card's encoder when this PC has one that can make this video, else the processor. */
        let gpu = encoder_args(quality, fps, spherical, true)?;
        let encoder = if gpu_can_encode(ffmpeg, width, height, fps, &gpu) { gpu } else { encoder_args(quality, fps, spherical, false)? };
        let part = part_path(&target);
        let (size, rate) = (format!("{width}x{height}"), fps.to_string());
        let mut command = Command::new(ffmpeg);
        command
            .args(["-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pixel_format", "rgb0", "-video_size", &size, "-framerate", &rate, "-i", "pipe:0"]);
        if let Some(audio) = audio {
            command.arg("-i").arg(audio).args(["-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "320k", "-shortest"]);
        }
        command
            .args(encoder)
            .args(["-f", "mp4"])
            .arg(&part)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        let mut child = quiet(&mut command).spawn().map_err(|error| format!("Could not start FFmpeg: {error}"))?;
        let stdin = child.stdin.take();
        /* A thread empties FFmpeg's error text, so FFmpeg can never wait for room to write it. */
        let errors = child.stderr.take().map(|mut stderr| {
            std::thread::spawn(move || {
                let mut text = Vec::new();
                let _ = stderr.read_to_end(&mut text);
                text
            })
        });
        let frame_bytes = width as usize * height as usize * 4;
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        self.open.lock().map_err(|_| "The export writer is unavailable")?.insert(id, OpenExport { shared: None, target, part, child, stdin, errors, frame_bytes, spherical });
        Ok(id)
    }

    /** Gives FFmpeg one frame. This waits while FFmpeg is busy, so frames never pile up in memory. */
    fn write(&self, id: u32, bytes: &[u8]) -> Result<(), String> {
        let mut open = self.open.lock().map_err(|_| "The export writer is unavailable")?;
        Self::send(&mut open, id, bytes)
    }

    /** Gives FFmpeg the frame that the page wrote into the shared memory. The page waits for this before it writes another. */
    fn write_shared(&self, id: u32) -> Result<(), String> {
        let mut open = self.open.lock().map_err(|_| "The export writer is unavailable")?;
        let export = open.get(&id).ok_or("This export is no longer open")?;
        let shared = export.shared.as_ref().ok_or("This export has no shared memory")?;
        /* The shared memory stays mapped until the export closes, and send ends its use of the frame before it can close the export. */
        let frame = unsafe { std::slice::from_raw_parts(shared.data, shared.bytes) };
        Self::send(&mut open, id, frame)
    }

    fn send(open: &mut HashMap<u32, OpenExport>, id: u32, bytes: &[u8]) -> Result<(), String> {
        let export = open.get_mut(&id).ok_or("This export is no longer open")?;
        if bytes.len() != export.frame_bytes {
            return Err(format!("A video frame has {} bytes, not {}", bytes.len(), export.frame_bytes));
        }
        let Some(stdin) = export.stdin.as_mut() else {
            return Err("This export is no longer open".into());
        };
        let Err(error) = stdin.write_all(bytes) else {
            return Ok(());
        };
        /* FFmpeg stopped by itself: its error text says why. */
        let mut export = open.remove(&id).ok_or("This export is no longer open")?;
        let message = export.close().map(|(_, message)| message).unwrap_or_default();
        let _ = std::fs::remove_file(&export.part);
        Err(if message.is_empty() { format!("FFmpeg stopped: {error}") } else { format!("FFmpeg stopped: {message}") })
    }

    /** Ends the export: the part file becomes the video (it takes the place of a file with that name), or with "discard" it is removed. */
    fn finish(&self, id: u32, discard: bool) -> Result<(), String> {
        let mut export = self.open.lock().map_err(|_| "The export writer is unavailable")?.remove(&id).ok_or("This export is no longer open")?;
        if discard {
            let _ = export.child.kill();
            let _ = export.close();
            let _ = std::fs::remove_file(&export.part);
            return Ok(());
        }
        let (status, message) = export.close()?;
        if !status.success() {
            let _ = std::fs::remove_file(&export.part);
            return Err(format!("FFmpeg could not finish the video: {message}"));
        }
        /* Without the mark the video still plays, flat, so a file the mark does not fit is kept as it is. */
        if export.spherical {
            let tagged = OpenOptions::new().read(true).write(true).open(&export.part).and_then(|mut file| tag_spherical(&mut file).and_then(|()| file.sync_all()));
            if let Err(error) = tagged {
                eprintln!("Could not mark {} as a 360 video: {error}", export.target.display());
            }
        }
        std::fs::rename(&export.part, &export.target).map_err(|error| format!("Could not save {}: {error}", export.target.display()))
    }
}

/**
 * A path in "folder" for each of "names" that no file has yet, and that no
 * other name takes: "Clip.mp4", then "Clip (2).mp4". So an export of several
 * videos never replaces a file. Windows file names ignore case.
 */
fn free_paths(folder: &Path, names: &[String], exists: impl Fn(&Path) -> bool) -> Vec<PathBuf> {
    let mut taken = std::collections::HashSet::new();
    names
        .iter()
        .map(|name| {
            let (stem, extension) = name.rsplit_once('.').unwrap_or((name, "mp4"));
            let mut candidate = name.clone();
            let mut number = 2;
            while exists(&folder.join(&candidate)) || !taken.insert(candidate.to_lowercase()) {
                candidate = format!("{stem} ({number}).{extension}");
                number += 1;
            }
            folder.join(candidate)
        })
        .collect()
}

/** See free_paths. */
#[tauri::command]
pub fn free_export_paths(folder: String, names: Vec<String>) -> Result<Vec<PathBuf>, String> {
    let folder = PathBuf::from(folder);
    if !folder.is_absolute() {
        return Err("The export folder is invalid".into());
    }
    Ok(free_paths(&folder, &names, Path::exists))
}

/** Starts a video export to "path" (an .mp4): returns its id for write_export and finish_export. "spherical" marks it as a 360 video. */
#[tauri::command(async)]
#[allow(clippy::too_many_arguments)]
pub fn begin_export(window: WebviewWindow, exports: State<'_, Exports>, path: String, width: u32, height: u32, fps: u32, quality: String, spherical: bool, audio: Option<String>) -> Result<u32, String> {
    let ffmpeg = window.path().resolve("ffmpeg/ffmpeg.exe", BaseDirectory::Resource).map_err(|error| format!("Could not find FFmpeg: {error}"))?;
    let id = exports.begin(&ffmpeg, &path, VideoSettings { width, height, fps, quality: &quality, spherical, audio: audio.as_deref() })?;
    if let Some(shared) = share_frame(&window, width as usize * height as usize * 4) {
        if let Some(export) = exports.open.lock().map_err(|_| "The export writer is unavailable")?.get_mut(&id) {
            export.shared = Some(shared);
        }
    }
    Ok(id)
}

/** Gives FFmpeg the frame in the shared memory (see SharedFrame). It can wait for FFmpeg, so it stays off the window's thread. */
#[tauri::command(async)]
pub fn write_shared_frame(exports: State<'_, Exports>, id: u32) -> Result<(), String> {
    exports.write_shared(id)
}

/** Gives FFmpeg one frame: the raw request body, for the export in the "export-id" header. It can wait for FFmpeg, so it stays off the window's thread. */
#[tauri::command(async)]
pub fn write_export(exports: State<'_, Exports>, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("The export data is missing".into());
    };
    let id = request.headers().get("export-id").and_then(|value| value.to_str().ok()).ok_or("The export-id header is missing")?;
    exports.write(id.parse::<u32>().map_err(|error| error.to_string())?, bytes)
}

/** Waits for FFmpeg to finish, so it stays off the window's thread. */
#[tauri::command(async)]
pub fn finish_export(exports: State<'_, Exports>, id: u32, discard: bool) -> Result<(), String> {
    exports.finish(id, discard)
}

/** The id of the Spherical Video V1 box (Google's spatial media format), which headset players such as the Quest's read. */
const SPHERICAL_UUID: [u8; 16] = [0xff, 0xcc, 0x82, 0x63, 0xf8, 0x55, 0x4a, 0x93, 0x88, 0x14, 0x58, 0x7a, 0x02, 0x52, 0x1f, 0xdd];
const SPHERICAL_XML: &str = concat!(
    r#"<?xml version="1.0"?><rdf:SphericalVideo xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:GSpherical="http://ns.google.com/videos/1.0/spherical/">"#,
    "<GSpherical:Spherical>true</GSpherical:Spherical>",
    "<GSpherical:Stitched>true</GSpherical:Stitched>",
    "<GSpherical:StitchingSoftware>Kaleido Sage</GSpherical:StitchingSoftware>",
    "<GSpherical:ProjectionType>equirectangular</GSpherical:ProjectionType>",
    "</rdf:SphericalVideo>"
);

fn invalid(message: &str) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::InvalidData, message.to_string())
}

/** The size of the box with a 32-bit size at "at" in "bytes". */
fn box_size(bytes: &[u8], at: usize) -> Option<usize> {
    bytes.get(at..at + 4).map(|size| u32::from_be_bytes(size.try_into().unwrap()) as usize)
}

/**
 * Marks an MP4 as a 360 equirectangular video: adds the Spherical Video V1
 * box at the end of its first track. The muxer writes the index ("moov")
 * last, so it can grow in place: nothing after it moves, and no offset in
 * the file points into it. A file laid out in any other way is left as it is.
 */
fn tag_spherical<F: Read + Write + Seek>(file: &mut F) -> std::io::Result<()> {
    let end = file.seek(SeekFrom::End(0))?;
    let mut offset = 0;
    let mut moov = None;
    while offset + 8 <= end {
        file.seek(SeekFrom::Start(offset))?;
        let mut header = [0u8; 16];
        file.read_exact(&mut header[..8])?;
        let mut size = u64::from(u32::from_be_bytes(header[0..4].try_into().unwrap()));
        if size == 1 {
            file.read_exact(&mut header[8..16])?;
            size = u64::from_be_bytes(header[8..16].try_into().unwrap());
        } else if size == 0 {
            size = end - offset;
        }
        if size < 8 || offset + size > end {
            return Err(invalid("a box runs past the end of the file"));
        }
        if &header[4..8] == b"moov" {
            moov = Some((offset, size));
        }
        offset += size;
    }
    let (start, size) = moov.ok_or_else(|| invalid("the file has no index"))?;
    if start + size != end {
        return Err(invalid("the index is not at the end of the file"));
    }
    let mut moov = vec![0u8; size as usize];
    file.seek(SeekFrom::Start(start))?;
    file.read_exact(&mut moov)?;
    if box_size(&moov, 0) != Some(moov.len()) {
        return Err(invalid("the index has a 64-bit size"));
    }
    let mut child = 8;
    let (trak, trak_size) = loop {
        let child_size = box_size(&moov, child)
            .filter(|&child_size| child_size >= 8 && child + child_size <= moov.len())
            .ok_or_else(|| invalid("the index has no track"))?;
        if &moov[child + 4..child + 8] == b"trak" {
            break (child, child_size);
        }
        child += child_size;
    };
    let mut tag = Vec::with_capacity(24 + SPHERICAL_XML.len());
    tag.extend_from_slice(&((24 + SPHERICAL_XML.len()) as u32).to_be_bytes());
    tag.extend_from_slice(b"uuid");
    tag.extend_from_slice(&SPHERICAL_UUID);
    tag.extend_from_slice(SPHERICAL_XML.as_bytes());
    let grown = |at: usize, old: usize| u32::try_from(old + tag.len()).map(|new| (at, new)).map_err(|_| invalid("the index is too large"));
    let sizes = [grown(trak, trak_size)?, grown(0, moov.len())?];
    moov.splice(trak + trak_size..trak + trak_size, tag.iter().copied());
    for (at, new) in sizes {
        moov[at..at + 4].copy_from_slice(&new.to_be_bytes());
    }
    file.seek(SeekFrom::Start(start))?;
    file.write_all(&moov)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings(quality: &str, spherical: bool) -> VideoSettings<'_> {
        VideoSettings { width: 64, height: 64, fps: 30, quality, spherical, audio: None }
    }

    #[test]
    fn refuses_other_paths_and_sizes() {
        let exports = Exports::default();
        let ffmpeg = Path::new("ffmpeg.exe");
        assert!(exports.begin(ffmpeg, "relative.mp4", settings("high", false)).is_err());
        assert!(exports.begin(ffmpeg, r"C:\Videos\clip.png", settings("high", false)).is_err());
        let odd = VideoSettings { width: 63, ..settings("high", false) };
        assert!(exports.begin(ffmpeg, r"C:\Videos\clip.mp4", odd).is_err());
        assert!(exports.begin(ffmpeg, r"C:\Videos\clip.mp4", settings("unknown", false)).is_err());
    }

    #[test]
    fn only_a_flat_best_video_keeps_full_color() {
        let format = |quality, spherical| encoder_args(quality, 60, spherical, false).unwrap()[1].clone();
        assert!(format("standard", false).ends_with("format=yuv420p"));
        assert!(format("high", false).ends_with("format=yuv420p"));
        assert!(format("best", false).ends_with("format=yuv444p10le"));
        assert!(format("best", true).ends_with("format=yuv420p10le"));
    }

    #[test]
    fn free_paths_never_reuse_a_name_or_a_file() {
        let names = ["A.mp4", "a.mp4", "B.mp4"].map(String::from);
        let exists = |path: &Path| path.ends_with("B.mp4") || path.ends_with("a (2).mp4");
        let paths = free_paths(Path::new("C:/out"), &names, exists);
        let got: Vec<_> = paths.iter().map(|path| path.file_name().unwrap().to_str().unwrap()).collect();
        assert_eq!(got, ["A.mp4", "a (3).mp4", "B (2).mp4"]);
    }

    #[test]
    fn the_gpu_encoder_keeps_the_codec_of_its_quality() {
        let codec = |quality| {
            let args = encoder_args(quality, 60, false, true).unwrap();
            args[args.iter().position(|arg| arg == "-c:v").unwrap() + 1].clone()
        };
        assert_eq!(codec("standard"), "h264_nvenc");
        assert_eq!(codec("high"), "h264_nvenc");
        assert_eq!(codec("best"), "hevc_nvenc");
    }

    fn real_ffmpeg() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("ffmpeg/ffmpeg.exe")
    }

    /** One 64 by 64 frame of a single color. The fourth byte of each pixel is not used. */
    fn solid_frame(red: u8, green: u8, blue: u8) -> Vec<u8> {
        [red, green, blue, 0].repeat(64 * 64)
    }

    /** Makes a video of each quality at this size, and checks a decoded pixel's color. */
    fn check_colors(side: u32) {
        let folder = tempfile::tempdir().unwrap();
        let pixels = side as usize * side as usize;
        for quality in ["standard", "high", "best"] {
            let exports = Exports::default();
            let path = folder.path().join(format!("{quality}.mp4"));
            let id = exports.begin(&real_ffmpeg(), path.to_str().unwrap(), VideoSettings { width: side, height: side, ..settings(quality, false) }).unwrap();
            for _ in 0..30 {
                exports.write(id, &[200, 40, 90, 0].repeat(pixels)).unwrap();
            }
            assert!(!path.exists());
            exports.finish(id, false).unwrap();
            assert!(path.exists() && !part_path(&path).exists());
            let decoded = Command::new(real_ffmpeg()).args(["-v", "error", "-i"]).arg(&path).args(["-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]).output().unwrap().stdout;
            assert_eq!(decoded.len(), pixels * 3);
            for (got, want) in decoded[..3].iter().zip([200i32, 40, 90]) {
                assert!((i32::from(*got) - want).abs() <= 3, "{quality} at {side}: {:?}", &decoded[..3]);
            }
        }
    }

    /** NVENC refuses a frame this small, so this also proves the fallback to the processor. */
    #[test]
    #[ignore = "needs src-tauri/ffmpeg/ffmpeg.exe"]
    fn the_processor_encoders_give_the_right_colors() {
        let args = encoder_args("high", 30, false, true).unwrap();
        assert!(!gpu_can_encode(&real_ffmpeg(), 64, 64, 30, &args));
        check_colors(64);
    }

    #[test]
    #[ignore = "needs src-tauri/ffmpeg/ffmpeg.exe and an NVIDIA graphics card"]
    fn the_gpu_encoders_give_the_right_colors() {
        for quality in ["standard", "high", "best"] {
            let args = encoder_args(quality, 30, false, true).unwrap();
            assert!(gpu_can_encode(&real_ffmpeg(), 256, 256, 30, &args), "{quality}");
        }
        check_colors(256);
    }

    #[test]
    #[ignore = "needs src-tauri/ffmpeg/ffmpeg.exe"]
    fn a_spherical_video_gets_its_mark() {
        let folder = tempfile::tempdir().unwrap();
        let exports = Exports::default();
        let path = folder.path().join("sphere.mp4");
        let id = exports.begin(&real_ffmpeg(), path.to_str().unwrap(), settings("high", true)).unwrap();
        exports.write(id, &solid_frame(10, 20, 30)).unwrap();
        exports.finish(id, false).unwrap();
        let bytes = std::fs::read(&path).unwrap();
        assert!(bytes.windows(SPHERICAL_UUID.len()).any(|window| window == SPHERICAL_UUID));
    }

    #[test]
    #[ignore = "needs src-tauri/ffmpeg/ffmpeg.exe"]
    fn a_song_video_carries_the_sound() {
        let folder = tempfile::tempdir().unwrap();
        let sound = folder.path().join("song.wav");
        let made = Command::new(real_ffmpeg()).args(["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1"]).arg(&sound).status().unwrap();
        assert!(made.success());
        let exports = Exports::default();
        let path = folder.path().join("song.mp4");
        let id = exports.begin(&real_ffmpeg(), path.to_str().unwrap(), VideoSettings { audio: sound.to_str(), ..settings("high", false) }).unwrap();
        for _ in 0..30 {
            exports.write(id, &solid_frame(10, 20, 30)).unwrap();
        }
        exports.finish(id, false).unwrap();
        let probe = Command::new(real_ffmpeg()).arg("-hide_banner").arg("-i").arg(&path).output().unwrap();
        let text = String::from_utf8_lossy(&probe.stderr);
        assert!(text.contains("Audio: aac") && text.contains("Video: h264"), "{text}");
    }

    #[test]
    #[ignore = "needs src-tauri/ffmpeg/ffmpeg.exe"]
    fn a_stopped_export_leaves_no_file() {
        let folder = tempfile::tempdir().unwrap();
        let exports = Exports::default();
        let path = folder.path().join("stopped.mp4");
        let id = exports.begin(&real_ffmpeg(), path.to_str().unwrap(), settings("high", false)).unwrap();
        exports.write(id, &solid_frame(1, 2, 3)).unwrap();
        assert!(exports.write(id, &[0; 8]).is_err());
        exports.finish(id, true).unwrap();
        assert!(!path.exists() && !part_path(&path).exists());
    }

    /** A box with a 32-bit size. */
    fn mp4_box(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
        let mut bytes = ((8 + body.len()) as u32).to_be_bytes().to_vec();
        bytes.extend_from_slice(kind);
        bytes.extend_from_slice(body);
        bytes
    }

    #[test]
    fn marks_the_first_track_of_an_index_at_the_end() {
        let trak = mp4_box(b"trak", &mp4_box(b"tkhd", &[1; 12]));
        let mvhd = mp4_box(b"mvhd", &[2; 20]);
        let moov = mp4_box(b"moov", &[mvhd.clone(), trak.clone()].concat());
        let head = [mp4_box(b"ftyp", b"isom"), mp4_box(b"mdat", &[3; 40])].concat();
        let mut file = std::io::Cursor::new([head.clone(), moov].concat());
        tag_spherical(&mut file).unwrap();
        let bytes = file.into_inner();
        assert_eq!(&bytes[..head.len()], &head[..]);
        let moov = &bytes[head.len()..];
        assert_eq!(box_size(moov, 0), Some(moov.len()));
        let trak_at = 8 + mvhd.len();
        assert_eq!(&moov[8..trak_at], &mvhd[..]);
        assert_eq!(&moov[trak_at + 4..trak_at + 8], b"trak");
        assert_eq!(trak_at + box_size(moov, trak_at).unwrap(), moov.len());
        assert_eq!(&moov[trak_at + 8..trak_at + trak.len()], &trak[8..]);
        let tag = &moov[trak_at + trak.len()..];
        assert_eq!(box_size(tag, 0), Some(tag.len()));
        assert_eq!(&tag[4..8], b"uuid");
        assert_eq!(&tag[8..24], &SPHERICAL_UUID);
        assert_eq!(std::str::from_utf8(&tag[24..]).unwrap(), SPHERICAL_XML);
    }

    #[test]
    fn leaves_a_file_with_the_index_first_as_it_is() {
        let moov = mp4_box(b"moov", &mp4_box(b"trak", &[1; 8]));
        let original = [mp4_box(b"ftyp", b"isom"), moov, mp4_box(b"mdat", &[3; 40])].concat();
        let mut file = std::io::Cursor::new(original.clone());
        assert!(tag_spherical(&mut file).is_err());
        assert_eq!(file.into_inner(), original);
    }
}
