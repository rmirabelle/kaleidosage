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

pub(crate) fn is_scene_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("ksage"))
}

/** A plain PNG file name with no folder part, so a snapshot cannot be written outside its folder. */
fn is_safe_snapshot_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('.')
        && !name.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|'])
        && name.to_ascii_lowercase().ends_with(".png")
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
 * Saves a PNG snapshot to Pictures\Kaleido Sage. The PNG bytes are the raw
 * request body, and the "file-name" header holds the file name.
 */
#[tauri::command]
pub async fn save_snapshot(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("The snapshot data is missing".into());
    };
    let name = request
        .headers()
        .get("file-name")
        .and_then(|value| value.to_str().ok())
        .filter(|name| is_safe_snapshot_name(name))
        .ok_or_else(|| "The snapshot file name is invalid".to_string())?;
    let folder = app
        .path()
        .picture_dir()
        .map_err(|error| format!("Could not find the Pictures folder: {error}"))?
        .join("Kaleido Sage");
    tokio::fs::create_dir_all(&folder)
        .await
        .map_err(|error| format!("Could not create {}: {error}", folder.display()))?;
    let path = folder.join(name);
    tokio::fs::write(&path, bytes)
        .await
        .map_err(|error| format!("Could not save {}: {error}", path.display()))?;
    Ok(path.to_string_lossy().into_owned())
}

/** Writes a scene (.ksage, JSON text) to the path the user picked. */
#[tauri::command]
pub async fn save_scene(path: String, contents: String) -> Result<(), String> {
    if !is_scene_path(Path::new(&path)) {
        return Err(format!("{path} is not a .ksage file"));
    }
    tokio::fs::write(&path, contents)
        .await
        .map_err(|error| format!("Could not save {path}: {error}"))
}

/** Reads a scene (.ksage, JSON text) the user picked. */
#[tauri::command]
pub async fn read_scene(path: String) -> Result<String, String> {
    if !is_scene_path(Path::new(&path)) {
        return Err(format!("{path} is not a .ksage file"));
    }
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|error| format!("Could not read {path}: {error}"))
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
    }

    #[test]
    fn accepts_only_scene_files() {
        assert!(is_scene_path(Path::new(r"C:\Scenes\Sunset.KSAGE")));
        assert!(!is_scene_path(Path::new("scene.json")));
    }

    #[test]
    fn snapshot_names_cannot_leave_the_folder() {
        assert!(is_safe_snapshot_name("Kaleido 2026-10-11 23-15-02.png"));
        assert!(!is_safe_snapshot_name(r"..\evil.png"));
        assert!(!is_safe_snapshot_name("C:evil.png"));
        assert!(!is_safe_snapshot_name(".png"));
        assert!(!is_safe_snapshot_name("snapshot.exe"));
    }
}
