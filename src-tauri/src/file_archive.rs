/*!
 * A Kaleido Sage file (.ksage) holds one or more scenes, and the tracks of
 * a show, so it can move to another PC as one file (see docs/ONE-FILE.md):
 * a ZIP64 archive of kaleidosage.json (the audio settings and the order),
 * each scene as it is (scenes/<n>/<name>.ksage, in the one-scene layout of
 * scene_archive.rs) and each audio file (tracks/<n>/<name>). The entries
 * are stored, not compressed: the media is compressed already.
 * A track's song analysis (see song_analysis.rs), when the app has one,
 * goes beside it as tracks/<n>/analysis.json, compressed, so an opened
 * file is ready to follow its songs at once.
 * To open one, the app unpacks it into a folder of its own in the temp
 * folder, and opens the scenes and plays the tracks from there.
 */
use serde::Serialize;
use std::{
    fs::File,
    io::Write,
    path::{Path, PathBuf},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

/** The temp folders that open files unpack into start with this. */
const UNPACK_PREFIX: &str = "kaleidosage-file-";
/** The name that the temp folders had before the one file type: the start of the app removes them too. */
const OLD_UNPACK_PREFIX: &str = "kaleidosage-playlist-";
/** The file's own entry: the audio settings, the order, and the names of the other entries. */
const MANIFEST: &str = "kaleidosage.json";
const NOT_A_FILE: &str = "The file is not a Kaleido Sage file.";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedFile {
    /** kaleidosage.json, as the app wrote it. */
    manifest: String,
    /** The unpacked scene files, in tab order. */
    scenes: Vec<String>,
    /** The unpacked audio files, in track order. */
    tracks: Vec<String>,
    /** Each track's song analysis (JSON), in track order, or null; empty for a file without analyses. */
    analyses: Vec<Option<String>>,
}

/** What the Open dialog shows of a file, read without unpacking it (see summary). */
#[derive(Serialize)]
pub struct FileSummary {
    /** The audio settings, as kaleidosage.json has them (see playlistFile.ts). */
    audio: serde_json::Value,
    scenes: Vec<FileEntry>,
    tracks: Vec<FileEntry>,
}

/** One scene or track in a file: its file name and size, and for a track its length in seconds when kaleidosage.json keeps it. */
#[derive(Serialize)]
pub struct FileEntry {
    name: String,
    bytes: u64,
    seconds: Option<f64>,
}

/** Opens the archive at "path" and reads its manifest. Anything else than a Kaleido Sage file gives NOT_A_FILE. */
fn read_archive(path: &Path) -> Result<(ZipArchive<File>, serde_json::Value), String> {
    if !crate::files::is_scene_path(path) {
        return Err("This is not a .ksage file.".into());
    }
    let mut archive = ZipArchive::new(File::open(path).map_err(|e| e.to_string())?).map_err(|_| NOT_A_FILE.to_string())?;
    let manifest = {
        let entry = archive.by_name(MANIFEST).map_err(|_| NOT_A_FILE.to_string())?;
        serde_json::from_reader(entry).map_err(|_| NOT_A_FILE.to_string())?
    };
    Ok((archive, manifest))
}

/**
 * Reads a file's summary from its kaleidosage.json and its list of
 * entries: the audio settings, each scene's and track's file name and
 * size, and the tracks' lengths that the app kept in kaleidosage.json
 * ("trackSeconds"). Nothing is unpacked.
 */
fn summary(path: &Path) -> Result<FileSummary, String> {
    let (mut archive, manifest) = read_archive(path)?;
    /* The name after the entry's folders: "scenes/0/Night.ksage" gives "Night.ksage". */
    let mut entries = |list: &serde_json::Value, seconds: &serde_json::Value| -> Vec<FileEntry> {
        list.as_array()
            .into_iter()
            .flatten()
            .enumerate()
            .filter_map(|(index, name)| {
                let name = name.as_str()?;
                let entry = archive.by_name(name).ok()?;
                Some(FileEntry {
                    name: name.rsplit('/').next().unwrap_or(name).to_string(),
                    bytes: entry.size(),
                    seconds: seconds[index].as_f64(),
                })
            })
            .collect()
    };
    let scenes = entries(&manifest["scenes"], &serde_json::Value::Null);
    let tracks = entries(&manifest["tracks"], &manifest["trackSeconds"]);
    Ok(FileSummary { audio: manifest["audio"].clone(), scenes, tracks })
}

/** The file name of "path", for the entry name; the entry keeps it, so the tab and the track show it again. */
fn file_name(path: &Path) -> Result<String, String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .ok_or_else(|| format!("{} has no file name.", path.display()))
}

/** The largest song analysis that a file opens, in bytes: a 20-minute song's is about 10 MB. */
const MAX_ANALYSIS_BYTES: u64 = 64 * 1024 * 1024;

/**
 * Writes the file: "manifest" (JSON from the app) with the entry names
 * of its scenes, tracks and song analyses added, then each file. It is
 * written next to "path" first, and replaces it only when complete.
 * "analyses" lines up with "tracks"; a track with no analysis has None.
 */
fn save(path: &Path, manifest: &str, scenes: &[String], tracks: &[String], analyses: &[Option<String>]) -> Result<(), String> {
    if !crate::files::is_scene_path(path) {
        return Err("The destination must be a .ksage file.".into());
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
    let analysis_names: Vec<Option<String>> = (0..tracks.len())
        .map(|index| analyses.get(index).and_then(Option::as_ref).map(|_| format!("tracks/{index}/analysis.json")))
        .collect();
    if analysis_names.iter().any(Option::is_some) {
        manifest["analyses"] = serde_json::to_value(&analysis_names).map_err(|e| e.to_string())?;
    }
    let parent = path.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(Path::new("."));
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    {
        let mut archive = ZipWriter::new(temp.as_file_mut());
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        archive.start_file(MANIFEST, options).map_err(|e| e.to_string())?;
        serde_json::to_writer(&mut archive, &manifest).map_err(|e| e.to_string())?;
        for (entry, source) in entries {
            let mut file = File::open(&source).map_err(|e| format!("Could not read {}: {e}", source.display()))?;
            // Always reserve ZIP64 sizes, so files past 4 GiB never overflow.
            archive.start_file(entry, options.large_file(true)).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut archive).map_err(|e| e.to_string())?;
        }
        /* The analyses are text, so they are compressed. */
        let compressed = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        for (name, analysis) in analysis_names.iter().zip(analyses) {
            if let (Some(name), Some(analysis)) = (name, analysis) {
                archive.start_file(name.as_str(), compressed).map_err(|e| e.to_string())?;
                archive.write_all(analysis.as_bytes()).map_err(|e| e.to_string())?;
            }
        }
        archive.finish().map_err(|e| e.to_string())?;
    }
    temp.as_file().flush().map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    crate::scene_archive::persist_file(temp, path)
}

/** Unpacks the file into a new temp folder, and returns its manifest and the unpacked files. */
fn open(path: &Path) -> Result<OpenedFile, String> {
    let (mut archive, manifest) = read_archive(path)?;
    let folder = tempfile::Builder::new().prefix(UNPACK_PREFIX).tempdir().map_err(|e| e.to_string())?.keep();
    let mut unpack = |list: &serde_json::Value| -> Result<Vec<String>, String> {
        let mut paths = Vec::new();
        for name in list.as_array().into_iter().flatten().filter_map(|name| name.as_str()) {
            let mut entry = archive.by_name(name).map_err(|_| format!("The file has no {name}."))?;
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
    /* An analysis that is missing, too large or broken is left out: the app makes it again. */
    let analyses = manifest["analyses"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|name| {
            let entry = archive.by_name(name.as_str()?).ok()?;
            if entry.size() > MAX_ANALYSIS_BYTES {
                return None;
            }
            std::io::read_to_string(entry).ok()
        })
        .collect();
    Ok(OpenedFile { manifest: manifest.to_string(), scenes, tracks, analyses })
}

/**
 * Removes the temp folders of files opened before, except "keep". A
 * folder whose files are still open (a video that plays) stays; the next
 * start removes it.
 */
fn clean_unpacked(keep: Option<&Path>) {
    let Ok(entries) = std::fs::read_dir(std::env::temp_dir()) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let ours = entry.file_name().to_str().is_some_and(|name| name.starts_with(UNPACK_PREFIX) || name.starts_with(OLD_UNPACK_PREFIX));
        if ours && Some(path.as_path()) != keep && path.is_dir() {
            let _ = std::fs::remove_dir_all(&path);
        }
    }
}

#[tauri::command]
pub async fn save_file(path: String, manifest: String, scenes: Vec<String>, tracks: Vec<String>, analyses: Option<Vec<Option<String>>>) -> Result<(), String> {
    let analyses = analyses.unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || save(Path::new(&path), &manifest, &scenes, &tracks, &analyses))
        .await
        .map_err(|e| e.to_string())?
}

/** Opens a file. The temp folders of files opened before go first: their scenes are closed by then. */
#[tauri::command]
pub async fn open_file(path: String) -> Result<OpenedFile, String> {
    tauri::async_runtime::spawn_blocking(move || {
        clean_unpacked(None);
        open(Path::new(&path))
    })
    .await
    .map_err(|e| e.to_string())?
}

/** The Open dialog's summary of a file (see summary). */
#[tauri::command]
pub async fn read_file_summary(path: String) -> Result<FileSummary, String> {
    tauri::async_runtime::spawn_blocking(move || summary(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}

/**
 * A path for a scene's copy in the open file (see docs/ONE-FILE.md): a new
 * folder of its own in the temp folder, with "name" (a file name only) in
 * it. Save writes the scene there, so a scene's own file on disk never
 * changes; the folder goes with the other unpacked folders.
 */
#[tauri::command]
pub fn scene_copy_path(name: String) -> Result<String, String> {
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
        let file = folder.path().join("Show.ksage");
        let manifest = r#"{"app":"KaleidoSage","kind":"file","version":1,"audio":{"gainDb":3}}"#;
        let files = |path: &Path| vec![path.to_string_lossy().into_owned()];
        save(&file, manifest, &files(&scene), &files(&track), &[]).unwrap();

        let mut archive = ZipArchive::new(File::open(&file).unwrap()).unwrap();
        assert!(archive.by_name(MANIFEST).is_ok());
        assert!(archive.by_name("playlist.json").is_err());
        drop(archive);
        let opened = open(&file).unwrap();
        let manifest: serde_json::Value = serde_json::from_str(&opened.manifest).unwrap();
        assert_eq!(manifest["audio"]["gainDb"], 3);
        assert_eq!(manifest["scenes"][0], "scenes/0/Night.ksage");
        assert_eq!(opened.scenes.len(), 1);
        assert!(opened.scenes[0].ends_with("Night.ksage"));
        assert!(opened.scenes[0].contains(UNPACK_PREFIX));
        assert_eq!(std::fs::read(&opened.scenes[0]).unwrap(), b"{\"app\":\"KaleidoSage\"}");
        assert_eq!(std::fs::read(&opened.tracks[0]).unwrap(), b"ID3 not really music");
        assert!(opened.analyses.is_empty());
        let unpacked = Path::new(&opened.scenes[0]).ancestors().nth(3).unwrap().to_path_buf();
        let _ = std::fs::remove_dir_all(unpacked);
    }

    #[test]
    fn keeps_each_tracks_song_analysis_compressed() {
        let folder = tempfile::tempdir().unwrap();
        let first = folder.path().join("One.mp3");
        let second = folder.path().join("Two.mp3");
        std::fs::write(&first, b"ID3 one").unwrap();
        std::fs::write(&second, b"ID3 two").unwrap();
        let file = folder.path().join("Show.ksage");
        let manifest = r#"{"app":"KaleidoSage","kind":"file","version":1}"#;
        let tracks = vec![first.to_string_lossy().into_owned(), second.to_string_lossy().into_owned()];
        let analysis = format!("{{\"version\":2,\"curves\":[{}]}}", vec!["0.125"; 20_000].join(","));
        save(&file, manifest, &[], &tracks, &[None, Some(analysis.clone())]).unwrap();

        let mut archive = ZipArchive::new(File::open(&file).unwrap()).unwrap();
        let stored = archive.by_name("tracks/1/analysis.json").unwrap();
        assert!(stored.compressed_size() < stored.size() / 10, "{} of {}", stored.compressed_size(), stored.size());
        drop(stored);
        drop(archive);
        let opened = open(&file).unwrap();
        assert_eq!(opened.analyses, vec![None, Some(analysis)]);
        let unpacked = Path::new(&opened.tracks[0]).ancestors().nth(3).unwrap().to_path_buf();
        let _ = std::fs::remove_dir_all(unpacked);
    }

    #[test]
    fn sums_up_a_file_without_unpacking_it() {
        let folder = tempfile::tempdir().unwrap();
        let scene = folder.path().join("Night.ksage");
        let track = folder.path().join("Song.mp3");
        std::fs::write(&scene, b"{\"app\":\"KaleidoSage\"}").unwrap();
        std::fs::write(&track, b"ID3 not really music").unwrap();
        let file = folder.path().join("Show.ksage");
        let manifest = r#"{"app":"KaleidoSage","kind":"file","version":1,"audio":{"kind":"tracks"},"trackSeconds":[183.5]}"#;
        let files = |path: &Path| vec![path.to_string_lossy().into_owned()];
        save(&file, manifest, &files(&scene), &files(&track), &[]).unwrap();

        let summary = summary(&file).unwrap();
        assert_eq!(summary.audio["kind"], "tracks");
        assert_eq!(summary.scenes[0].name, "Night.ksage");
        assert_eq!(summary.scenes[0].bytes, 21);
        assert_eq!(summary.tracks[0].name, "Song.mp3");
        assert_eq!(summary.tracks[0].bytes, 20);
        assert_eq!(summary.tracks[0].seconds, Some(183.5));
        assert_eq!(summary.scenes[0].seconds, None);
    }

    #[test]
    fn refuses_other_files() {
        assert!(save(Path::new("show.txt"), "{}", &[], &[], &[]).is_err());
        assert!(save(Path::new("show.ksplaylist"), "{}", &[], &[], &[]).is_err());
        assert!(open(Path::new("show.txt")).is_err());
    }

    #[test]
    fn refuses_a_one_scene_file_and_an_old_playlist() {
        let folder = tempfile::tempdir().unwrap();
        /* A one-scene file in plain JSON, as the app saved it before the one file type. */
        let json = folder.path().join("Night.ksage");
        std::fs::write(&json, b"{\"app\":\"KaleidoSage\"}").unwrap();
        assert_eq!(open(&json).err().as_deref(), Some(NOT_A_FILE));
        /* A ZIP with playlist.json (an old playlist) or scene.json (an old scene with a video), even named .ksage. */
        for entry in ["playlist.json", "scene.json"] {
            let path = folder.path().join(format!("{entry}.ksage"));
            let mut archive = ZipWriter::new(File::create(&path).unwrap());
            archive.start_file(entry, SimpleFileOptions::default()).unwrap();
            archive.write_all(b"{}").unwrap();
            archive.finish().unwrap();
            assert_eq!(summary(&path).err().as_deref(), Some(NOT_A_FILE));
            assert_eq!(open(&path).err().as_deref(), Some(NOT_A_FILE));
        }
    }
}
