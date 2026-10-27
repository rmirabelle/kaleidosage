import { describe, expect, it } from "vitest";
import { createParams, createPlayState } from "../engine/params";
import { applyScene, serializeScene } from "../engine/scene";
import type { TerrainData } from "../engine/terrain";
import { terrainFromScene, terrainToScene } from "./terrain";

const IMAGE = { type: "image/png", data: "iVBORw0KGgo=" };

describe("real terrain in a scene file", () => {
  it("comes back with its place, range and heights (to 16 bits)", async () => {
    const terrain: TerrainData = {
      id: 999, place: "the Alps", longitude: 8.5, latitude: 46.5, areaKm: 40,
      heights: Float32Array.from({ length: 12 }, (_, index) => index / 11), width: 4, height: 3,
      lowest: 400, highest: 4500, relief: 0.1, picture: null
    };
    const scene = JSON.parse(serializeScene(createParams(), createPlayState(), { image: IMAGE }));
    scene.terrain = await terrainToScene(terrain);
    const images = applyScene(JSON.stringify(scene), createParams(), createPlayState());
    expect(images.terrain).toBeDefined();
    const loaded = await terrainFromScene(images.terrain!);
    expect(loaded.id).not.toBe(terrain.id);
    expect({ ...loaded, id: 0, heights: null }).toEqual({ ...terrain, id: 0, heights: null });
    loaded.heights.forEach((value, index) => expect(value).toBeCloseTo(terrain.heights[index], 4));
  });

  it("is left out when it is broken, and the scene still opens", async () => {
    const scene = JSON.parse(serializeScene(createParams(), createPlayState(), { image: IMAGE }));
    scene.terrain = { place: "the Alps", width: 4 };
    expect(applyScene(JSON.stringify(scene), createParams(), createPlayState()).terrain).toBeUndefined();
    const saved = await terrainToScene({ id: 1, place: "x", longitude: 0, latitude: 0, areaKm: 5, heights: new Float32Array(4), width: 2, height: 2, lowest: 0, highest: 1, relief: 1, picture: null });
    await expect(terrainFromScene({ ...saved, width: 3 })).rejects.toThrow();
  });
});
