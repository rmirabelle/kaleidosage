import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { megabytes, songModels, type ModelProgress } from "./songModels";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
afterEach(() => { vi.mocked(invoke).mockReset(); vi.mocked(listen).mockReset(); });

/** Catches the progress events' handler, and returns a function that sends one, and the listener's stop. */
function fakeEvents() {
  const stop = vi.fn();
  let handler: (event: { payload: ModelProgress }) => void = () => {};
  vi.mocked(listen).mockImplementation(async (_name, callback) => {
    handler = callback as typeof handler;
    return stop;
  });
  return { stop, send: (payload: ModelProgress) => handler({ payload }) };
}

it("shows the progress while the files download, and none after", async () => {
  const events = fakeEvents();
  let finish = () => {};
  vi.mocked(invoke).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }) as never);
  const seen: (ModelProgress | null)[] = [];
  const unsubscribe = songModels.subscribe(() => seen.push(songModels.progress));
  const ready = songModels.ensure();
  await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith("ensure_song_models"));
  events.send({ downloaded: 10, total: 100 });
  expect(songModels.progress).toEqual({ downloaded: 10, total: 100 });
  finish();
  await ready;
  unsubscribe();
  expect(songModels.progress).toBeNull();
  expect(seen).toEqual([{ downloaded: 10, total: 100 }, null]);
  expect(events.stop).toHaveBeenCalledOnce();
});

it("shares one call between the tracks that ask at the same time", async () => {
  fakeEvents();
  vi.mocked(invoke).mockResolvedValue(undefined);
  await Promise.all([songModels.ensure(), songModels.ensure()]);
  expect(invoke).toHaveBeenCalledOnce();
});

it("tries again after a failed download", async () => {
  const events = fakeEvents();
  vi.mocked(invoke).mockRejectedValueOnce("no internet").mockResolvedValueOnce(undefined);
  await expect(songModels.ensure()).rejects.toBe("no internet");
  expect(events.stop).toHaveBeenCalledOnce();
  expect(songModels.progress).toBeNull();
  await expect(songModels.ensure()).resolves.toBeUndefined();
  expect(invoke).toHaveBeenCalledTimes(2);
});

it("counts megabytes as Windows does", () => {
  expect(megabytes(85_007_431)).toBe(81);
});
