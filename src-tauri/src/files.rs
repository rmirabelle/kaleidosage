use std::path::Path;

use tauri::{
    ipc::{InvokeBody, Request, Response},
    AppHandle, Manager,
};

const IMAGE_EXTENSIONS: [&str; 7] = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"];

pub(crate) fn is_image_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| IMAGE_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str()))
}

/// Accepted video containers; decoding support is determined by the webview.
const VIDEO_EXTENSIONS: [&str; 5] = ["mp4", "m4v", "webm", "mov", "avi"];

pub(crate) fn is_video_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| VIDEO_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str()))
}

/// Audio files for the playlist (see docs/AUDIO.md, part 7); decoding support is determined by the webview.
const AUDIO_EXTENSIONS: [&str; 7] = ["mp3", "wav", "flac", "ogg", "opus", "m4a", "aac"];

pub(crate) fn is_audio_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| AUDIO_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str()))
}

/// A playlist file (see playlist_archive): the scenes, the tracks and the audio settings of a show.
pub(crate) fn is_playlist_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("ksplaylist"))
}

pub(crate) fn is_scene_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("ksage"))
}

/**
 * Decodes %XX escapes, as encodeURIComponent writes them, so a path with
 * any characters fits in a request header. None for a broken escape or for
 * text that is not UTF-8.
 */
pub(crate) fn percent_decode(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let hex = text.get(index + 1..index + 3)?;
            decoded.push(u8::from_str_radix(hex, 16).ok()?);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).ok()
}

/** An absolute path to a PNG or MP4 file: the only files an export writes. */
fn is_export_path(path: &Path) -> bool {
    path.is_absolute()
        && path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("png") || extension.eq_ignore_ascii_case("mp4"))
}

/** Reads an image file the user picked, and returns its raw bytes to the webview. */
#[tauri::command]
pub async fn read_image_file(path: String) -> Result<Response, String> {
    let file = Path::new(&path);
    if !is_image_path(file) {
        return Err(format!("{path} is not a supported image"));
    }
    tokio::fs::read(file)
        .await
        .map(Response::new)
        .map_err(|error| format!("Could not read {path}: {error}"))
}

/**
 * Saves an exported PNG image or MP4 video to the path the user picked. The
 * file bytes are the raw request body, and the "path" header holds the
 * path, percent-encoded.
 */
#[tauri::command]
pub async fn save_export(request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("The export data is missing".into());
    };
    let path = request
        .headers()
        .get("path")
        .and_then(|value| value.to_str().ok())
        .and_then(percent_decode)
        .filter(|path| is_export_path(Path::new(path)))
        .ok_or_else(|| "The export path is invalid".to_string())?;
    tokio::fs::write(&path, bytes)
        .await
        .map_err(|error| format!("Could not save {path}: {error}"))
}

/** The folder the save dialog starts in the first time: Pictures\Kaleido Sage, made if it is missing. */
#[tauri::command]
pub async fn default_export_folder(app: AppHandle) -> Result<String, String> {
    let folder = app
        .path()
        .picture_dir()
        .map_err(|error| format!("Could not find the Pictures folder: {error}"))?
        .join("Kaleido Sage");
    tokio::fs::create_dir_all(&folder)
        .await
        .map_err(|error| format!("Could not create {}: {error}", folder.display()))?;
    Ok(folder.to_string_lossy().into_owned())
}

/** Opens the folder of an existing file in File Explorer, with the file selected. */
#[tauri::command]
pub fn reveal_file(path: String) -> Result<(), String> {
    if !Path::new(&path).is_file() {
        return Err(format!("{path} no longer exists"));
    }
    let mut command = std::process::Command::new("explorer");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.raw_arg(format!("/select,\"{path}\""));
    }
    #[cfg(not(windows))]
    command.arg(&path);
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open File Explorer: {error}"))
}

/** Writes an error from the webview to the app's error output, so crashes show in the dev log. */
#[tauri::command]
pub fn log_frontend_error(message: String) {
    eprintln!("[kaleidosage] frontend error: {}", message.chars().take(4000).collect::<String>());
}

/** Returns the OS cursor position in physical pixels, for the window-control hover fix. */
#[tauri::command]
pub fn cursor_position() -> (i32, i32) {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
        let mut point = POINT { x: 0, y: 0 };
        unsafe {
            let _ = GetCursorPos(&mut point);
        }
        (point.x, point.y)
    }
    #[cfg(not(windows))]
    {
        (0, 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_image_extensions_case_insensitively() {
        assert!(is_image_path(Path::new(r"C:\Photos\Beach.JPG")));
        assert!(is_image_path(Path::new("art.webp")));
        assert!(!is_image_path(Path::new("notes.txt")));
        assert!(!is_image_path(Path::new("no-extension")));
        assert!(is_video_path(Path::new(r"C:\Videos\Clip.MP4")));
        assert!(is_video_path(Path::new("clip.webm")));
        assert!(is_video_path(Path::new("clip.mov")));
        assert!(is_video_path(Path::new("clip.MOV")));
        assert!(is_video_path(Path::new("clip.avi")));
        assert!(is_video_path(Path::new("clip.AVI")));
        assert!(!is_video_path(Path::new("clip.mkv")));
    }

    #[test]
    fn accepts_only_scene_files() {
        assert!(is_scene_path(Path::new(r"C:\Scenes\Sunset.KSAGE")));
        assert!(!is_scene_path(Path::new("scene.json")));
    }

    #[test]
    fn export_paths_are_absolute_png_or_mp4() {
        assert!(is_export_path(Path::new(r"C:\Users\me\Pictures\Kaleido.png")));
        assert!(is_export_path(Path::new(r"D:\Videos\Loop.MP4")));
        assert!(!is_export_path(Path::new(r"relative\Loop.mp4")));
        assert!(!is_export_path(Path::new(r"C:\Windows\evil.exe")));
    }

    #[test]
    fn decodes_percent_escapes() {
        assert_eq!(percent_decode("C%3A%5CVideos%5CK%C3%A4leido%20loop.mp4").as_deref(), Some(r"C:\Videos\Käleido loop.mp4"));
        assert_eq!(percent_decode("bad%2"), None);
        assert_eq!(percent_decode("bad%zz"), None);
    }
}
