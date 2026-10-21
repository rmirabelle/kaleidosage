//! A video export is written to disk while it is made: the webview sends the
//! MP4 in parts, each with the place in the file it goes to (the muxer goes
//! back to fill in sizes it learns later). So a long or large video never
//! has to fit in memory. The parts go to "<file>.part", which takes the
//! file's name only when the export is complete, so a stopped or failed
//! export leaves no broken video behind.
use std::{
    collections::HashMap,
    fs::File,
    io::{Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU32, Ordering},
        Mutex,
    },
};
use tauri::ipc::{InvokeBody, Request};

struct OpenExport {
    target: PathBuf,
    part: PathBuf,
    file: File,
}

/** The video exports that are being written, by id. */
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

impl Exports {
    fn begin(&self, path: &str) -> Result<u32, String> {
        let target = PathBuf::from(path);
        if !is_video_export(&target) {
            return Err("The export path is invalid".into());
        }
        let part = part_path(&target);
        let file = File::create(&part).map_err(|error| format!("Could not write {}: {error}", part.display()))?;
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        self.open.lock().map_err(|_| "The export writer is unavailable")?.insert(id, OpenExport { target, part, file });
        Ok(id)
    }

    fn write(&self, id: u32, offset: u64, bytes: &[u8]) -> Result<(), String> {
        let mut open = self.open.lock().map_err(|_| "The export writer is unavailable")?;
        let export = open.get_mut(&id).ok_or("This export is no longer open")?;
        export.file.seek(SeekFrom::Start(offset)).and_then(|_| export.file.write_all(bytes)).map_err(|error| format!("Could not write the video: {error}"))
    }

    /** Ends the export: the part file becomes the video (it takes the place of a file with that name), or with "discard" it is removed. */
    fn finish(&self, id: u32, discard: bool) -> Result<(), String> {
        let export = self.open.lock().map_err(|_| "The export writer is unavailable")?.remove(&id).ok_or("This export is no longer open")?;
        let OpenExport { target, part, file } = export;
        if discard {
            drop(file);
            let _ = std::fs::remove_file(&part);
            return Ok(());
        }
        file.sync_all().map_err(|error| format!("Could not write the video: {error}"))?;
        drop(file);
        std::fs::rename(&part, &target).map_err(|error| format!("Could not save {}: {error}", target.display()))
    }
}

/** Starts a video export to "path" (an .mp4): returns its id for write_export and finish_export. */
#[tauri::command]
pub fn begin_export(exports: tauri::State<'_, Exports>, path: String) -> Result<u32, String> {
    exports.begin(&path)
}

/** Writes one part of an export: the raw request body, at the "offset" header, to the export in the "export-id" header. */
#[tauri::command]
pub fn write_export(exports: tauri::State<'_, Exports>, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("The export data is missing".into());
    };
    let header = |name: &str| request.headers().get(name).and_then(|value| value.to_str().ok()).ok_or_else(|| format!("The {name} header is missing"));
    let id = header("export-id")?.parse::<u32>().map_err(|error| error.to_string())?;
    let offset = header("offset")?.parse::<u64>().map_err(|error| error.to_string())?;
    exports.write(id, offset, bytes)
}

#[tauri::command]
pub fn finish_export(exports: tauri::State<'_, Exports>, id: u32, discard: bool) -> Result<(), String> {
    exports.finish(id, discard)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_parts_in_place_and_keeps_the_file_only_when_complete() {
        let folder = tempfile::tempdir().unwrap();
        let exports = Exports::default();
        let path = folder.path().join("Clip.mp4");
        let id = exports.begin(path.to_str().unwrap()).unwrap();
        exports.write(id, 0, b"----body").unwrap();
        exports.write(id, 0, b"head").unwrap();
        assert!(!path.exists());
        exports.finish(id, false).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"headbody");
        assert!(!part_path(&path).exists());

        let stopped = folder.path().join("Stopped.mp4");
        let id = exports.begin(stopped.to_str().unwrap()).unwrap();
        exports.write(id, 0, b"half").unwrap();
        exports.finish(id, true).unwrap();
        assert!(!stopped.exists() && !part_path(&stopped).exists());
    }

    #[test]
    fn refuses_other_paths() {
        let exports = Exports::default();
        assert!(exports.begin("relative.mp4").is_err());
        assert!(exports.begin(r"C:\Videos\clip.png").is_err());
    }
}
