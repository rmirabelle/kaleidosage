//! A .ksage with videos is a ZIP64 archive: scene.json plus stored media entries.
//! Media is read directly from the archive; no external paths are saved.
use crate::video_stream::{VideoSource, Videos};
use std::{
    io::{Read, Seek, Write},
    path::Path,
    sync::Arc,
};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    Manager,
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

fn save(path: &Path, contents: &[u8], videos: &Videos) -> Result<(), String> {
    if !crate::files::is_scene_path(path) {
        return Err("The destination must be a .ksage file.".into());
    }
    let mut scene: serde_json::Value =
        serde_json::from_slice(contents).map_err(|e| e.to_string())?;
    let mut media = Vec::new();
    for slot in ["image", "image2"] {
        if let Some(id) = scene[slot]["video"].as_str() {
            let source = videos.get(id)?;
            let name = format!("media/{}.video", media.len());
            scene[slot]["video"] = name.clone().into();
            media.push((name, source));
        }
    }
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    if media.is_empty() {
        temp.write_all(contents).map_err(|e| e.to_string())?;
    } else {
        scene["version"] = 3.into();
        let mut archive = ZipWriter::new(temp.as_file_mut());
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        archive
            .start_file("scene.json", options)
            .map_err(|e| e.to_string())?;
        serde_json::to_writer(&mut archive, &scene).map_err(|e| e.to_string())?;
        for (name, source) in media {
            // Always reserve ZIP64 sizes, so files growing past 4 GiB never overflow.
            archive
                .start_file(name, options.large_file(true))
                .map_err(|e| e.to_string())?;
            let copied =
                std::io::copy(&mut source.reader(), &mut archive).map_err(|e| e.to_string())?;
            if copied != source.len {
                return Err("The video changed while saving. Please open it again.".into());
            }
        }
        archive.finish().map_err(|e| e.to_string())?;
    }
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    // Replace only after the complete scene is written. Existing players retain
    // handles to their original file, including when Save replaces that scene.
    persist_scene(temp, path)?;
    Ok(())
}

fn persist_scene(temp: tempfile::NamedTempFile, path: &Path) -> Result<(), String> {
    // Close the writable handle before Windows opens the replacement file.
    let temp = temp.into_temp_path();
    #[cfg(windows)]
    if path.exists() {
        use windows::{
            core::{HSTRING, PCWSTR},
            Win32::Storage::FileSystem::{ReplaceFileW, REPLACE_FILE_FLAGS},
        };
        // Existing players can retain handles to the old scene during replacement.
        unsafe {
            ReplaceFileW(
                &HSTRING::from(path.as_os_str()),
                &HSTRING::from(temp.as_os_str()),
                PCWSTR::null(),
                REPLACE_FILE_FLAGS(0),
                None,
                None,
            )
        }
        .map_err(|e| format!("Could not replace the saved scene: {e}"))?;
        return Ok(());
    }
    temp.persist(path)
        .map_err(|e| format!("Could not finish saving the scene: {e}"))?;
    Ok(())
}

fn read(path: &Path, videos: &Videos) -> Result<Vec<u8>, String> {
    if !crate::files::is_scene_path(path) {
        return Err("This is not a .ksage file.".into());
    }
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(7);
    }
    let mut file = options.open(path).map_err(|e| e.to_string())?;
    let mut magic = [0; 4];
    let count = file.read(&mut magic).map_err(|e| e.to_string())?;
    file.rewind().map_err(|e| e.to_string())?;
    if count != 4 || magic != *b"PK\x03\x04" {
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        return Ok(bytes); // Original JSON scenes remain supported.
    }
    let file_len = file.metadata().map_err(|e| e.to_string())?.len();
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut scene: serde_json::Value = {
        let entry = archive.by_name("scene.json").map_err(|e| e.to_string())?;
        // This is settings and still images only; video bytes are separate entries.
        serde_json::from_reader(entry).map_err(|e| e.to_string())?
    };
    let mut media = Vec::new();
    for slot in ["image", "image2"] {
        if let Some(name) = scene[slot]["video"].as_str() {
            if !scene[slot]["type"]
                .as_str()
                .is_some_and(|s| s.starts_with("video/"))
            {
                return Err("The scene's video type is invalid.".into());
            }
            let entry = archive
                .by_name(name)
                .map_err(|e| format!("The scene's embedded video is missing: {e}"))?;
            if entry.compression() != CompressionMethod::Stored
                || entry.compressed_size() != entry.size()
            {
                return Err("The scene's video must use uncompressed archive storage.".into());
            }
            let offset = entry
                .data_start()
                .ok_or("The scene media offset is invalid")?;
            let len = entry.size();
            if offset.checked_add(len).is_none_or(|end| end > file_len) {
                return Err("The scene's embedded video is incomplete.".into());
            }
            media.push((slot, offset, len));
        }
    }
    let file = Arc::new(archive.into_inner());
    for (slot, offset, len) in media {
        let info = videos.add(VideoSource {
            file: file.clone(),
            offset,
            len,
            mime: scene[slot]["type"].as_str().unwrap().into(),
        })?;
        scene[slot]["video"] = info.id.into();
    }
    serde_json::to_vec(&scene).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn read_scene(app: tauri::AppHandle, path: String) -> Result<Response, String> {
    tauri::async_runtime::spawn_blocking(move || read(Path::new(&path), &app.state::<Videos>()))
        .await
        .map_err(|e| e.to_string())?
        .map(Response::new)
}

#[tauri::command]
pub async fn save_scene(app: tauri::AppHandle, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("The scene data is missing".into());
    };
    let path = request
        .headers()
        .get("path")
        .and_then(|v| v.to_str().ok())
        .and_then(crate::files::percent_decode)
        .ok_or("The scene path is invalid")?;
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        save(Path::new(&path), &bytes, &app.state::<Videos>())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    #[test]
    fn embedded_videos_survive_moving_deleting_sources_and_resaving() {
        let dir = tempfile::tempdir().unwrap();
        let original = dir.path().join("original.mp4");
        std::fs::write(&original, b"test-video-bytes").unwrap();
        let videos = Videos::default();
        let info = videos.add(VideoSource::open(&original).unwrap()).unwrap();
        let contents = serde_json::to_vec(&serde_json::json!({
            "app": "KaleidoSage", "version": 2,
            "image": {"type": "video/mp4", "video": info.id},
            "image2": {"type": "video/mp4", "video": info.id}
        }))
        .unwrap();
        let path = dir.path().join("scene.ksage");
        save(&path, &contents, &videos).unwrap();
        let mut archive = ZipArchive::new(File::open(&path).unwrap()).unwrap();
        assert_eq!(archive.by_name("media/0.video").unwrap().size(), 16);
        let mut manifest = String::new();
        archive
            .by_name("scene.json")
            .unwrap()
            .read_to_string(&mut manifest)
            .unwrap();
        assert!(!manifest.contains("original.mp4"));
        drop(archive);
        drop(videos);
        std::fs::remove_file(original).unwrap();
        let moved = dir.path().join("moved.ksage");
        std::fs::rename(path, &moved).unwrap();
        let videos = Videos::default();
        let loaded = read(&moved, &videos).unwrap();
        let scene: serde_json::Value = serde_json::from_slice(&loaded).unwrap();
        let source = videos
            .get(scene["image"]["video"].as_str().unwrap())
            .unwrap();
        save(&moved, &loaded, &videos).unwrap();
        let mut bytes = Vec::new();
        source.reader().read_to_end(&mut bytes).unwrap();
        assert_eq!(bytes, b"test-video-bytes");
        assert!(read(&moved, &videos).is_ok());
    }
    #[test]
    fn failed_media_copy_preserves_the_existing_scene() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("scene.ksage");
        let original = b"previous scene";
        std::fs::write(&path, original).unwrap();
        let video = dir.path().join("video.mp4");
        std::fs::write(&video, b"video bytes").unwrap();
        let videos = Videos::default();
        let info = videos.add(VideoSource::open(&video).unwrap()).unwrap();
        // Simulate a source being truncated after import.
        std::fs::write(&video, b"").unwrap();
        let contents = serde_json::to_vec(&serde_json::json!({
            "image": {"type": "video/mp4", "video": info.id}
        }))
        .unwrap();
        assert!(save(&path, &contents, &videos).is_err());
        assert_eq!(std::fs::read(path).unwrap(), original);
    }

    #[test]
    fn legacy_json_scenes_still_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("scene.ksage");
        let bytes = br#"{"app":"KaleidoSage","image":{"type":"image/png","data":"AA=="}}"#;
        let videos = Videos::default();
        save(&path, bytes, &videos).unwrap();
        assert_eq!(read(&path, &videos).unwrap(), bytes);
    }
}
