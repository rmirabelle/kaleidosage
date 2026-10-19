//! A .ksplaylist holds a whole show, so it can move to another PC as one
//! file (see docs/AUDIO.md, part 8): a ZIP64 archive of playlist.json (the
//! audio settings and the order), each scene file as it is
//! (scenes/<n>/<name>.ksage) and each audio file (tracks/<n>/<name>). The
//! entries are stored, not compressed: the media is compressed already.
//! To open one, the app unpacks it into a folder of its own in the temp
//! folder, and opens the scenes and plays the tracks from there.
use serde::Serialize;
use std::{
    fs::File,
    io::Write,
    path::{Path, PathBuf},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

/** The temp folders that open playlists unpack into start with this. */
const UNPACK_PREFIX: &str = "kaleidosage-playlist-";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedPlaylist {
    /** playlist.json, as the app wrote it. */
    manifest: String,
    /** The unpacked scene files, in tab order. */
    scenes: Vec<String>,
    /** The unpacked audio files, in track order. */
    tracks: Vec<String>,
}

/** The file name of "path", for the entry name; the entry keeps it, so the tab and the track show it again. */
fn file_name(path: &Path) -> Result<String, String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .ok_or_else(|| format!("{} has no file name.", path.display()))
}

/**
 * Writes the playlist: "manifest" (JSON from the app) with the entry names
 * of its scenes and tracks added, then each file. It is written next to
 * "path" first, and replaces it only when complete.
 */
fn save(path: &Path, manifest: &str, scenes: &[String], tracks: &[String]) -> Result<(), String> {
    if !crate::files::is_playlist_path(path) {
        return Err("The destination must be a .ksplaylist file.".into());
    }
    let mut manifest: serde_json::Value = serde_json::from_str(manifest).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    let mut names = |kind: &str, files: &[String]| -> Result<Vec<serde_json::Value>, String> {
        files
            .iter()
            .enumerate()
            .map(|(index, file)| {
                let source = PathBuf::from(file);
                let entry = format!("{kind}/{index}/{}", file_name(&source)?);
                entries.push((entry.clone(), source));
                Ok(entry.into())
            })
            .collect()
    };
    manifest["scenes"] = names("scenes", scenes)?.into();
    manifest["tracks"] = names("tracks", tracks)?.into();
    let parent = path.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(Path::new("."));
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    {
        let mut archive = ZipWriter::new(temp.as_file_mut());
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        archive.start_file("playlist.json", options).map_err(|e| e.to_string())?;
        serde_json::to_writer(&mut archive, &manifest).map_err(|e| e.to_string())?;
        for (entry, source) in entries {
            let mut file = File::open(&source).map_err(|e| format!("Could not read {}: {e}", source.display()))?;
            // Always reserve ZIP64 sizes, so files past 4 GiB never overflow.
            archive.start_file(entry, options.large_file(true)).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut archive).map_err(|e| e.to_string())?;
        }
        archive.finish().map_err(|e| e.to_string())?;
    }
    temp.as_file().flush().map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    crate::scene_archive::persist_file(temp, path)
}

/** Unpacks the playlist into a new temp folder, and returns its manifest and the unpacked files. */
fn open(path: &Path) -> Result<OpenedPlaylist, String> {
    if !crate::files::is_playlist_path(path) {
        return Err("This is not a .ksplaylist file.".into());
    }
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|_| "The file is not a Kaleido Sage playlist.".to_string())?;
    let manifest: serde_json::Value = {
        let entry = archive.by_name("playlist.json").map_err(|_| "The file is not a Kaleido Sage playlist.".to_string())?;
        serde_json::from_reader(entry).map_err(|e| e.to_string())?
    };
    let folder = tempfile::Builder::new().prefix(UNPACK_PREFIX).tempdir().map_err(|e| e.to_string())?.keep();
    let mut unpack = |list: &serde_json::Value| -> Result<Vec<String>, String> {
        let mut paths = Vec::new();
        for name in list.as_array().into_iter().flatten().filter_map(|name| name.as_str()) {
            let mut entry = archive.by_name(name).map_err(|_| format!("The playlist has no {name}."))?;
            /* Only names inside the folder: an entry like "../x" is skipped. */
            let Some(relative) = entry.enclosed_name() else { continue };
            let target = folder.join(relative);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out = File::create(&target).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
            paths.push(target.to_string_lossy().into_owned());
        }
        Ok(paths)
    };
    let scenes = unpack(&manifest["scenes"])?;
    let tracks = unpack(&manifest["tracks"])?;
    Ok(OpenedPlaylist { manifest: manifest.to_string(), scenes, tracks })
}

/**
 * Removes the temp folders of playlists opened before, except "keep". A
 * folder whose files are still open (a video that plays) stays; the next
 * start removes it.
 */
fn clean_unpacked(keep: Option<&Path>) {
    let Ok(entries) = std::fs::read_dir(std::env::temp_dir()) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let ours = entry.file_name().to_str().is_some_and(|name| name.starts_with(UNPACK_PREFIX));
        if ours && Some(path.as_path()) != keep && path.is_dir() {
            let _ = std::fs::remove_dir_all(&path);
        }
    }
}

#[tauri::command]
pub async fn save_playlist(path: String, manifest: String, scenes: Vec<String>, tracks: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || save(Path::new(&path), &manifest, &scenes, &tracks))
        .await
        .map_err(|e| e.to_string())?
}

/** Opens a playlist. The temp folders of playlists opened before go first: their scenes are closed by then. */
#[tauri::command]
pub async fn open_playlist(path: String) -> Result<OpenedPlaylist, String> {
    tauri::async_runtime::spawn_blocking(move || {
        clean_unpacked(None);
        open(Path::new(&path))
    })
    .await
    .map_err(|e| e.to_string())?
}

/**
 * A path for a scene's copy in the open playlist (see docs/AUDIO.md, part
 * 8): a new folder of its own in the temp folder, with "name" (a file name
 * only) in it. Save Playlist writes the scene there, so the scene's own
 * file on disk never changes; the folder goes with the other unpacked
 * folders.
 */
#[tauri::command]
pub fn playlist_scene_path(name: String) -> Result<String, String> {
    let name = Path::new(&name).file_name().and_then(|name| name.to_str()).ok_or("The scene has no file name.")?.to_string();
    if !crate::files::is_scene_path(Path::new(&name)) {
        return Err("A scene's copy must be a .ksage file.".into());
    }
    let folder = tempfile::Builder::new().prefix(UNPACK_PREFIX).tempdir().map_err(|e| e.to_string())?.keep();
    Ok(folder.join(name).to_string_lossy().into_owned())
}

/** At the app's start: nothing is open, so every old temp folder goes. */
pub fn clean_at_start() {
    std::thread::spawn(|| clean_unpacked(None));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saves_and_opens_scenes_and_tracks() {
        let folder = tempfile::tempdir().unwrap();
        let scene = folder.path().join("Night.ksage");
        let track = folder.path().join("Song.mp3");
        std::fs::write(&scene, b"{\"app\":\"KaleidoSage\"}").unwrap();
        std::fs::write(&track, b"ID3 not really music").unwrap();
        let playlist = folder.path().join("Show.ksplaylist");
        let manifest = r#"{"app":"KaleidoSage","kind":"playlist","version":1,"audio":{"gainDb":3}}"#;
        let files = |path: &Path| vec![path.to_string_lossy().into_owned()];
        save(&playlist, manifest, &files(&scene), &files(&track)).unwrap();

        let opened = open(&playlist).unwrap();
        let manifest: serde_json::Value = serde_json::from_str(&opened.manifest).unwrap();
        assert_eq!(manifest["audio"]["gainDb"], 3);
        assert_eq!(manifest["scenes"][0], "scenes/0/Night.ksage");
        assert_eq!(opened.scenes.len(), 1);
        assert!(opened.scenes[0].ends_with("Night.ksage"));
        assert_eq!(std::fs::read(&opened.scenes[0]).unwrap(), b"{\"app\":\"KaleidoSage\"}");
        assert_eq!(std::fs::read(&opened.tracks[0]).unwrap(), b"ID3 not really music");
        let unpacked = Path::new(&opened.scenes[0]).ancestors().nth(3).unwrap().to_path_buf();
        let _ = std::fs::remove_dir_all(unpacked);
    }

    #[test]
    fn refuses_other_files() {
        assert!(save(Path::new("show.txt"), "{}", &[], &[]).is_err());
        assert!(open(Path::new("show.txt")).is_err());
    }
}
