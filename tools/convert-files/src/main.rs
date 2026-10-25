/*!
 * A one-time program (see docs/ONE-FILE.md, Conversion): it changes each
 * old scene file (.ksage) and old playlist (.ksplaylist) in one folder to
 * the one Kaleido Sage file layout, after it copies them, as they are, to a
 * backup folder.
 *
 * - An old scene X.ksage becomes a file with kaleidosage.json (input
 *   Nothing) and the old file's bytes as scenes/0/X.ksage.
 * - An old playlist X.ksplaylist becomes X.ksage: its playlist.json becomes
 *   kaleidosage.json (kind "file"), and every other entry is copied as it
 *   is, with no decode. Then the .ksplaylist is deleted.
 * - A file in the new layout already is left as it is, so a second run
 *   does only what the first one could not do.
 *
 * Each new file is written beside the old one, read back to check it, and
 * then put in its place. Usage: convert-files <folder> <backup folder>
 */
use std::{
    collections::HashMap,
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

const MANIFEST: &str = "kaleidosage.json";

#[derive(Debug, PartialEq)]
enum Layout {
    /** kaleidosage.json: nothing to do. */
    New,
    /** A one-scene file: JSON, or a ZIP with scene.json and its videos. */
    Scene,
    /** A ZIP with playlist.json. */
    Playlist,
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        eprintln!("Usage: convert-files <folder> <backup folder>");
        std::process::exit(2);
    }
    match run(Path::new(&args[1]), Path::new(&args[2])) {
        Ok(true) => println!("Done."),
        Ok(false) => {
            println!("Done, with errors. Fix them (close the app if it has a file open), then run again.");
            std::process::exit(1);
        }
        Err(error) => {
            eprintln!("Stopped: {error}");
            std::process::exit(1);
        }
    }
}

/** True when every file was converted (or needed no change). */
fn run(folder: &Path, backup: &Path) -> Result<bool, String> {
    let mut files: Vec<PathBuf> = fs::read_dir(folder)
        .map_err(|e| format!("Could not read {}: {e}", folder.display()))?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && (has_extension(path, "ksage") || has_extension(path, "ksplaylist")))
        .collect();
    files.sort();
    let mut work = Vec::new();
    for path in files {
        let layout = layout(&path).map_err(|e| format!("{}: {e}", name(&path)))?;
        if layout == Layout::New {
            println!("  ok       {} (new layout already)", name(&path));
        } else {
            work.push((path, layout));
        }
    }
    println!("{} files to convert in {}", work.len(), folder.display());
    if work.is_empty() {
        return Ok(true);
    }

    /* 1. The backup: each file as it is, checked by its size. */
    fs::create_dir_all(backup).map_err(|e| format!("Could not make {}: {e}", backup.display()))?;
    for (path, _) in &work {
        let target = backup.join(name(path));
        let size = size_of(path)?;
        if target.exists() {
            if size_of(&target)? != size {
                return Err(format!("The backup has another {}. Nothing was converted.", name(path)));
            }
            continue;
        }
        fs::copy(path, &target).map_err(|e| format!("Could not back up {}: {e}", name(path)))?;
        if size_of(&target)? != size {
            return Err(format!("The backup of {} is not complete. Nothing was converted.", name(path)));
        }
    }
    println!("Backed up {} files to {}", work.len(), backup.display());

    /* 2. The conversion: a failed file is reported, and the next one goes on. */
    let mut all = true;
    for (path, layout) in &work {
        let result = match layout {
            Layout::Scene => convert_scene(path),
            Layout::Playlist => convert_playlist(path),
            Layout::New => Ok(String::new()),
        };
        match result {
            Ok(note) => println!("  done     {} {note}", name(path)),
            Err(error) => {
                all = false;
                println!("  FAILED   {}: {error}", name(path));
            }
        }
    }
    Ok(all)
}

fn has_extension(path: &Path, extension: &str) -> bool {
    path.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case(extension))
}

fn name(path: &Path) -> String {
    path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default()
}

fn size_of(path: &Path) -> Result<u64, String> {
    fs::metadata(path).map(|m| m.len()).map_err(|e| format!("Could not read {}: {e}", name(path)))
}

fn layout(path: &Path) -> Result<Layout, String> {
    let mut magic = [0; 4];
    let count = File::open(path).and_then(|mut file| file.read(&mut magic)).map_err(|e| e.to_string())?;
    if count < 4 || magic != *b"PK\x03\x04" {
        let bytes = fs::read(path).map_err(|e| e.to_string())?;
        return match bytes.iter().find(|byte| !byte.is_ascii_whitespace()) {
            Some(b'{') => Ok(Layout::Scene),
            _ => Err("not a Kaleido Sage scene, playlist or file".into()),
        };
    }
    let archive = ZipArchive::new(File::open(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let has = |entry: &str| archive.file_names().any(|name| matches!(name.as_deref(), Ok(name) if name == entry));
    if has(MANIFEST) {
        Ok(Layout::New)
    } else if has("playlist.json") {
        Ok(Layout::Playlist)
    } else if has("scene.json") {
        Ok(Layout::Scene)
    } else {
        Err("a ZIP with no scene.json, playlist.json or kaleidosage.json".into())
    }
}

/** The new file is written here first: beside "target", with ".converting" after its name. */
fn temp_path(target: &Path) -> PathBuf {
    target.with_file_name(format!("{}.converting", name(target)))
}

fn convert_scene(path: &Path) -> Result<String, String> {
    let scene_name = name(path);
    let entry = format!("scenes/0/{scene_name}");
    let manifest = serde_json::json!({
        "app": "KaleidoSage", "kind": "file", "version": 1,
        "audio": { "kind": "none" }, "activeScene": 0,
        "scenes": [entry], "tracks": []
    });
    let temp = temp_path(path);
    let result = (|| {
        let mut writer = ZipWriter::new(File::create(&temp).map_err(|e| e.to_string())?);
        let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        writer.start_file(MANIFEST, stored).map_err(|e| e.to_string())?;
        serde_json::to_writer(&mut writer, &manifest).map_err(|e| e.to_string())?;
        /* Stored, as the app stores a scene, so its videos can be read in place (see read_file_scene). */
        writer.start_file(entry.as_str(), stored.large_file(true)).map_err(|e| e.to_string())?;
        let mut source = File::open(path).map_err(|e| e.to_string())?;
        std::io::copy(&mut source, &mut writer).map_err(|e| e.to_string())?;
        writer.finish().map_err(|e| e.to_string())?.sync_all().map_err(|e| e.to_string())?;
        check(&temp, &HashMap::from([(entry.clone(), size_of(path)?)]))
    })();
    finish(result, &temp, path)?;
    Ok(String::new())
}

fn convert_playlist(path: &Path) -> Result<String, String> {
    let target = path.with_extension("ksage");
    if target.exists() {
        return Err(format!("{} exists already", name(&target)));
    }
    let mut archive = ZipArchive::new(File::open(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let mut manifest: serde_json::Value = {
        let entry = archive.by_name("playlist.json").map_err(|e| e.to_string())?;
        serde_json::from_reader(entry).map_err(|e| e.to_string())?
    };
    manifest["kind"] = "file".into();
    let temp = temp_path(&target);
    let mut sizes = HashMap::new();
    let result = (|| {
        let mut writer = ZipWriter::new(File::create(&temp).map_err(|e| e.to_string())?);
        let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        writer.start_file(MANIFEST, stored).map_err(|e| e.to_string())?;
        serde_json::to_writer(&mut writer, &manifest).map_err(|e| e.to_string())?;
        for index in 0..archive.len() {
            let entry = archive.by_index_raw(index).map_err(|e| e.to_string())?;
            let entry_name = entry.name().map_err(|e| e.to_string())?.into_owned();
            if entry_name == "playlist.json" {
                continue;
            }
            sizes.insert(entry_name, entry.size());
            writer.raw_copy_file(entry).map_err(|e| e.to_string())?;
        }
        writer.finish().map_err(|e| e.to_string())?.sync_all().map_err(|e| e.to_string())?;
        check(&temp, &sizes)
    })();
    finish(result, &temp, &target)?;
    fs::remove_file(path).map_err(|e| format!("{} is converted, but the old file stays: {e}", name(&target)))?;
    Ok(format!("-> {} ({} entries; the .ksplaylist is deleted)", name(&target), sizes.len()))
}

/**
 * Reads the new file back: kaleidosage.json says kind "file", every scene
 * and track it names is there, and each entry in "sizes" has its size.
 */
fn check(path: &Path, sizes: &HashMap<String, u64>) -> Result<(), String> {
    let mut archive = ZipArchive::new(File::open(path).map_err(|e| e.to_string())?).map_err(|e| format!("check: {e}"))?;
    let manifest: serde_json::Value = {
        let entry = archive.by_name(MANIFEST).map_err(|e| format!("check: {e}"))?;
        serde_json::from_reader(entry).map_err(|e| format!("check: {e}"))?
    };
    if manifest["kind"] != "file" || manifest["app"] != "KaleidoSage" {
        return Err("check: the manifest is wrong".into());
    }
    for list in ["scenes", "tracks"] {
        for entry in manifest[list].as_array().into_iter().flatten().filter_map(|name| name.as_str()) {
            let file = archive.by_name(entry).map_err(|_| format!("check: {entry} is missing"))?;
            if list == "scenes" && file.compression() != CompressionMethod::Stored {
                return Err(format!("check: {entry} is not stored"));
            }
        }
    }
    for (entry, size) in sizes {
        let file = archive.by_name(entry).map_err(|_| format!("check: {entry} is missing"))?;
        if file.size() != *size {
            return Err(format!("check: {entry} has {} bytes, not {size}", file.size()));
        }
    }
    Ok(())
}

/** Puts the checked temp file in the place of "target", or removes it after a failure. */
fn finish(result: Result<(), String>, temp: &Path, target: &Path) -> Result<(), String> {
    if let Err(error) = result {
        let _ = fs::remove_file(temp);
        return Err(error);
    }
    fs::rename(temp, target).map_err(|e| {
        let _ = fs::remove_file(temp);
        format!("could not replace the old file (is it open in the app?): {e}")
    })
}
