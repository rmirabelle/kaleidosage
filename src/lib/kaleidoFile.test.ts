import { describe, expect, it } from "vitest";
import { fileFingerprint, isFileCopy, isShow, readManifest, writeManifest } from "./kaleidoFile";

const AUDIO = { kind: "tracks", device: null, gainDb: 3, thresholdDb: -36 } as const;

describe("Kaleido Sage files", () => {
  it("read back the audio settings and the selected scene", () => {
    expect(readManifest(writeManifest({ audio: AUDIO, activeScene: 2 }))).toEqual({ audio: AUDIO, activeScene: 2 });
  });

  it("leave out broken audio settings, and refuse other files", () => {
    const text = JSON.stringify({ app: "KaleidoSage", kind: "file", audio: { kind: "radio", gainDb: "loud", thresholdDb: -30 }, activeScene: -1 });
    expect(readManifest(text)).toEqual({ audio: { thresholdDb: -30 }, activeScene: 0 });
    expect(() => readManifest("{}")).toThrow("not a Kaleido Sage file");
    expect(() => readManifest("not json")).toThrow("not a Kaleido Sage file");
  });

  it("read back Song follow, and leave it out of older files", () => {
    expect(readManifest(writeManifest({ audio: AUDIO, activeScene: 0, songFollow: true })).songFollow).toBe(true);
    expect(readManifest(writeManifest({ audio: AUDIO, activeScene: 0, songFollow: false })).songFollow).toBe(false);
    expect(readManifest(writeManifest({ audio: AUDIO, activeScene: 0 })).songFollow).toBeUndefined();
  });

  it("read back the Files column width, and leave it out of older files", () => {
    expect(readManifest(writeManifest({ audio: AUDIO, activeScene: 0, filesWidth: 420 })).filesWidth).toBe(420);
    expect(readManifest(writeManifest({ audio: AUDIO, activeScene: 0 })).filesWidth).toBeUndefined();
  });

  it("read back the track lengths, with null for a length that is not known", () => {
    expect(readManifest(writeManifest({ audio: AUDIO, activeScene: 0, trackSeconds: [183.5, null] })).trackSeconds).toEqual([183.5, null]);
    expect(readManifest(writeManifest({ audio: AUDIO, activeScene: 0 })).trackSeconds).toBeUndefined();
  });

  it("count a new scene order, track or audio setting as a change", () => {
    const base = fileFingerprint(["a.ksage", "b.ksage"], ["song.mp3"], AUDIO);
    expect(fileFingerprint(["b.ksage", "a.ksage"], ["song.mp3"], AUDIO)).not.toBe(base);
    expect(fileFingerprint(["a.ksage", "b.ksage"], [], AUDIO)).not.toBe(base);
    expect(fileFingerprint(["a.ksage", "b.ksage"], ["song.mp3"], { ...AUDIO, gainDb: 4 })).not.toBe(base);
    expect(fileFingerprint(["a.ksage", "b.ksage"], ["song.mp3"], { ...AUDIO })).toBe(base);
    expect(fileFingerprint(["a.ksage", "b.ksage"], ["song.mp3"], AUDIO, 420)).not.toBe(base);
  });
});

describe("shows and single scenes", () => {
  const file = (scenes: number, tracks: number) => ({
    scenes: Array.from({ length: scenes }, (_, index) => ({ name: `${index}.ksage`, bytes: 1, seconds: null })),
    tracks: Array.from({ length: tracks }, (_, index) => ({ name: `${index}.mp3`, bytes: 1, seconds: null }))
  });

  it("call a file with two or more scenes, or with audio files, a show", () => {
    expect(isShow(file(1, 0))).toBe(false);
    expect(isShow(file(2, 0))).toBe(true);
    expect(isShow(file(1, 1))).toBe(true);
    expect(isShow(file(0, 0))).toBe(false);
  });

  it("know the open file's own copies by their temp folder", () => {
    expect(isFileCopy(String.raw`C:\Temp\kaleidosage-file-ab12\scenes\0\Night.ksage`)).toBe(true);
    expect(isFileCopy(String.raw`D:\Images\Kaleido Sage\Night.ksage`)).toBe(false);
    expect(isFileCopy(null)).toBe(false);
  });
});
