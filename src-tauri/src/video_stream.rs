//! Bounded video reads. Neither whole videos nor archive media cross the IPC bridge.
use serde::Serialize;
use std::{
    collections::HashMap,
    fs::File,
    io::{self, Read},
    path::Path,
    sync::{Arc, Mutex},
};
use tauri::{
    http::{Request, Response},
    Manager,
};

pub const CHUNK_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Clone)]
pub struct VideoSource {
    pub file: Arc<File>,
    pub offset: u64,
    pub len: u64,
    pub mime: String,
}

impl VideoSource {
    /** A video file, or an audio file for the playlist: both stream through the video:// protocol. */
    pub fn open(path: &Path) -> Result<Self, String> {
        if !crate::files::is_video_path(path) && !crate::files::is_audio_path(path) {
            return Err("This file is not an accepted video or audio file.".into());
        }
        let file = File::open(path).map_err(|e| format!("Could not open the video: {e}"))?;
        let metadata = file.metadata().map_err(|e| e.to_string())?;
        if !metadata.is_file() {
            return Err("The selected video is not a file.".into());
        }
        let mime = match path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str()
        {
            "webm" => "video/webm",
            "mov" => "video/quicktime",
            "avi" => "video/x-msvideo",
            "mp3" => "audio/mpeg",
            "wav" => "audio/wav",
            "flac" => "audio/flac",
            "ogg" | "opus" => "audio/ogg",
            "m4a" | "aac" => "audio/mp4",
            _ => "video/mp4",
        };
        Ok(Self {
            file: Arc::new(file),
            offset: 0,
            len: metadata.len(),
            mime: mime.into(),
        })
    }

    pub fn reader(&self) -> SourceReader {
        SourceReader {
            source: self.clone(),
            position: 0,
        }
    }
}

pub struct SourceReader {
    source: VideoSource,
    position: u64,
}
impl Read for SourceReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let count = (self.source.len - self.position).min(buf.len() as u64) as usize;
        if count == 0 {
            return Ok(0);
        }
        let at = self
            .source
            .offset
            .checked_add(self.position)
            .ok_or_else(|| io::Error::other("Invalid media offset"))?;
        // Positional reads let playback, previews and Save read the same file independently.
        #[cfg(windows)]
        let read = {
            use std::os::windows::fs::FileExt;
            self.source.file.seek_read(&mut buf[..count], at)?
        };
        #[cfg(unix)]
        let read = {
            use std::os::unix::fs::FileExt;
            self.source.file.read_at(&mut buf[..count], at)?
        };
        if read == 0 {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "The video file was truncated",
            ));
        }
        self.position += read as u64;
        Ok(read)
    }
}

#[derive(Default)]
pub struct Videos(Mutex<HashMap<String, VideoSource>>);
#[derive(Serialize)]
pub struct VideoInfo {
    pub id: String,
    pub mime: String,
}
impl Videos {
    pub fn add(&self, source: VideoSource) -> Result<VideoInfo, String> {
        let mut entries = self
            .0
            .lock()
            .map_err(|_| "The video reader is unavailable")?;
        let id = (entries.len() + 1).to_string();
        let mime = source.mime.clone();
        entries.insert(id.clone(), source);
        Ok(VideoInfo { id, mime })
    }
    pub fn get(&self, id: &str) -> Result<VideoSource, String> {
        self.0
            .lock()
            .map_err(|_| "The video reader is unavailable")?
            .get(id)
            .cloned()
            .ok_or_else(|| "This video is no longer open.".into())
    }
}

#[tauri::command]
pub async fn open_video_file(app: tauri::AppHandle, path: String) -> Result<VideoInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Videos>()
            .add(VideoSource::open(Path::new(&path))?)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Default)]
pub struct Uploads(Mutex<HashMap<String, (File, String)>>);
static NEXT_UPLOAD: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

#[tauri::command]
pub fn begin_video_upload(app: tauri::AppHandle, mime: String) -> Result<String, String> {
    if !mime.starts_with("video/") {
        return Err("Invalid video type".into());
    }
    let id = NEXT_UPLOAD
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        .to_string();
    let file = tempfile::tempfile().map_err(|e| e.to_string())?;
    app.state::<Uploads>()
        .0
        .lock()
        .map_err(|_| "Upload unavailable")?
        .insert(id.clone(), (file, mime));
    Ok(id)
}

#[tauri::command]
pub fn append_video_upload(
    app: tauri::AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    use std::io::Write;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Video data is missing".into());
    };
    if bytes.len() as u64 > CHUNK_BYTES {
        return Err("Video upload chunk is too large".into());
    }
    let id = request
        .headers()
        .get("video-id")
        .and_then(|v| v.to_str().ok())
        .ok_or("Video id is missing")?;
    let offset = request
        .headers()
        .get("offset")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .ok_or("Video offset is missing")?;
    let uploads = app.state::<Uploads>();
    let mut uploads = uploads.0.lock().map_err(|_| "Upload unavailable")?;
    let (file, _) = uploads.get_mut(id).ok_or("Video upload is missing")?;
    if file.metadata().map_err(|e| e.to_string())?.len() != offset {
        return Err("Video chunks arrived out of order".into());
    }
    file.write_all(bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn finish_video_upload(
    app: tauri::AppHandle,
    id: String,
    discard: bool,
) -> Result<Option<VideoInfo>, String> {
    let (file, mime) = app
        .state::<Uploads>()
        .0
        .lock()
        .map_err(|_| "Upload unavailable")?
        .remove(&id)
        .ok_or("Video upload is missing")?;
    if discard {
        return Ok(None);
    }
    let len = file.metadata().map_err(|e| e.to_string())?.len();
    app.state::<Videos>()
        .add(VideoSource {
            file: Arc::new(file),
            offset: 0,
            len,
            mime,
        })
        .map(Some)
}

// End is inclusive. All sizes and offsets remain u64, including beyond 4 GiB.
fn byte_range(header: Option<&str>, len: u64) -> Option<(u64, u64)> {
    if len == 0 {
        return None;
    }
    let (start, end) = if let Some(header) = header {
        let (first, last) = header.strip_prefix("bytes=")?.split_once('-')?;
        if first.is_empty() {
            let suffix = last.parse::<u64>().ok()?;
            if suffix == 0 {
                return None;
            }
            (len.saturating_sub(suffix), len - 1)
        } else {
            let start = first.parse::<u64>().ok()?;
            let end = if last.is_empty() {
                len - 1
            } else {
                last.parse::<u64>().ok()?.min(len - 1)
            };
            (start, end)
        }
    } else {
        (0, len - 1)
    };
    if start >= len || end < start {
        return None;
    }
    Some((start, end.min(start.saturating_add(CHUNK_BYTES - 1))))
}

pub fn response(
    request: Request<Vec<u8>>,
    source: Result<VideoSource, String>,
) -> Response<Vec<u8>> {
    let base = || {
        Response::builder()
            .header("Access-Control-Allow-Origin", "*")
            .header(
                "Access-Control-Expose-Headers",
                "Content-Range, Content-Length, Accept-Ranges",
            )
            .header("Accept-Ranges", "bytes")
            .header("Cache-Control", "no-store")
    };
    let Ok(source) = source else {
        return base().status(404).body(vec![]).unwrap();
    };
    if request.method() == "HEAD" {
        return base()
            .header("Content-Type", &source.mime)
            .header("Content-Length", source.len)
            .body(vec![])
            .unwrap();
    }
    if request.method() != "GET" {
        return base().status(405).body(vec![]).unwrap();
    }
    let Some((start, end)) = byte_range(
        request.headers().get("range").and_then(|v| v.to_str().ok()),
        source.len,
    ) else {
        return base()
            .status(416)
            .header("Content-Range", format!("bytes */{}", source.len))
            .body(vec![])
            .unwrap();
    };
    let mut reader = source.reader();
    reader.position = start;
    let mut bytes = vec![0; (end - start + 1) as usize];
    if reader.read_exact(&mut bytes).is_err() {
        return base().status(500).body(vec![]).unwrap();
    }
    // Even a missing Range header gets a bounded first chunk, never a whole-file read.
    base()
        .status(206)
        .header("Content-Type", &source.mime)
        .header("Content-Length", bytes.len())
        .header(
            "Content-Range",
            format!("bytes {start}-{end}/{}", source.len),
        )
        .body(bytes)
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    #[test]
    fn ranges_work_beyond_four_gib_and_are_bounded() {
        let len = 6 * 1024 * 1024 * 1024;
        assert_eq!(byte_range(None, len), Some((0, CHUNK_BYTES - 1)));
        assert_eq!(
            byte_range(Some("bytes=4294967296-"), len),
            Some((4294967296, 4294967296 + CHUNK_BYTES - 1))
        );
        assert_eq!(
            byte_range(Some("bytes=-10"), len),
            Some((len - 10, len - 1))
        );
        assert_eq!(byte_range(Some("bytes=1-3"), len), Some((1, 3)));
        for range in [
            "bytes=9-1",
            "bytes=-0",
            "bytes=99999999999-",
            "bytes=0-1,3-4",
            "bad",
        ] {
            assert_eq!(byte_range(Some(range), len), None);
        }
    }
    #[test]
    fn an_unbounded_request_never_reads_the_whole_file() {
        let file = tempfile::tempfile().unwrap();
        file.set_len(CHUNK_BYTES * 3).unwrap();
        let source = VideoSource {
            file: Arc::new(file),
            offset: 0,
            len: CHUNK_BYTES * 3,
            mime: "video/mp4".into(),
        };
        let reply = response(Request::builder().body(vec![]).unwrap(), Ok(source));
        assert_eq!(reply.status(), 206);
        assert_eq!(reply.body().len() as u64, CHUNK_BYTES);
    }

    #[test]
    fn serves_only_the_requested_embedded_bytes() {
        let mut file = tempfile::tempfile().unwrap();
        file.write_all(b"prefix0123456789suffix").unwrap();
        let source = VideoSource {
            file: Arc::new(file),
            offset: 6,
            len: 10,
            mime: "video/mp4".into(),
        };
        let request = Request::builder()
            .header("Range", "bytes=3-6")
            .body(vec![])
            .unwrap();
        let reply = response(request, Ok(source.clone()));
        assert_eq!(reply.status(), 206);
        assert_eq!(reply.headers()["Content-Range"], "bytes 3-6/10");
        assert_eq!(reply.body(), b"3456");
        let reply = response(
            Request::builder().method("HEAD").body(vec![]).unwrap(),
            Ok(source),
        );
        assert!(reply.body().is_empty());
        assert_eq!(reply.headers()["Content-Length"], "10");
    }
}
