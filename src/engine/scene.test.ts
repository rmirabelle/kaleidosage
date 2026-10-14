import { describe, expect, it } from "vitest";
import { createParams, createPlayState } from "./params";
import { applyScene, blobToSceneImage, sceneFingerprint, sceneImageToBlob, serializeScene } from "./scene";

const IMAGE = { type: "image/png", data: "iVBORw0KGgo=" };
const IMAGE2 = { type: "image/jpeg", data: "/9j/4AAQ" };

describe("scene files", () => {
  it("restore every parameter and the play state", () => {
    const params = createParams();
    const state = createPlayState();
    Object.assign(params.zoom, { value: 2.2, low: 1.1, high: 3.3, on: false, custom: true, seconds: 12, startTime: 4.5 });
    Object.assign(params.panX, { on: true, ease: "bounce" });
    Object.assign(state, { blendMode: 1, warpMode: 2, mapMode: 4, blurMask: 3, trailMode: 2, overlayColor: "#12ab9f", time: 42, clock: 30, warpTime: 7 });
    params.cycle.value = 13;
    state.groups.map = true;
    state.groups.blur = false;
    const text = serializeScene(params, state, { image: IMAGE });

    const loadedParams = createParams();
    const loadedState = createPlayState();
    const images = applyScene(text, loadedParams, loadedState);

    expect(images).toEqual({ image: IMAGE });
    expect(loadedParams.zoom).toMatchObject({ value: 2.2, low: 1.1, high: 3.3, on: false, custom: true, seconds: 12, startTime: 4.5 });
    expect(loadedParams.panX).toMatchObject({ on: true, ease: "bounce", custom: false });
    expect(loadedState).toMatchObject({ blendMode: 1, warpMode: 2, mapMode: 4, blurMask: 3, trailMode: 2, overlayColor: "#12ab9f", time: 42, clock: 30, warpTime: 7 });
    expect(loadedParams.cycle.value).toBe(13);
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
    expect(params.segments.value).toBe(0);
    expect(state.mapMode).toBe(1);
    /* A speed of 50 is far above 1×, so the cycle is as short as it goes. */
    expect(params.cycle.value).toBe(params.cycle.min);
  });

  it("give the ranges of version 1 scenes their own times, at the speed they had", () => {
    const params = createParams();
    const text = JSON.stringify({
      app: "KaleidoSage",
      version: 1,
      params: {
        speed: { value: 2 },
        zoom: { on: true, low: 1, high: 2, rate: 0.05 },
        rotation: { on: true, low: 0, high: 360, rate: 8 },
        lightAngle: { on: true, low: 100, high: 160, rate: 20 }
      },
      state: {},
      image: IMAGE
    });
    applyScene(text, params, createPlayState());
    expect(params.cycle.value).toBe(10);
    expect(params.zoom).toMatchObject({ custom: true, seconds: 5 });
    expect(params.rotation.custom).toBe(true);
    expect(params.rotation.seconds).toBeCloseTo(22.5);
    expect(params.lightAngle.seconds).toBeCloseTo(1.5);

    const shared = createParams();
    applyScene(JSON.stringify({ app: "KaleidoSage", version: 1, params: { zoom: { on: true, rate: 0.05 } }, state: { sharedCycle: true }, image: IMAGE }), shared, createPlayState());
    expect(shared.zoom.custom).toBeFalsy();
  });

  it("keep the effect orders, and place the warp of older scenes by its old mode", () => {
    const state = createPlayState();
    state.shapeOrder = ["kaleidoscope", "warp", "map"];
    state.pictureOrder = ["relief", "blur", "finish", "trails"];
    state.layerBlend = { warp: 1, map: 0, kaleidoscope: 4 };
    const loaded = createPlayState();
    applyScene(serializeScene(createParams(), state, { image: IMAGE }), createParams(), loaded);
    expect(loaded.shapeOrder).toEqual(["kaleidoscope", "warp", "map"]);
    expect(loaded.pictureOrder).toEqual(["relief", "blur", "finish", "trails"]);
    expect(loaded.layerBlend).toEqual({ warp: 1, map: 0, kaleidoscope: 4 });

    const old = createPlayState();
    applyScene(JSON.stringify({ app: "KaleidoSage", version: 1, state: { warpMode: 2, shapeOrder: ["warp", "warp", "map"] }, image: IMAGE }), createParams(), old);
    expect(old.shapeOrder).toEqual(["warp", "kaleidoscope", "map"]);
    expect(old.pictureOrder).toEqual(["blur", "trails", "relief", "finish"]);

    const reversed = createPlayState();
    applyScene(JSON.stringify({ app: "KaleidoSage", version: 1, state: { shapeOrder: ["warp", "map", "kaleidoscope"] }, image: IMAGE }), createParams(), reversed);
    expect(reversed.shapeOrder).toEqual(["kaleidoscope", "map", "warp"]);
  });

  it("keep a second image, and skip a broken one", () => {
    const text = serializeScene(createParams(), createPlayState(), { image: IMAGE, image2: IMAGE2 });
    expect(applyScene(text, createParams(), createPlayState())).toEqual({ image: IMAGE, image2: IMAGE2 });
    const broken = JSON.stringify({ app: "KaleidoSage", version: 1, image: IMAGE, image2: { type: "text/plain", data: "x" } });
    expect(applyScene(broken, createParams(), createPlayState())).toEqual({ image: IMAGE });
  });

  it("reject files that are not scenes or have no image", () => {
    expect(() => applyScene("not json", createParams(), createPlayState())).toThrow(/not a Kaleido Sage scene/);
    expect(() => applyScene("{\"app\":\"Other\"}", createParams(), createPlayState())).toThrow(/not a Kaleido Sage scene/);
    expect(() => applyScene("{\"app\":\"KaleidoSage\"}", createParams(), createPlayState())).toThrow(/no image/);
  });

  it("count setting and image changes as unsaved, but not playing or Stop", () => {
    const params = createParams();
    const state = createPlayState();
    const saved = sceneFingerprint(params, state, [1, null]);
    Object.assign(state, { time: 99, clock: 50, warpTime: 3, mapTravel: 2, paused: true });
    params.zoom.startTime = 1.23;
    expect(sceneFingerprint(params, state, [1, null])).toBe(saved);
    expect(sceneFingerprint(params, state, [2, null])).not.toBe(saved);
    params.zoom.value = 2;
    expect(sceneFingerprint(params, state, [1, null])).not.toBe(saved);
  });

  it("keep image bytes unchanged", async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128]);
    const image = await blobToSceneImage(new Blob([bytes], { type: "image/jpeg" }));
    const back = new Uint8Array(await sceneImageToBlob(image).arrayBuffer());
    expect(image.type).toBe("image/jpeg");
    expect([...back]).toEqual([...bytes]);
  });
});
