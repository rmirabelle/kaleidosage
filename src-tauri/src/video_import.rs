//! A Windows decoder fallback for containers the webview cannot open.
use crate::video_stream::{VideoInfo, VideoSource, Videos};
use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager};

// The preview and Open action can request the same file. Finish one conversion
// at a time and reuse its cache entry instead of launching duplicate encoders.
static CONVERSION: Mutex<()> = Mutex::new(());

#[tauri::command]
pub async fn compatible_video(app: AppHandle, id: String) -> Result<VideoInfo, String> {
    let source = app.state::<Videos>().get(&id)?;
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("video-import");
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
        let extension = match source.mime.as_str() {
            "video/webm" => ".webm",
            "video/quicktime" => ".mov",
            "video/x-msvideo" => ".avi",
            _ => ".mp4",
        };
        // Windows needs a standalone input file. Stream the source, which may
        // itself be a range inside a scene, to a temporary disk file.
        let mut input = tempfile::Builder::new()
            .suffix(extension)
            .tempfile_in(&cache)
            .map_err(|e| e.to_string())?;
        std::io::copy(&mut source.reader(), input.as_file_mut()).map_err(|e| e.to_string())?;
        let output = compatible_copy(input.path(), &cache)?;
        app.state::<Videos>().add(VideoSource::open(&output)?)
    })
    .await
    .map_err(|e| format!("Video conversion stopped: {e}"))?
}

fn compatible_copy(source: &Path, cache: &Path) -> Result<PathBuf, String> {
    let _guard = CONVERSION
        .lock()
        .map_err(|_| "The video converter is unavailable.")?;
    let source = source
        .canonicalize()
        .map_err(|e| format!("Could not open the video: {e}"))?;
    let metadata = source.metadata().map_err(|e| e.to_string())?;
    if !metadata.is_file() {
        return Err("The selected video is not a file.".into());
    }
    let mut key = DefaultHasher::new();
    "h264-mp4-v1".hash(&mut key);
    source.hash(&mut key);
    metadata.len().hash(&mut key);
    metadata
        .modified()
        .map_err(|e| e.to_string())?
        .hash(&mut key);
    std::fs::create_dir_all(cache).map_err(|e| format!("Could not create the video cache: {e}"))?;
    let output = cache.join(format!("{:016x}.mp4", key.finish()));
    if !output.is_file() {
        let partial = output.with_extension("partial.mp4");
        let result = transcode(&source, &partial);
        if let Err(error) = result {
            let _ = std::fs::remove_file(&partial);
            return Err(format!("The app's video player could not open this file, and Windows could not create a compatible copy: {error}"));
        }
        std::fs::rename(&partial, &output)
            .map_err(|e| format!("Could not finish the video cache: {e}"))?;
    }
    Ok(output)
}

#[cfg(windows)]
fn transcode(source: &Path, output: &Path) -> Result<(), String> {
    use windows::{
        core::HSTRING,
        Media::{
            MediaProperties::{MediaEncodingProfile, VideoEncodingQuality},
            Transcoding::MediaTranscoder,
        },
        Storage::StorageFile,
        Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
    };
    struct Apartment;
    impl Drop for Apartment {
        fn drop(&mut self) {
            unsafe {
                RoUninitialize();
            }
        }
    }
    unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.map_err(|e| e.to_string())?;
    let _apartment = Apartment;
    // StorageFile needs an existing destination. This is our cache file only.
    std::fs::File::create(output).map_err(|e| e.to_string())?;
    let convert = || -> windows::core::Result<()> {
        // canonicalize() adds a Win32 verbatim prefix, which StorageFile rejects.
        let path = source.to_string_lossy();
        let path = if let Some(unc) = path.strip_prefix(r"\\?\UNC\") {
            format!(r"\\{unc}")
        } else {
            path.strip_prefix(r"\\?\").unwrap_or(&path).to_owned()
        };
        let input = StorageFile::GetFileFromPathAsync(&HSTRING::from(path))?.get()?;
        let destination =
            StorageFile::GetFileFromPathAsync(&HSTRING::from(output.as_os_str()))?.get()?;
        let profile = MediaEncodingProfile::CreateMp4(VideoEncodingQuality::Auto)?;
        // Sources are muted in Kaleido Sage; omit audio so an audio codec cannot
        // prevent importing an otherwise decodable video.
        profile.SetAudio(None)?;
        let converter = MediaTranscoder::new()?;
        let prepared = converter
            .PrepareFileTranscodeAsync(&input, &destination, &profile)?
            .get()?;
        if !prepared.CanTranscode()? {
            return Err(windows::core::Error::new(
                windows::core::HRESULT(0x80004005u32 as i32),
                format!("Windows converter: {:?}", prepared.FailureReason()?),
            ));
        }
        prepared.TranscodeAsync()?.get()?;
        Ok(())
    };
    convert().map_err(|e| e.to_string())
}

#[cfg(not(windows))]
fn transcode(_source: &Path, _output: &Path) -> Result<(), String> {
    Err("Automatic video conversion is currently available on Windows only.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    /// Opt-in smoke test for a real local file, without changing that file.
    #[test]
    #[ignore = "set KALEIDOSAGE_TEST_VIDEO to a local video path"]
    fn converts_local_video() {
        let source =
            std::path::PathBuf::from(std::env::var("KALEIDOSAGE_TEST_VIDEO").expect("video path"));
        let cache =
            std::env::temp_dir().join(format!("kaleidosage-video-test-{}", std::process::id()));
        let output = compatible_copy(&source, &cache).expect("Windows conversion");
        let mut bytes = [0u8; 8];
        std::fs::File::open(&output)
            .unwrap()
            .read_exact(&mut bytes)
            .unwrap();
        assert_eq!(&bytes[4..8], b"ftyp");
        let cached = compatible_copy(&source, &cache).expect("cached conversion");
        assert_eq!(output, cached);
        println!(
            "Converted {} to {} MP4 bytes in {}",
            source.display(),
            output.metadata().unwrap().len(),
            cache.display()
        );
    }
}
