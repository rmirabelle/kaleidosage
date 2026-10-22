use std::path::Path;

use beat_this::{Model, RtenRuntime, Runtime, Tensor};
use realfft::RealFftPlanner;
use serde::Serialize;

/**
 * Song sections with LinkSeg (M. Buisson, B. McFee, S. Essid, "Using
 * Pairwise Link Prediction and Graph Attention Networks for Music
 * Structure Analysis", ISMIR 2024; model weights CC-BY 4.0). A port of
 * the MIT-licensed linkseg-web glue (github.com/elicwhite/LinkSeg-web):
 * one 64 × 64 log-mel window per beat goes into the model, which gives a
 * boundary score between each pair of beats and a label score per beat;
 * peak-picking and a vote per section turn those into sections.
 */
pub const LINKSEG_MODEL: &str = "linkseg_7c.onnx";

/// The analysis rate (song_analysis::SAMPLE_RATE); LinkSeg was trained at it.
const SAMPLE_RATE: f64 = 22050.0;
const N_FFT: usize = 1024;
const HOP: usize = 256;
const N_MELS: usize = 64;
const FRAMES: usize = 64;
/// Each beat's window: 8191 samples on each side of the beat.
const PAD: usize = (HOP * 64 - 2) / 2;
const WINDOW: usize = 2 * PAD;
/// Long songs keep every second beat until at most this many are left.
const MAX_BEATS: usize = 1500;
/// Fewer beats than this make no graph for the model.
const MIN_BEATS: usize = 4;
/// Peak-picking looks this many seconds to each side of a boundary.
const PEAK_WINDOW: f64 = 8.0;
const LABELS: [&str; 7] = ["silence", "verse", "chorus", "intro", "outro", "inst", "bridge"];

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Section {
    pub start: f32,
    pub end: f32,
    pub label: &'static str,
}

/** Finds the sections of a song: mono samples at 22050 Hz, the beat times, and the folder that holds the model. */
pub fn find_sections(samples: &[f32], beats: &[f32], models: &Path) -> anyhow::Result<Vec<Section>> {
    if beats.len() < MIN_BEATS {
        return Ok(Vec::new());
    }
    let (beat_times, offsets) = beat_windows(beats);
    if offsets.len() < MIN_BEATS {
        return Ok(Vec::new());
    }
    let padded = edge_pad(samples, PAD);
    let mel = MelFrontEnd::new();
    let mut data = vec![0.0f32; offsets.len() * N_MELS * FRAMES];
    for (n, &offset) in offsets.iter().enumerate() {
        let window = &padded[offset.min(padded.len() - WINDOW)..][..WINDOW];
        mel.window_into(window, &mut data[n * N_MELS * FRAMES..(n + 1) * N_MELS * FRAMES]);
    }
    let input = Tensor { shape: vec![offsets.len(), 1, N_MELS, FRAMES], data };
    let mut model = RtenRuntime.load_model(&models.join(LINKSEG_MODEL))?;
    let out = model.run(&[("mel", &input)])?;
    let (Some(bound), Some(label)) = (out.get("bound"), out.get("label")) else {
        anyhow::bail!("The section model gave no boundary or label output");
    };
    Ok(decode(&bound.data, &label.data, &beat_times, samples.len() as f64 / SAMPLE_RATE))
}

/**
 * The beat times the model sees and each beat window's first sample in the
 * edge-padded song: LinkSeg moves each beat to a 256-sample frame, adds a
 * beat at 0, and keeps every second beat while there are too many.
 */
fn beat_windows(beats: &[f32]) -> (Vec<f64>, Vec<usize>) {
    let mut frames: Vec<i64> = beats.iter().map(|&t| (t as f64 * SAMPLE_RATE / HOP as f64).floor() as i64).filter(|&f| f >= 0).collect();
    frames.push(0);
    frames.sort_unstable();
    frames.dedup();
    while frames.len() > MAX_BEATS {
        frames = frames.into_iter().step_by(2).collect();
    }
    let times: Vec<f64> = frames.iter().map(|&f| f as f64 * HOP as f64 / SAMPLE_RATE).collect();
    let offsets = times.iter().map(|t| (t * SAMPLE_RATE).floor() as usize).collect();
    (times, offsets)
}

/// The song with its first and last samples repeated "pad" times on each side (numpy's "edge" pad).
fn edge_pad(samples: &[f32], pad: usize) -> Vec<f32> {
    let first = samples.first().copied().unwrap_or(0.0);
    let last = samples.last().copied().unwrap_or(0.0);
    let mut out = vec![first; pad];
    out.extend_from_slice(samples);
    out.extend(std::iter::repeat(last).take(pad));
    out
}

/**
 * torchaudio's MelSpectrogram (n_fft 1024, hop 256, 64 HTK mel bands from 0
 * to 11025 Hz, power 2, centered with reflect padding, periodic Hann) and
 * AmplitudeToDB, for one beat window.
 */
struct MelFrontEnd {
    filters: Vec<Vec<f32>>,
    hann: Vec<f32>,
}

impl MelFrontEnd {
    fn new() -> Self {
        let hann = (0..N_FFT).map(|n| (0.5 - 0.5 * (2.0 * std::f64::consts::PI * n as f64 / N_FFT as f64).cos()) as f32).collect();
        MelFrontEnd { filters: mel_filters(), hann }
    }

    /// One window of WINDOW samples to 64 mel × 64 frames in dB, laid out [mel × 64 + frame].
    fn window_into(&self, window: &[f32], out: &mut [f32]) {
        let half = N_FFT / 2;
        let mut padded = Vec::with_capacity(window.len() + N_FFT);
        padded.extend((1..=half).rev().map(|k| window[k]));
        padded.extend_from_slice(window);
        padded.extend((0..half).map(|k| window[window.len() - 2 - k]));
        let fft = RealFftPlanner::<f32>::new().plan_fft_forward(N_FFT);
        let mut input = fft.make_input_vec();
        let mut spectrum = fft.make_output_vec();
        let mut power = vec![0.0f32; half + 1];
        for frame in 0..FRAMES {
            let start = frame * HOP;
            for n in 0..N_FFT {
                input[n] = padded[start + n] * self.hann[n];
            }
            let _ = fft.process(&mut input, &mut spectrum);
            for (bin, value) in spectrum.iter().enumerate() {
                power[bin] = value.norm_sqr();
            }
            for (band, filter) in self.filters.iter().enumerate() {
                let energy: f32 = filter.iter().zip(&power).map(|(f, p)| f * p).sum();
                out[band * FRAMES + frame] = 10.0 * energy.max(1e-10).log10();
            }
        }
    }
}

/// torchaudio's melscale_fbanks with the HTK mel scale and no normalization: 64 triangles over 513 bins.
fn mel_filters() -> Vec<Vec<f32>> {
    let bins = N_FFT / 2 + 1;
    let to_mel = |hz: f64| 2595.0 * (1.0 + hz / 700.0).log10();
    let to_hz = |mel: f64| 700.0 * (10f64.powf(mel / 2595.0) - 1.0);
    let top = to_mel(SAMPLE_RATE / 2.0);
    let points: Vec<f64> = (0..N_MELS + 2).map(|i| to_hz(top * i as f64 / (N_MELS + 1) as f64)).collect();
    (0..N_MELS)
        .map(|band| {
            (0..bins)
                .map(|bin| {
                    let hz = bin as f64 * (SAMPLE_RATE / 2.0) / (bins - 1) as f64;
                    let down = (hz - points[band]) / (points[band + 1] - points[band]);
                    let up = (points[band + 2] - hz) / (points[band + 2] - points[band + 1]);
                    down.min(up).max(0.0) as f32
                })
                .collect()
        })
        .collect()
}

/**
 * LinkSeg's post-processing: a boundary is a peak of the boundary score
 * that is above every other score within PEAK_WINDOW seconds before and
 * after it; each section gets the label most of its beats have (the
 * smallest class on a tie).
 */
fn decode(bound: &[f32], label: &[f32], beat_times: &[f64], duration: f64) -> Vec<Section> {
    let classes = LABELS.len();
    let middles: Vec<f64> = beat_times.windows(2).map(|pair| (pair[0] + pair[1]) / 2.0).collect();
    let mut peaks = Vec::new();
    for i in 1..bound.len().saturating_sub(1) {
        let mut left = 0;
        for j in (1..=i).rev() {
            if middles[i] - middles[j] > PEAK_WINDOW {
                left = j - 1;
                break;
            }
        }
        let mut right = middles.len() - 1;
        for j in i..middles.len() {
            if middles[j] - middles[i] > PEAK_WINDOW {
                right = j - 1;
                break;
            }
        }
        let max_left = ((left + 1)..i).map(|j| bound[j]).fold(f32::NEG_INFINITY, f32::max);
        let max_left = if max_left == f32::NEG_INFINITY { 0.0 } else { max_left };
        let max_right = ((i + 1)..right).map(|j| bound[j]).fold(f32::NEG_INFINITY, f32::max);
        let max_right = if max_right == f32::NEG_INFINITY { 10.0 } else { max_right };
        if max_left < bound[i] && bound[i] > max_right && bound[i] > 0.0 {
            peaks.push(i);
        }
    }
    let mut edges = vec![0];
    edges.extend(&peaks);
    edges.push(middles.len() - 1);
    let mut times = vec![0.0];
    times.extend(peaks.iter().map(|&i| middles[i]));
    times.push(duration);
    edges
        .windows(2)
        .enumerate()
        .map(|(s, pair)| {
            let mut counts = [0usize; LABELS.len()];
            for row in pair[0]..pair[1] {
                let scores = &label[row * classes..(row + 1) * classes];
                let best = (1..classes).fold(0, |best, c| if scores[c] > scores[best] { c } else { best });
                counts[best] += 1;
            }
            let class = (0..classes).fold(0, |best, c| if counts[c] > counts[best] { c } else { best });
            Section { start: times[s] as f32, end: times[s + 1] as f32, label: LABELS[class] }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn makes_the_htk_mel_filters_of_torchaudio() {
        // Values from torchaudio's filterbank, as linkseg-web ships it (mel-fb.json).
        let filters = mel_filters();
        assert!((filters[0][1] - 0.694_179_4).abs() < 1e-5, "{}", filters[0][1]);
        assert!((filters[0][2] - 0.628_119_8).abs() < 1e-5, "{}", filters[0][2]);
        let peak = filters[20].iter().copied().fold(0.0, f32::max);
        assert!((peak - 0.913_249_4).abs() < 1e-5, "{peak}");
        assert_eq!(filters[63][512], 0.0);
    }

    #[test]
    fn moves_beats_to_frames_and_adds_a_beat_at_zero() {
        let (times, offsets) = beat_windows(&[0.5, 1.0, 1.5]);
        assert_eq!(times.len(), 4);
        assert_eq!(times[0], 0.0);
        // 0.5 s is frame floor(0.5 × 22050 / 256) = 43, at 43 × 256 samples.
        assert_eq!(offsets[1], 43 * 256);
        assert!((times[1] - 43.0 * 256.0 / 22050.0).abs() < 1e-12);
    }

    #[test]
    fn picks_clear_boundaries_and_votes_labels() {
        // 41 beats 0.5 s apart; one clear boundary score at beat 20; beats before it say "verse", after it "chorus".
        let beat_times: Vec<f64> = (0..41).map(|i| i as f64 * 0.5).collect();
        let mut bound = vec![0.05f32; 40];
        bound[20] = 0.9;
        let mut label = vec![0.0f32; 41 * 7];
        for beat in 0..41 {
            label[beat * 7 + if beat <= 20 { 1 } else { 2 }] = 5.0;
        }
        let sections = decode(&bound, &label, &beat_times, 20.5);
        assert_eq!(sections.len(), 2);
        assert_eq!(sections[0].label, "verse");
        assert_eq!(sections[1].label, "chorus");
        assert!((sections[0].end - 10.25).abs() < 1e-6);
        assert_eq!(sections[1].end, 20.5);
    }
}
