use std::path::{Path, PathBuf};
use std::time::Instant;

use kaleidosage_lib::song_analysis::{analyze, Hit, SAMPLE_RATE};

/**
 * Runs the song analysis on a file from the command line and prints a
 * summary. The app decodes in the webview instead; symphonia, used here,
 * starts AAC (.m4a) files about 50 ms late.
 *
 *   cargo run --release --example analyze_song -- <song> [out.json]
 */
fn main() -> anyhow::Result<()> {
    let song = std::env::args().nth(1).expect("usage: analyze_song <song> [out.json]");
    let models = PathBuf::from(std::env::var("LOCALAPPDATA")?).join("com.robmirabelle.kaleidosage\\models");

    let start = Instant::now();
    let audio = beat_this::load_audio(Path::new(&song), SAMPLE_RATE)?;
    let decoded = start.elapsed();
    let analysis = analyze(&audio.samples, &models)?;
    let analyzed = start.elapsed() - decoded;

    let c = &analysis.curves;
    println!("song       : {song}");
    println!("length     : {:.1} s", analysis.duration);
    println!("time       : decode {:.2} s, analysis {:.2} s", decoded.as_secs_f32(), analyzed.as_secs_f32());
    println!("tempo      : {:.1} BPM, {} beats, {} bars", analysis.tempo, analysis.beats.len(), analysis.downbeats.len());
    println!("loudness   : {:.1} to {:.1} LUFS (momentary)", min(&c.loudness), max(&c.loudness));
    println!("hits       : {} kick, {} snare, {} hats", analysis.hits.kick.len(), analysis.hits.snare.len(), analysis.hits.hats.len());
    println!("kick offset: {}", offset_summary(&analysis.hits.kick, &analysis.beats));
    println!("intensity by 10 s: {}", by_ten_seconds(&c.intensity, analysis.curve_rate));
    for section in &analysis.sections {
        println!("section    : {:>6.1} – {:>6.1} s  {}", section.start, section.end, section.label);
    }

    if let Some(out) = std::env::args().nth(2) {
        std::fs::write(&out, serde_json::to_string(&analysis)?)?;
        println!("json       : {out}");
    }
    Ok(())
}

fn min(values: &[f32]) -> f32 {
    values.iter().copied().fold(f32::INFINITY, f32::min)
}

fn max(values: &[f32]) -> f32 {
    values.iter().copied().fold(f32::NEG_INFINITY, f32::max)
}

/** For strong kicks within 60 ms of a beat: how many, and the median time from beat to kick. */
fn offset_summary(kicks: &[Hit], beats: &[f32]) -> String {
    let mut offsets: Vec<f32> = kicks
        .iter()
        .filter(|kick| kick.strength > 0.5)
        .filter_map(|kick| {
            let nearest = beats.iter().map(|beat| kick.time - beat).min_by(|a, b| a.abs().total_cmp(&b.abs()))?;
            (nearest.abs() < 0.06).then_some(nearest)
        })
        .collect();
    if offsets.is_empty() {
        return "no strong kicks near beats".into();
    }
    offsets.sort_by(|a, b| a.total_cmp(b));
    format!("{} strong kicks on beats, median {:+.0} ms (kick after beat is +)", offsets.len(), offsets[offsets.len() / 2] * 1000.0)
}

/// Mean intensity per 10 seconds as digits 0–9, so the song's shape shows on one line.
fn by_ten_seconds(values: &[f32], rate: f32) -> String {
    values
        .chunks((rate * 10.0) as usize)
        .map(|chunk| {
            let mean = chunk.iter().sum::<f32>() / chunk.len() as f32;
            char::from_digit((mean * 9.99) as u32, 10).unwrap_or('?')
        })
        .collect()
}
