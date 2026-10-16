import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { loadVideoBlob, loadVideoFile, stageVideoBlob } from "./videos";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(), isTauri: () => true,
  convertFileSrc: (id: string, scheme: string) => `http://${scheme}.localhost/${id}`
}));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.mocked(invoke).mockReset(); });

function fakeVideo() {
  const player = {
    onloadeddata: null as (() => void) | null,
    set src(_url: string) { queueMicrotask(() => this.onloadeddata?.()); }
  };
  vi.stubGlobal("document", { createElement: vi.fn(() => player) });
  return player;
}

it("opens native video through a stream URL without requesting its bytes", async () => {
  const player = fakeVideo();
  vi.mocked(invoke).mockResolvedValue({ id: "7", mime: "video/mp4" });
  expect((await loadVideoFile("D:/VR/large.mp4")).video).toBe(player);
  expect(invoke).toHaveBeenCalledExactlyOnceWith("open_video_file", { path: "D:/VR/large.mp4" });
});

it("does not impose a file-size cap on disk-backed browser Files", async () => {
  fakeVideo();
  const makeUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:video");
  const file = { size: 5 * 1024 * 1024 * 1024 } as Blob;
  await expect(loadVideoBlob(file)).resolves.toBeDefined();
  expect(makeUrl).toHaveBeenCalledWith(file);
});

it("stages browser video in bounded chunks without reading the whole blob", async () => {
  const blob = new Blob([new Uint8Array(5 * 1024 * 1024)], { type: "video/mp4" });
  const wholeRead = vi.spyOn(blob, "arrayBuffer");
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "begin_video_upload") return "upload";
    if (command === "finish_video_upload") return { id: "8", mime: "video/mp4" };
  });
  expect(await stageVideoBlob(blob)).toEqual({ id: "8", mime: "video/mp4" });
  expect(wholeRead).not.toHaveBeenCalled();
  const chunks = vi.mocked(invoke).mock.calls.filter(([command]) => command === "append_video_upload");
  expect(chunks.map(([, data]) => (data as ArrayBuffer).byteLength)).toEqual([2097152, 2097152, 1048576]);
  expect(chunks.map(([, , options]) => options?.headers)).toEqual([
    { "video-id": "upload", offset: "0" },
    { "video-id": "upload", offset: "2097152" },
    { "video-id": "upload", offset: "4194304" }
  ]);
});
