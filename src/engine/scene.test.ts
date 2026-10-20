import { describe, expect, it } from "vitest";
import { createParams, createPlayState, defaultGradientStops } from "./params";
import { applyScene, blobToSceneImage, sceneFingerprint, sceneImageToBlob, serializeScene } from "./scene";

const IMAGE = { type: "image/png", data: "iVBORw0KGgo=" };
const IMAGE2 = { type: "image/jpeg", data: "/9j/4AAQ" };

describe("scene files", () => {
  it("keep the particles' gradient stops, and drop stops that do not read", () => {
    const state = createPlayState();
    state.particleStops = [{ at: 0, color: "#112233" }, { at: 0.4, color: "#ffffff" }, { at: 1, color: "#000000" }];
    const loaded = createPlayState();
    applyScene(serializeScene(createParams(), state, { image: IMAGE }), createParams(), loaded);
    expect(loaded.particleStops).toEqual(state.particleStops);
    const broken = JSON.stringify({ app: "KaleidoSage", version: 1, params: {}, state: { particleStops: [{ at: 2, color: "#abcdef" }, { at: 0.5, color: "red" }] }, image: IMAGE });
    applyScene(broken, createParams(), loaded);
    expect(loaded.particleStops).toEqual(defaultGradientStops());
  });

  it("round-trips embedded video handles for both slots without base64", () => {
    const images = { image: { type: "video/mp4", video: "1" }, image2: { type: "video/webm", video: "2" } };
    const saved = serializeScene(createParams(), createPlayState(), images);
    expect(applyScene(saved, createParams(), createPlayState())).toEqual(images);
    expect(() => sceneImageToBlob(images.image)).toThrow("opened as streams");
  });

  it("restore every parameter and the play state", () => {
    const params = createParams();
    const state = createPlayState();
    Object.assign(params.mapPower, { value: 2.2, low: 1.1, high: 3.3, on: false, custom: true, seconds: 12, startTime: 4.5 });
    Object.assign(params.panX, { on: true, ease: "bounce" });
    Object.assign(state, { blendMode: 1, warpMode: 2, mapMode: 4, blurMask: 3, trailMode: 2, overlayColor: "#12ab9f", time: 42, clock: 30, warpTime: 7 });
    params.cycle.value = 13;
    state.fxOrder = ["map"];
    state.groups.map = true;
    state.groups.blur = false;
    const text = serializeScene(params, state, { image: IMAGE });

    const loadedParams = createParams();
    const loadedState = createPlayState();
    const images = applyScene(text, loadedParams, loadedState);

    expect(images).toEqual({ image: IMAGE });
    expect(loadedParams.mapPower).toMatchObject({ value: 2.2, low: 1.1, high: 3.3, on: false, custom: true, seconds: 12, startTime: 4.5 });
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
    expect(state.mapMode).toBe(8);
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

  it("keep the effect list, and place the warp of older scenes by its old mode", () => {
    const state = createPlayState();
    state.fxOrder = ["relief", "warp", "blur", "map"];
    state.layerBlend = { warp: 1, map: 0, kaleidoscope: 4 };
    const loaded = createPlayState();
    const text = serializeScene(createParams(), state, { image: IMAGE });
    applyScene(text, createParams(), loaded);
    expect(loaded.fxOrder).toEqual(["relief", "warp", "blur", "map"]);
    expect(loaded.layerBlend).toEqual({ warp: 1, map: 0, kaleidoscope: 4 });
    /* Earlier versions of the app read a full order inside each kind: the list's order first. */
    const savedState = JSON.parse(text).state;
    expect(savedState.shapeStack).toEqual(["warp", "map", "kaleidoscope"]);
    expect(savedState.pictureOrder).toEqual(["relief", "blur", "trails", "smear", "contours", "driver", "camera", "sort", "particles", "rays", "bloom", "sharpen", "color", "levels"]);

    /* Scenes from before the effect list: every effect that is on and changes the picture, in their order. */
    const showing = { warpAmount: { value: 0.3 }, blurAmount: { value: 10 }, trailAmount: { value: 0.5 }, smearAmount: { value: 1 }, contourOpacity: { value: 1 }, reliefAmount: { value: 1 }, sharpen: { value: 1 } };
    const allOn = { warp: true, map: true, kaleidoscope: true, blur: true, trails: true, smear: true, contours: true, relief: true, finish: true };
    const older = (state: Record<string, unknown>, params: Record<string, unknown> = showing) => {
      const loadedState = createPlayState();
      applyScene(JSON.stringify({ app: "KaleidoSage", version: 2, params, state: { groups: allOn, ...state }, image: IMAGE }), createParams(), loadedState);
      return loadedState;
    };
    /* Their Final effects becomes the parts of it that change the picture: here only Sharpen. */
    expect(older({ fxOrder: ["blur", "kaleidoscope", "warp", "map", "trails", "smear", "contours", "relief", "finish"] }).fxOrder)
      .toEqual(["blur", "kaleidoscope", "warp", "map", "trails", "smear", "contours", "relief", "sharpen"]);
    expect(older({ shapeStack: ["warp", "map", "kaleidoscope"], pictureOrder: ["relief", "contours", "blur", "finish", "trails", "smear"] }).fxOrder)
      .toEqual(["warp", "map", "kaleidoscope", "relief", "contours", "blur", "sharpen", "trails", "smear"]);
    expect(older({ warpMode: 2, shapeOrder: ["warp", "warp", "map"] }).fxOrder.slice(0, 3)).toEqual(["warp", "kaleidoscope", "map"]);
    expect(older({ shapeOrder: ["warp", "map", "kaleidoscope"] }).fxOrder.slice(0, 3)).toEqual(["kaleidoscope", "map", "warp"]);
    /* A scene from before Time smear and Contours keeps its order, with the new steps after Trails. */
    expect(older({ pictureOrder: ["relief", "blur", "finish", "trails"] }).fxOrder.slice(3)).toEqual(["relief", "blur", "sharpen", "trails", "smear", "contours"]);
    /* An effect that was off, or on with nothing to show, is not in the list, and it is off. */
    /* A scene with the effect list keeps the parts of its Final effects that change the picture. */
    expect(older({ effects: ["blur", "finish"] }, { blurAmount: { value: 10 }, exposure: { value: -1 }, sharpen: { value: 0.5 } }).fxOrder).toEqual(["blur", "sharpen", "levels"]);
    const some = older({ groups: { ...allOn, map: false } }, { blurAmount: { value: 10 } });
    expect(some.fxOrder).toEqual(["kaleidoscope", "blur"]);
    expect(some.groups).toMatchObject({ map: false, warp: false, trails: false, kaleidoscope: true, blur: true });
  });

  it("give scenes from before the cell size the same cells", () => {
    const params = createParams();
    applyScene(JSON.stringify({ app: "KaleidoSage", version: 2, params: { warpScale: { value: 2, low: 1, high: 4, on: true } }, image: IMAGE }), params, createPlayState());
    expect(params.warpCellSize.value).toBeCloseTo(10 / 3);
    expect(params.warpCellSize.low).toBeCloseTo(10 / 1.5);
    expect(params.warpCellSize.high).toBeCloseTo(10 / 6);
    expect(params.warpCellSize.on).toBe(true);
  });

  it("keep a second image, and skip a broken one", () => {
    const text = serializeScene(createParams(), createPlayState(), { image: IMAGE, image2: IMAGE2 });
    expect(applyScene(text, createParams(), createPlayState())).toEqual({ image: IMAGE, image2: IMAGE2 });
    const broken = JSON.stringify({ app: "KaleidoSage", version: 1, image: IMAGE, image2: { type: "text/plain", data: "x" } });
    expect(applyScene(broken, createParams(), createPlayState())).toEqual({ image: IMAGE });
  });

  it("keep a video as the first or the second image", () => {
    const video = { type: "video/mp4", data: "AAAAIGZ0eXBpc29t" };
    const text = serializeScene(createParams(), createPlayState(), { image: video, image2: IMAGE });
    expect(applyScene(text, createParams(), createPlayState())).toEqual({ image: video, image2: IMAGE });
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

describe("scene audio links", () => {
  it("are saved, read back, and count as a change", () => {
    const params = createParams();
    const state = createPlayState();
    const before = sceneFingerprint(params, state, [1, null]);
    state.audioLinks = { zoom: { source: "kick", amount: 0.8, release: 2, threshold: -6 } };
    expect(sceneFingerprint(params, state, [1, null])).not.toBe(before);
    const linked = sceneFingerprint(params, state, [1, null]);
    state.audioRelease = 0.6;
    expect(sceneFingerprint(params, state, [1, null])).not.toBe(linked);
    const loadedState = createPlayState();
    applyScene(serializeScene(params, state, { image: IMAGE }), createParams(), loadedState);
    expect(loadedState.audioLinks).toEqual({ zoom: { source: "kick", amount: 0.8, release: 2, threshold: -6 } });
    expect(loadedState.audioRelease).toBe(0.6);
  });
});
