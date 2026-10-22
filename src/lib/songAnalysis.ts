import { invoke } from "@tauri-apps/api/core";
import type { SongAnalysis } from "../engine/songScript";

/**
 * Offline analysis of a track (src-tauri/src/song_analysis.rs): the beat
 * grid, loudness and band curves, and hits, in song seconds. The file is
 * decoded here, by the decoder that also plays it, so analysis and
 * playback agree on time zero. Rust's own AAC decoder starts .m4a files
 * about 50 ms later than the webview does.
 */

/** The rate the samples are sent at; it must match SAMPLE_RATE in song_analysis.rs. */
const ANALYSIS_SAMPLE_RATE = 22050;

/** The analysis format that this app reads; it must match FORMAT_VERSION in song_analysis.rs. A saved analysis of another version is made again. */
export const ANALYSIS_VERSION = 2;

/** Decodes a track to mono at ANALYSIS_SAMPLE_RATE and analyzes it. Takes a few seconds per song. */
export async function analyzeSong(path: string): Promise<SongAnalysis> {
  /* The whole file: the "video" stream that plays it sends only chunks of 2 MB. */
  const encoded = await invoke<ArrayBuffer>("read_audio_file", { path });
  const decoded = await new OfflineAudioContext(1, 1, ANALYSIS_SAMPLE_RATE).decodeAudioData(encoded);
  const mono = new Float32Array(decoded.length);
  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    const data = decoded.getChannelData(channel);
    for (let i = 0; i < mono.length; i++) mono[i] += data[i] / decoded.numberOfChannels;
  }
  return invoke<SongAnalysis>("analyze_song", new Uint8Array(mono.buffer));
}
