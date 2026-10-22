import { describe, expect, it } from "vitest";
import { playlistFingerprint, readManifest, writeManifest } from "./playlistFile";

const AUDIO = { kind: "tracks", device: null, gainDb: 3, thresholdDb: -36 } as const;

describe("playlist files", () => {
  it("read back the audio settings and the selected scene", () => {
    expect(readManifest(writeManifest({ audio: AUDIO, activeScene: 2 }))).toEqual({ audio: AUDIO, activeScene: 2 });
  });

  it("leave out broken audio settings, and refuse other files", () => {
    const text = JSON.stringify({ app: "KaleidoSage", kind: "playlist", audio: { kind: "radio", gainDb: "loud", thresholdDb: -30 }, activeScene: -1 });
    expect(readManifest(text)).toEqual({ audio: { thresholdDb: -30 }, activeScene: 0 });
    expect(() => readManifest("{}")).toThrow("not a Kaleido Sage playlist");
    expect(() => readManifest("not json")).toThrow("not a Kaleido Sage playlist");
  });

  it("read back Song follow, and leave it out of older playlists", () => {
    expect(readManifest(writeManifest({ audio: AUDIO, activeScene: 0, songFollow: true })).songFollow).toBe(true);
    expect(readManifest(writeManifest({ audio: AUDIO, activeScene: 0, songFollow: false })).songFollow).toBe(false);
    expect(readManifest(writeManifest({ audio: AUDIO, activeScene: 0 })).songFollow).toBeUndefined();
  });

  it("read back the Files column width, and leave it out of older playlists", () => {
    expect(readManifest(writeManifest({ audio: AUDIO, activeScene: 0, filesWidth: 420 })).filesWidth).toBe(420);
    expect(readManifest(writeManifest({ audio: AUDIO, activeScene: 0 })).filesWidth).toBeUndefined();
  });

  it("read back the track lengths, with null for a length that is not known", () => {
    expect(readManifest(writeManifest({ audio: AUDIO, activeScene: 0, trackSeconds: [183.5, null] })).trackSeconds).toEqual([183.5, null]);
    expect(readManifest(writeManifest({ audio: AUDIO, activeScene: 0 })).trackSeconds).toBeUndefined();
  });

  it("count a new scene order, track or audio setting as a change", () => {
    const base = playlistFingerprint(["a.ksage", "b.ksage"], ["song.mp3"], AUDIO);
    expect(playlistFingerprint(["b.ksage", "a.ksage"], ["song.mp3"], AUDIO)).not.toBe(base);
    expect(playlistFingerprint(["a.ksage", "b.ksage"], [], AUDIO)).not.toBe(base);
    expect(playlistFingerprint(["a.ksage", "b.ksage"], ["song.mp3"], { ...AUDIO, gainDb: 4 })).not.toBe(base);
    expect(playlistFingerprint(["a.ksage", "b.ksage"], ["song.mp3"], { ...AUDIO })).toBe(base);
    expect(playlistFingerprint(["a.ksage", "b.ksage"], ["song.mp3"], AUDIO, 420)).not.toBe(base);
  });
});
