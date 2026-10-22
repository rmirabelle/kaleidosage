use std::path::{Path, PathBuf};

use beat_this::{BeatThis, RtenRuntime};
use ebur128::{EbuR128, Mode};
use realfft::RealFftPlanner;
use serde::Serialize;

use crate::song_sections::{find_sections, Section, LINKSEG_MODEL};
use tauri::{
    ipc::{InvokeBody, Request},
    AppHandle, Manager,
};

/**
 * Offline analysis of one song (see reports/Intelligent music driven
 * animation.md). The webview decodes the file with the same decoder that
 * plays it, so both agree on time zero, and sends mono samples at
 * SAMPLE_RATE. This finds the beat grid, loudness and band curves, and
 * hits, all in song seconds.
 */
pub const SAMPLE_RATE: u32 = 22050;

/// Curve step: 220 samples, about 100 values per second.
const HOP: usize = 220;
const WINDOW: usize = 1024;
const SILENCE_LUFS: f32 = -70.0;
const AUDIBLE_LUFS: f32 = -60.0;
/// Flux peaks about 14 ms before a sound starts: the window sees the sound before its center reaches it.
const FLUX_LEAD: f32 = 0.014;
const FORMAT_VERSION: u32 = 2;

const MEL_MODEL: &str = "mel_spectrogram.onnx";
const BEAT_MODEL: &str = "beat_this.onnx";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongAnalysis {
    pub version: u32,
    pub duration: f32,
    /// Beats per minute from the mean beat spacing.
    pub tempo: f32,
    pub beats: Vec<f32>,
    /// Bar starts; each is also in beats.
    pub downbeats: Vec<f32>,
    /// The song's parts (see song_sections.rs), in time order, from 0 to the end.
    pub sections: Vec<Section>,
    /// Curve values per second; value i is at time i / curveRate.
    pub curve_rate: f32,
    pub curves: Curves,
    pub hits: Hits,
}

/** Curves share one time step. All are 0–1 except the two loudness curves, which are in LUFS. */
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Curves {
    /// EBU R128 momentary loudness (400 ms), centered on its window.
    pub loudness: Vec<f32>,
    /// EBU R128 short-term loudness (3 s), centered on its window.
    pub loudness_short: Vec<f32>,
    /**
     * Loudness, bass, note density and brightness in one smooth curve,
     * scaled to this song. A crescendo rises here.
     */
    pub intensity: Vec<f32>,
    /// Intensity scaled to the 16 seconds around each point, so quiet parts still move.
    pub intensity_local: Vec<f32>,
    pub bass: Vec<f32>,
    pub mids: Vec<f32>,
    pub highs: Vec<f32>,
    /// Spectral centroid: how bright the sound is.
    pub brightness: Vec<f32>,
    /// Spectral flux of the whole spectrum: how many new sounds start.
    pub onsets: Vec<f32>,
}

#[derive(Serialize)]
pub struct Hits {
    pub kick: Vec<Hit>,
    pub snare: Vec<Hit>,
    pub hats: Vec<Hit>,
}

#[derive(Serialize, Clone, Copy)]
pub struct Hit {
    pub time: f32,
    pub strength: f32,
}

/// The folder for the beat models: %LOCALAPPDATA%\com.robmirabelle.kaleidosage\models.
fn model_folder(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|folder| folder.join("models"))
        .map_err(|error| format!("Could not find the app data folder: {error}"))
}

/**
 * Analyzes a song. The raw request body is mono float32 samples, little
 * endian, at SAMPLE_RATE.
 */
#[tauri::command]
pub async fn analyze_song(app: AppHandle, request: Request<'_>) -> Result<SongAnalysis, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("The song samples are missing".into());
    };
    let samples: Vec<f32> = bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect();
    let models = model_folder(&app)?;
    tauri::async_runtime::spawn_blocking(move || analyze(&samples, &models))
        .await
        .map_err(|error| format!("The song analysis stopped: {error}"))?
        .map_err(|error| format!("Could not analyze the song: {error}"))
}

/** Analyzes mono samples at SAMPLE_RATE with the models in the given folder. */
pub fn analyze(samples: &[f32], models: &Path) -> anyhow::Result<SongAnalysis> {
    for model in [MEL_MODEL, BEAT_MODEL, LINKSEG_MODEL] {
        if !models.join(model).is_file() {
            anyhow::bail!("{} is missing (run fetch-models.ps1)", models.join(model).display());
        }
    }
    let mut tracker = BeatThis::new(&RtenRuntime, &models.join(MEL_MODEL), &models.join(BEAT_MODEL))?;
    let grid = tracker.analyze_audio(samples, SAMPLE_RATE)?;
    let sections = find_sections(samples, &grid.beats, models)?;

    let rate = SAMPLE_RATE as f32 / HOP as f32;
    let spectrum = Spectrum::new(samples);
    let frames = spectrum.bass.len();
    let (loudness, loudness_short) = loudness_curves(samples, frames)?;

    let bass = scale_to_song(&to_db(&spectrum.bass));
    let mids = scale_to_song(&to_db(&spectrum.mids));
    let highs = scale_to_song(&to_db(&spectrum.highs));
    let brightness = scale_to_song(&spectrum.centroid);
    let onsets = scale_to_song(&spectrum.flux);

    // Loudness, bass, 2 s note density and brightness; centered smoothing adds no delay.
    let density = smooth(&onsets, (rate * 1.0) as usize);
    let loud = scale_to_song(&loudness);
    let mixed: Vec<f32> = (0..frames)
        .map(|i| 0.5 * loud[i] + 0.2 * bass[i] + 0.2 * density[i] + 0.1 * brightness[i])
        .collect();
    let intensity = scale_to_song(&smooth(&mixed, (rate * 0.5) as usize));
    let intensity_local = scale_locally(&intensity, rate, 8.0);

    let hits = Hits {
        kick: pick_hits(&spectrum.kick_flux, rate, 0.1),
        snare: pick_hits(&spectrum.snare_flux, rate, 0.08),
        hats: pick_hits(&spectrum.hat_flux, rate, 0.06),
    };

    // The beat model also finds beats in silence; keep only those where the song is audible.
    let audible = |time: &f32| {
        let frame = ((time * rate).round() as usize).min(frames - 1);
        let from = frame.saturating_sub((rate * 0.05) as usize);
        loudness[from..(frame + (rate * 0.05) as usize).min(frames)].iter().any(|&v| v > AUDIBLE_LUFS)
    };
    let mut grid = grid;
    grid.beats.retain(audible);
    grid.downbeats.retain(audible);

    let tempo = match (grid.beats.first(), grid.beats.last()) {
        (Some(first), Some(last)) if grid.beats.len() > 1 => 60.0 * (grid.beats.len() - 1) as f32 / (last - first),
        _ => 0.0,
    };
    Ok(SongAnalysis {
        version: FORMAT_VERSION,
        duration: samples.len() as f32 / SAMPLE_RATE as f32,
        tempo,
        beats: grid.beats,
        downbeats: grid.downbeats,
        sections,
        curve_rate: rate,
        curves: Curves {
            loudness: round(loudness),
            loudness_short: round(loudness_short),
            intensity: round(intensity),
            intensity_local: round(intensity_local),
            bass: round(bass),
            mids: round(mids),
            highs: round(highs),
            brightness: round(brightness),
            onsets: round(onsets),
        },
        hits,
    })
}

/** Band energies, centroid and flux per frame. Frame i is centered on sample i × HOP. */
struct Spectrum {
    bass: Vec<f32>,
    mids: Vec<f32>,
    highs: Vec<f32>,
    centroid: Vec<f32>,
    flux: Vec<f32>,
    kick_flux: Vec<f32>,
    snare_flux: Vec<f32>,
    hat_flux: Vec<f32>,
}

impl Spectrum {
    fn new(samples: &[f32]) -> Self {
        let mut padded = vec![0.0; WINDOW / 2];
        padded.extend_from_slice(samples);
        padded.extend(std::iter::repeat(0.0).take(WINDOW / 2));
        let frames = samples.len() / HOP + 1;

        let fft = RealFftPlanner::<f32>::new().plan_fft_forward(WINDOW);
        let mut input = fft.make_input_vec();
        let mut output = fft.make_output_vec();
        let hann: Vec<f32> = (0..WINDOW)
            .map(|i| 0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / WINDOW as f32).cos())
            .collect();
        let bin_hz = SAMPLE_RATE as f32 / WINDOW as f32;
        let bin = |hz: f32| ((hz / bin_hz).round() as usize).min(WINDOW / 2);

        let mut result = Spectrum {
            bass: Vec::with_capacity(frames),
            mids: Vec::with_capacity(frames),
            highs: Vec::with_capacity(frames),
            centroid: Vec::with_capacity(frames),
            flux: Vec::with_capacity(frames),
            kick_flux: Vec::with_capacity(frames),
            snare_flux: Vec::with_capacity(frames),
            hat_flux: Vec::with_capacity(frames),
        };
        let mut previous = vec![0.0f32; WINDOW / 2 + 1];
        let mut current = vec![0.0f32; WINDOW / 2 + 1];
        for frame in 0..frames {
            let start = frame * HOP;
            for i in 0..WINDOW {
                input[i] = padded.get(start + i).copied().unwrap_or(0.0) * hann[i];
            }
            let _ = fft.process(&mut input, &mut output);
            for (k, value) in output.iter().enumerate() {
                current[k] = value.norm();
            }
            let power = |from: f32, to: f32| current[bin(from)..bin(to)].iter().map(|m| m * m).sum::<f32>();
            result.bass.push(power(20.0, 150.0));
            result.mids.push(power(150.0, 2000.0));
            result.highs.push(power(2000.0, 11025.0));

            let total: f32 = current.iter().sum();
            let weighted: f32 = current.iter().enumerate().map(|(k, m)| k as f32 * bin_hz * m).sum();
            result.centroid.push(if total > 1e-6 { weighted / total } else { 0.0 });

            // Log-compressed rise of each bin since the last frame.
            let rise = |from: f32, to: f32| {
                (bin(from)..bin(to))
                    .map(|k| ((1.0 + 100.0 * current[k]).ln() - (1.0 + 100.0 * previous[k]).ln()).max(0.0))
                    .sum::<f32>()
            };
            result.flux.push(rise(20.0, 11025.0));
            result.kick_flux.push(rise(40.0, 150.0));
            result.snare_flux.push(rise(1500.0, 5000.0));
            result.hat_flux.push(rise(7000.0, 11025.0));
            std::mem::swap(&mut previous, &mut current);
        }
        result
    }
}

/**
 * Momentary and short-term loudness per frame. Each value is moved back by
 * half its window, so it describes the sound around the frame time, not
 * the sound before it.
 */
fn loudness_curves(samples: &[f32], frames: usize) -> anyhow::Result<(Vec<f32>, Vec<f32>)> {
    let mut meter = EbuR128::new(1, SAMPLE_RATE, Mode::M | Mode::S)?;
    let mut momentary = Vec::with_capacity(frames);
    let mut short_term = Vec::with_capacity(frames);
    let lufs = |value: f64| if value.is_finite() { (value as f32).max(SILENCE_LUFS) } else { SILENCE_LUFS };
    for chunk in samples.chunks(HOP) {
        meter.add_frames_f32(chunk)?;
        momentary.push(lufs(meter.loudness_momentary()?));
        short_term.push(lufs(meter.loudness_shortterm()?));
    }
    let centered = |values: &[f32], window_seconds: f32| {
        let shift = (window_seconds / 2.0 * SAMPLE_RATE as f32 / HOP as f32).round() as usize;
        let last = values.len().saturating_sub(1);
        (0..frames)
            .map(|i| values.get((i + shift).saturating_sub(1).min(last)).copied().unwrap_or(SILENCE_LUFS))
            .collect::<Vec<f32>>()
    };
    Ok((centered(&momentary, 0.4), centered(&short_term, 3.0)))
}

fn to_db(power: &[f32]) -> Vec<f32> {
    power.iter().map(|p| 10.0 * (p + 1e-10).log10()).collect()
}

fn percentile(values: &[f32], share: f32) -> f32 {
    let mut sorted: Vec<f32> = values.iter().copied().filter(|v| v.is_finite()).collect();
    if sorted.is_empty() {
        return 0.0;
    }
    sorted.sort_by(|a, b| a.total_cmp(b));
    sorted[((sorted.len() - 1) as f32 * share).round() as usize]
}

/** Maps the song's 5th percentile to 0 and its 95th to 1, so quiet and loud masters both use the full range. */
fn scale_to_song(values: &[f32]) -> Vec<f32> {
    let low = percentile(values, 0.05);
    let high = percentile(values, 0.95);
    let span = (high - low).max(1e-6);
    values.iter().map(|v| ((v - low) / span).clamp(0.0, 1.0)).collect()
}

/**
 * Scales each value against the 5th–95th percentile of the values within
 * `radius_seconds` around it. Percentiles are found every half second from
 * values taken every 0.1 s, then blended between those points.
 */
fn scale_locally(values: &[f32], rate: f32, radius_seconds: f32) -> Vec<f32> {
    let step = (rate * 0.5).max(1.0) as usize;
    let sample_step = (rate * 0.1).max(1.0) as usize;
    let radius = (rate * radius_seconds) as usize;
    let anchors: Vec<(f32, f32)> = (0..values.len())
        .step_by(step)
        .map(|center| {
            let from = center.saturating_sub(radius);
            let to = (center + radius).min(values.len());
            let near: Vec<f32> = values[from..to].iter().step_by(sample_step).copied().collect();
            (percentile(&near, 0.05), percentile(&near, 0.95))
        })
        .collect();
    values
        .iter()
        .enumerate()
        .map(|(i, v)| {
            let position = i as f32 / step as f32;
            let a = (position.floor() as usize).min(anchors.len() - 1);
            let b = (a + 1).min(anchors.len() - 1);
            let t = position - a as f32;
            let low = anchors[a].0 + (anchors[b].0 - anchors[a].0) * t;
            let high = anchors[a].1 + (anchors[b].1 - anchors[a].1) * t;
            // A flat stretch has nothing to scale against; it sits in the middle.
            if high - low < 0.05 {
                0.5
            } else {
                ((v - low) / (high - low)).clamp(0.0, 1.0)
            }
        })
        .collect()
}

/// Centered moving average over `radius` frames on each side.
fn smooth(values: &[f32], radius: usize) -> Vec<f32> {
    let mut sums = vec![0.0f64; values.len() + 1];
    for (i, v) in values.iter().enumerate() {
        sums[i + 1] = sums[i] + *v as f64;
    }
    (0..values.len())
        .map(|i| {
            let from = i.saturating_sub(radius);
            let to = (i + radius + 1).min(values.len());
            ((sums[to] - sums[from]) / (to - from) as f64) as f32
        })
        .collect()
}

/**
 * Finds hits in one band's flux: local peaks that stand out from the half
 * second around them, at least `min_gap` seconds apart (the stronger one
 * wins). Times are refined between frames with a parabola through the peak.
 */
fn pick_hits(flux: &[f32], rate: f32, min_gap: f32) -> Vec<Hit> {
    let top = percentile(flux, 0.99).max(1e-6);
    let level: Vec<f32> = flux.iter().map(|v| v / top).collect();
    let around = smooth(&level, (rate * 0.25) as usize);
    let mut hits: Vec<Hit> = Vec::new();
    for i in 1..level.len().saturating_sub(1) {
        let (before, here, after) = (level[i - 1], level[i], level[i + 1]);
        if here < 0.15 || here <= before || here < after || here < around[i] + 0.1 {
            continue;
        }
        let curve = before - 2.0 * here + after;
        let offset = if curve.abs() > 1e-6 { (0.5 * (before - after) / curve).clamp(-0.5, 0.5) } else { 0.0 };
        let hit = Hit { time: (i as f32 + offset) / rate + FLUX_LEAD, strength: here.min(1.0) };
        match hits.last_mut() {
            Some(last) if hit.time - last.time < min_gap => {
                if hit.strength > last.strength {
                    *last = hit;
                }
            }
            _ => hits.push(hit),
        }
    }
    hits.iter_mut().for_each(|hit| {
        hit.time = (hit.time * 1000.0).round() / 1000.0;
        hit.strength = (hit.strength * 1000.0).round() / 1000.0;
    });
    hits
}

/// Three decimals are enough for a curve and keep the JSON small.
fn round(values: Vec<f32>) -> Vec<f32> {
    values.into_iter().map(|v| (v * 1000.0).round() / 1000.0).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: f32 = SAMPLE_RATE as f32 / HOP as f32;

    /// Short 60 Hz bursts that fade out over 80 ms, like a plain kick drum.
    fn kicks(seconds: f32, times: &[f32]) -> Vec<f32> {
        let mut samples = vec![0.0; (seconds * SAMPLE_RATE as f32) as usize];
        for &time in times {
            let start = (time * SAMPLE_RATE as f32) as usize;
            for i in 0..(0.08 * SAMPLE_RATE as f32) as usize {
                let t = i as f32 / SAMPLE_RATE as f32;
                samples[start + i] += 0.8 * (1.0 - t / 0.08) * (2.0 * std::f32::consts::PI * 60.0 * t).sin();
            }
        }
        samples
    }

    #[test]
    fn finds_kicks_at_their_start_times() {
        let times: Vec<f32> = (0..16).map(|i| 0.5 + i as f32 * 0.5).collect();
        let spectrum = Spectrum::new(&kicks(9.0, &times));
        let hits = pick_hits(&spectrum.kick_flux, RATE, 0.1);
        assert_eq!(hits.len(), times.len());
        for (hit, time) in hits.iter().zip(&times) {
            assert!((hit.time - time).abs() < 0.005, "hit at {} for a kick at {time}", hit.time);
        }
    }

    #[test]
    fn centers_loudness_on_the_sound() {
        // Silence, then a steady tone from 4 s: the momentary curve must cross its midpoint near 4 s.
        let samples: Vec<f32> = (0..(8 * SAMPLE_RATE) as usize)
            .map(|i| if i < (4 * SAMPLE_RATE) as usize { 0.0 } else { 0.3 * (i as f32 * 0.05).sin() })
            .collect();
        let frames = samples.len() / HOP + 1;
        let (momentary, _) = loudness_curves(&samples, frames).unwrap();
        // Half the top power means half the 400 ms window holds the tone.
        let power: Vec<f32> = momentary.iter().map(|v| 10f32.powf(v / 10.0)).collect();
        let middle = power.iter().copied().fold(0.0, f32::max) / 2.0;
        let crossing = power.iter().position(|&v| v > middle).unwrap() as f32 / RATE;
        assert!((crossing - 4.0).abs() < 0.1, "crossed at {crossing} s");
    }

    #[test]
    fn scales_to_the_song_range() {
        let values: Vec<f32> = (0..=100).map(|i| i as f32).collect();
        let scaled = scale_to_song(&values);
        assert_eq!(scaled[0], 0.0);
        assert_eq!(scaled[100], 1.0);
        assert!((scaled[50] - 0.5).abs() < 0.01);
    }

    #[test]
    fn smooths_without_delay() {
        let step: Vec<f32> = (0..100).map(|i| if i < 50 { 0.0 } else { 1.0 }).collect();
        let smoothed = smooth(&step, 10);
        assert!((smoothed[50] - 0.5).abs() < 0.05);
        assert_eq!(smoothed[0], 0.0);
        assert_eq!(smoothed[99], 1.0);
    }

    #[test]
    fn keeps_quiet_stretches_alive_locally() {
        // A quiet half (0–0.2) and a loud half (0.8–1): local scaling spreads both over 0–1.
        let values: Vec<f32> = (0..6000)
            .map(|i| {
                let wave = (i as f32 * 0.05).sin() * 0.5 + 0.5;
                if i < 3000 { 0.2 * wave } else { 0.8 + 0.2 * wave }
            })
            .collect();
        let local = scale_locally(&values, RATE, 8.0);
        let quiet = &local[500..2000];
        assert!(quiet.iter().copied().fold(0.0, f32::max) > 0.9);
        assert!(quiet.iter().copied().fold(1.0, f32::min) < 0.1);
    }
}
