/**
 * Forward and back: a copy of a source video that plays forward and then
 * in reverse, so it loops with no jump. FFmpeg makes it in three steps. It
 * cuts the video into short parts, so a reversed part fits in memory. It
 * reverses each part. Then it joins the parts forward and the reversed
 * parts in reverse order. The copy has no sound (source videos are muted)
 * and stays in the video cache, so the same video is made only once.
 */
use crate::video_stream::{VideoInfo, VideoSource, Videos};
use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    io::Read,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};
use tauri::{path::BaseDirectory, AppHandle, Manager};

/** One copy at a time: FFmpeg uses all the processor for each. */
static MAKING: Mutex<()> = Mutex::new(());

/** The length of each part, in seconds. A reversed part holds all its frames in memory. */
const PART_SECONDS: u32 = 2;

/** Windows process flags: no console window, and below normal priority so the app stays smooth. */
#[cfg(windows)]
const PROCESS_FLAGS: u32 = 0x0800_0000 | 0x0000_4000;

#[tauri::command]
pub async fn bounce_video(app: AppHandle, id: String) -> Result<VideoInfo, String> {
    let source = app.state::<Videos>().get(&id)?;
    let ffmpeg = app
        .path()
        .resolve("ffmpeg/ffmpeg.exe", BaseDirectory::Resource)
        .map_err(|e| format!("Could not find FFmpeg: {e}"))?;
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("video-bounce");
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MAKING
            .lock()
            .map_err(|_| "The video maker is unavailable.")?;
        std::fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
        let output = cache.join(format!("{:016x}.mp4", cache_key(&source)?));
        if !output.is_file() {
            make_bounce(&ffmpeg, &source, &cache, &output)?;
        }
        app.state::<Videos>().add(VideoSource::open(&output)?)
    })
    .await
    .map_err(|e| format!("The forward-and-back video stopped: {e}"))?
}

/** A key for the video's bytes: its length and its first megabyte. */
fn cache_key(source: &VideoSource) -> Result<u64, String> {
    let mut key = DefaultHasher::new();
    "bounce-v1".hash(&mut key);
    source.len.hash(&mut key);
    let mut buffer = vec![0u8; 1 << 20];
    let read = read_full(&mut source.reader(), &mut buffer)?;
    buffer[..read].hash(&mut key);
    Ok(key.finish())
}

fn read_full(reader: &mut impl Read, buffer: &mut [u8]) -> Result<usize, String> {
    let mut total = 0;
    while total < buffer.len() {
        let read = reader.read(&mut buffer[total..]).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        total += read;
    }
    Ok(total)
}

fn make_bounce(ffmpeg: &Path, source: &VideoSource, cache: &Path, output: &Path) -> Result<(), String> {
    let work = tempfile::Builder::new()
        .prefix("bounce-")
        .tempdir_in(cache)
        .map_err(|e| e.to_string())?;
    let dir = work.path();
    /* FFmpeg needs a file: the source may be a range inside a scene file. */
    let input = dir.join("input.video");
    let mut file = std::fs::File::create(&input).map_err(|e| e.to_string())?;
    std::io::copy(&mut source.reader(), &mut file).map_err(|e| e.to_string())?;
    drop(file);

    /* The same encoding for every part, so the parts join with no new encode. */
    let encode = [
        "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p",
    ];
    let keyframes = format!("expr:gte(t,n_forced*{PART_SECONDS})");
    let mut cut = vec![
        "-i".to_string(),
        input.to_string_lossy().into_owned(),
        "-vf".into(),
        "scale=trunc(iw/2)*2:trunc(ih/2)*2".into(),
    ];
    cut.extend(encode.iter().map(|arg| arg.to_string()));
    cut.extend([
        "-force_key_frames".into(),
        keyframes,
        "-f".into(),
        "segment".into(),
        "-segment_time".into(),
        PART_SECONDS.to_string(),
        "-reset_timestamps".into(),
        "1".into(),
        dir.join("f%04d.mp4").to_string_lossy().into_owned(),
    ]);
    run(ffmpeg, &cut)?;

    let mut parts: Vec<PathBuf> = std::fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with('f') && name.ends_with(".mp4"))
        })
        .collect();
    parts.sort();
    if parts.is_empty() {
        return Err("FFmpeg made no video parts.".into());
    }
    let mut list = String::new();
    for part in &parts {
        list.push_str(&list_line(part));
    }
    for part in parts.iter().rev() {
        let name = part.file_name().unwrap().to_string_lossy().replacen('f', "r", 1);
        let reversed = dir.join(name);
        let mut args = vec![
            "-i".to_string(),
            part.to_string_lossy().into_owned(),
            "-vf".into(),
            "reverse".into(),
        ];
        args.extend(encode.iter().map(|arg| arg.to_string()));
        args.push(reversed.to_string_lossy().into_owned());
        run(ffmpeg, &args)?;
        list.push_str(&list_line(&reversed));
    }
    let list_path = dir.join("list.txt");
    std::fs::write(&list_path, list).map_err(|e| e.to_string())?;
    let partial = output.with_extension("partial.mp4");
    let join = [
        "-f".to_string(),
        "concat".into(),
        "-safe".into(),
        "0".into(),
        "-i".into(),
        list_path.to_string_lossy().into_owned(),
        "-c".into(),
        "copy".into(),
        "-movflags".into(),
        "+faststart".into(),
        partial.to_string_lossy().into_owned(),
    ];
    if let Err(error) = run(ffmpeg, &join) {
        let _ = std::fs::remove_file(&partial);
        return Err(error);
    }
    std::fs::rename(&partial, output).map_err(|e| format!("Could not finish the video cache: {e}"))
}

/** A line of FFmpeg's concat list, with the path's quotes escaped. */
fn list_line(path: &Path) -> String {
    format!("file '{}'\n", path.to_string_lossy().replace('\'', "'\\''"))
}

fn run(ffmpeg: &Path, args: &[String]) -> Result<(), String> {
    let mut command = Command::new(ffmpeg);
    command.args(["-hide_banner", "-loglevel", "error", "-y"]).args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(PROCESS_FLAGS);
    }
    let result = command
        .output()
        .map_err(|e| format!("Could not start FFmpeg: {e}"))?;
    if result.status.success() {
        return Ok(());
    }
    let error = String::from_utf8_lossy(&result.stderr);
    Err(format!(
        "FFmpeg could not make the forward-and-back video: {}",
        error.lines().last().unwrap_or("unknown error")
    ))
}
