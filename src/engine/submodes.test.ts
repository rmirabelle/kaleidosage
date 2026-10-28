import { describe, expect, it } from "vitest";
import { createPlayState } from "./params";
import { EFFECT_COLUMNS, EFFECT_NAMES, effectName, isShown, shownIn, submodeNote, submodeOf } from "./submodes";

describe("Add effect menu columns", () => {
  it("list every effect once, A to Z down the left column and then the right", () => {
    const listed = EFFECT_COLUMNS.flat();
    expect([...listed].sort()).toEqual(EFFECT_NAMES.map(([step]) => step).sort());
    const names = listed.map(effectName);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(EFFECT_COLUMNS[0].length - EFFECT_COLUMNS[1].length).toBeGreaterThanOrEqual(0);
    expect(EFFECT_COLUMNS[0].length - EFFECT_COLUMNS[1].length).toBeLessThanOrEqual(1);
  });
});

describe("submodes", () => {
  it("knows which submode menu shows or hides a slider", () => {
    expect(submodeOf("tileSize")?.stateKey).toBe("foldMode");
    expect(submodeOf("juliaShape")?.stateKey).toBe("mapMode");
    expect(submodeOf("trailAmount")).toBeUndefined();
  });

  it("hides a slider that the current submode does not use", () => {
    const state = { ...createPlayState(), foldMode: 0 as const };
    expect(isShown("tileSize", state)).toBe(false);
    expect(isShown("segments", state)).toBe(true);
    /* Pan X shows in every Kaleidoscope submode; Trails has no submode. */
    expect(isShown("panX", state)).toBe(true);
    expect(isShown("trailAmount", state)).toBe(true);
    expect(isShown("tileSize", { ...state, foldMode: 2 })).toBe(true);
  });

  it("names the submodes that show a slider, only when some hide it", () => {
    expect(shownIn("tileSize")).toEqual(["Triangle tiles", "Hexagon tiles", "Square tiles"]);
    expect(shownIn("panX")).toEqual([]);
    expect(shownIn("trailAmount")).toEqual([]);
  });

  it("writes a short note: the few choices that show a slider, or the few that do not", () => {
    expect(submodeNote("segments")).toBe("Radial");
    expect(submodeNote("warpScale")).toBe("except Cells");
    expect(submodeNote("panX")).toBe("");
  });
});
