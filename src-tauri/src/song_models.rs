use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{bail, Context, Result};
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use tauri::{async_runtime::Mutex, AppHandle, Emitter, Manager, State};
use tokio::io::AsyncWriteExt;

use crate::song_analysis::{BEAT_MODEL, MEL_MODEL};
use crate::song_sections::LINKSEG_MODEL;

/**
 * The models that the song analysis needs (see song_analysis.rs and
 * song_sections.rs). They are too large for the installer, so the app
 * downloads them the first time it analyzes a song, and checks each file's
 * SHA-256. Beat This! is MIT licensed (https://github.com/CPJKU/beat_this and
 * https://github.com/danigb/beat-this-rs); LinkSeg is CC BY 4.0 (M. Buisson,
 * B. McFee, S. Essid, ISMIR 2024; https://huggingface.co/elicwhite/linkseg-7c-onnx).
 */
struct Model {
    name: &'static str,
    url: &'static str,
    sha256: &'static str,
    size: u64,
}

const MODELS: [Model; 3] = [
    Model {
        name: MEL_MODEL,
        url: "https://raw.githubusercontent.com/danigb/beat-this-rs/1ae768e78f1ad83b0ed3886241dc29ffde853c40/models/mel_spectrogram.onnx",
        sha256: "fdd59e65c515331308e4c8841edf99972deca646bdf6197744c2a5b7755e3de9",
        size: 270_742,
    },
    Model {
        name: BEAT_MODEL,
        url: "https://github.com/danigb/beat-this-rs/releases/download/model-large/beat_this.onnx",
        sha256: "5f810debe53459b559127fb55bbad40035bb47cc567b20e501670f968c770f02",
        size: 83_162_650,
    },
    Model {
        name: LINKSEG_MODEL,
        url: "https://huggingface.co/elicwhite/linkseg-7c-onnx/resolve/b15f9d9f5f68409cbd2cc0e78beb208df497c6f5/linkseg_7c.onnx",
        sha256: "c1dac2e094d260678d0097b85da6f5189abfe87af4b9c6f7adebaf99f4896125",
        size: 1_574_039,
    },
];

const USER_AGENT: &str = "KaleidoSage";
/// Progress goes to the page after each such number of bytes.
const PROGRESS_STEP: u64 = 256 * 1024;

/// One download at a time: a second call waits, then finds the files in place.
#[derive(Default)]
pub struct ModelDownload(Mutex<()>);

/// The folder for the models: %LOCALAPPDATA%\com.robmirabelle.kaleidosage\models.
pub fn model_folder(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|folder| folder.join("models"))
        .map_err(|error| format!("Could not find the app data folder: {error}"))
}

/// The models with no file of the right size in the folder. A file gets its name only after its SHA-256 check.
fn missing_models(folder: &Path) -> Vec<&'static Model> {
    MODELS
        .iter()
        .filter(|model| !std::fs::metadata(folder.join(model.name)).is_ok_and(|file| file.len() == model.size))
        .collect()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/**
 * Downloads each missing model into the folder. "on_progress" gets the bytes
 * done and the bytes to do, over all the files of this download.
 */
async fn download_missing(folder: &Path, mut on_progress: impl FnMut(u64, u64) + Send) -> Result<()> {
    let missing = missing_models(folder);
    let total: u64 = missing.iter().map(|model| model.size).sum();
    tokio::fs::create_dir_all(folder).await.with_context(|| format!("create {}", folder.display()))?;
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(Duration::from_secs(30))
        .read_timeout(Duration::from_secs(60))
        .build()?;
    let mut done = 0_u64;
    on_progress(done, total);
    for model in missing {
        download_model(&client, model, folder, &mut done, total, &mut on_progress)
            .await
            .with_context(|| model.name)?;
    }
    Ok(())
}

async fn download_model(
    client: &reqwest::Client,
    model: &Model,
    folder: &Path,
    done: &mut u64,
    total: u64,
    on_progress: &mut (impl FnMut(u64, u64) + Send),
) -> Result<()> {
    let response = client.get(model.url).send().await?;
    if !response.status().is_success() {
        bail!("the server returned {}", response.status());
    }
    let part = folder.join(format!("{}.part", model.name));
    let mut file = tokio::fs::File::create(&part).await.with_context(|| format!("create {}", part.display()))?;
    let mut hash = Sha256::new();
    let mut stream = response.bytes_stream();
    let mut reported = *done;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk).await?;
        hash.update(&chunk);
        *done += chunk.len() as u64;
        if *done - reported >= PROGRESS_STEP {
            reported = *done;
            on_progress(*done, total);
        }
    }
    file.flush().await?;
    drop(file);
    if hex(&hash.finalize()) != model.sha256 {
        let _ = tokio::fs::remove_file(&part).await;
        bail!("the file failed its SHA-256 check");
    }
    tokio::fs::rename(&part, folder.join(model.name)).await?;
    Ok(())
}

/**
 * Makes sure that the song models are in place. It does nothing when they
 * are, and else downloads what is missing, with "song-models-progress" events.
 */
#[tauri::command]
pub async fn ensure_song_models(app: AppHandle, download: State<'_, ModelDownload>) -> Result<(), String> {
    let _one_at_a_time = download.0.lock().await;
    let folder = model_folder(&app)?;
    if missing_models(&folder).is_empty() {
        return Ok(());
    }
    download_missing(&folder, |downloaded, total| {
        let _ = app.emit("song-models-progress", serde_json::json!({ "downloaded": downloaded, "total": total }));
    })
    .await
    .map_err(|error| format!("Could not download the song analysis files. Check your internet connection, then play the song again. ({error:#})"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_a_hash_as_hex() {
        let hash = Sha256::digest(b"abc");
        assert_eq!(hex(&hash), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    #[test]
    fn a_file_of_the_wrong_size_is_missing() {
        let folder = tempfile::tempdir().unwrap();
        assert_eq!(missing_models(folder.path()).len(), 3);
        std::fs::write(folder.path().join(LINKSEG_MODEL), b"too short").unwrap();
        assert_eq!(missing_models(folder.path()).len(), 3);
        std::fs::write(folder.path().join(LINKSEG_MODEL), vec![0_u8; 1_574_039]).unwrap();
        let left: Vec<_> = missing_models(folder.path()).iter().map(|model| model.name).collect();
        assert_eq!(left, [MEL_MODEL, BEAT_MODEL]);
    }

    /// Downloads about 81 MB. Run it with: cargo test --lib song_models -- --ignored
    #[test]
    #[ignore]
    fn downloads_and_checks_every_model() {
        let folder = tempfile::tempdir().unwrap();
        let mut last = (0, 1);
        tauri::async_runtime::block_on(download_missing(folder.path(), |done, total| last = (done, total))).unwrap();
        assert!(missing_models(folder.path()).is_empty());
        assert_eq!(last.1, MODELS.iter().map(|model| model.size).sum::<u64>());
    }
}
