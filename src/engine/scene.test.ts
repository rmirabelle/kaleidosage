import { describe, expect, it } from "vitest";
import { createParams, createPlayState } from "./params";
import { applyScene, blobToSceneImage, sceneImageToBlob, serializeScene } from "./scene";

const IMAGE = { type: "image/png", data: "iVBORw0KGgo=" };

describe("scene files", () => {
  it("restore every parameter and the play state", () => {
    const params = createParams();
    const state = createPlayState();
    Object.assign(params.zoom, { value: 2.2, low: 1.1, high: 3.3, rate: 0.07, on: false, phase1: 1.5, phase2: 2.5 });
    Object.assign(state, { warpMode: 2, mapMode: 4, blurMode: 1, trailMode: 2, speed: 1.75, time: 42, warpTime: 7 });
    state.groups.map = true;
    state.groups.blur = false;
    const text = serializeScene(params, state, IMAGE);

    const loadedParams = createParams();
    const loadedState = createPlayState();
    const image = applyScene(text, loadedParams, loadedState);

    expect(image).toEqual(IMAGE);
    expect(loadedParams.zoom).toMatchObject({ value: 2.2, low: 1.1, high: 3.3, rate: 0.07, on: false, phase1: 1.5, phase2: 2.5 });
    expect(loadedState).toMatchObject({ warpMode: 2, mapMode: 4, blurMode: 1, trailMode: 2, speed: 1.75, time: 42, warpTime: 7 });
    expect(loadedState.groups).toMatchObject({ map: true, blur: false });
  });

  it("clamp values and skip unknown modes", () => {
    const params = createParams();
    const state = createPlayState();
    const text = JSON.stringify({
      app: "KaleidoSage",
      version: 1,
      params: { zoom: { value: 99, low: -5 }, segments: { value: "eight" } },
      state: { mapMode: 9, speed: 50 },
      image: IMAGE
    });
    applyScene(text, params, state);
    expect(params.zoom.value).toBe(params.zoom.max);
    expect(params.zoom.low).toBe(params.zoom.min);
    expect(params.segments.value).toBe(8);
    expect(state.mapMode).toBe(1);
    expect(state.speed).toBe(4);
  });

  it("reject files that are not scenes or have no image", () => {
    expect(() => applyScene("not json", createParams(), createPlayState())).toThrow(/not a Kaleido Sage scene/);
    expect(() => applyScene("{\"app\":\"Other\"}", createParams(), createPlayState())).toThrow(/not a Kaleido Sage scene/);
    expect(() => applyScene("{\"app\":\"KaleidoSage\"}", createParams(), createPlayState())).toThrow(/no image/);
  });

  it("keep image bytes unchanged", async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128]);
    const image = await blobToSceneImage(new Blob([bytes], { type: "image/jpeg" }));
    const back = new Uint8Array(await sceneImageToBlob(image).arrayBuffer());
    expect(image.type).toBe("image/jpeg");
    expect([...back]).toEqual([...bytes]);
  });
});
