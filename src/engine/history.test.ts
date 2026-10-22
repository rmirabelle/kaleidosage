import { describe, expect, it } from "vitest";
import { SettingsHistory } from "./history";
import { createParams, createPlayState } from "./params";

describe("settings history", () => {
  it("undoes and redoes each committed change", () => {
    const params = createParams();
    const state = createPlayState();
    const history = new SettingsHistory(params, state);
    const start = params.zoom.value;

    params.zoom.value = 2;
    history.commit();
    Object.assign(params.zoom, { value: 3, on: true });
    state.blurMask = 2;
    state.groups.map = true;
    history.commit();

    expect(history.undo()).toBe(true);
    expect(params.zoom).toMatchObject({ value: 2, on: false });
    expect(state.blurMask).toBe(0);
    expect(state.groups.map).toBe(false);
    expect(history.undo()).toBe(true);
    expect(params.zoom.value).toBe(start);
    expect(history.undo()).toBe(false);

    expect(history.redo()).toBe(true);
    expect(history.redo()).toBe(true);
    expect(params.zoom).toMatchObject({ value: 3, on: true });
    expect(state).toMatchObject({ blurMask: 2 });
    expect(history.redo()).toBe(false);
  });

  it("counts a change that is not committed yet as a step to undo", () => {
    const params = createParams();
    const history = new SettingsHistory(params, createPlayState());
    const start = params.zoom.value;
    params.zoom.value = 2;
    expect(history.canUndo).toBe(true);
    expect(history.undo()).toBe(true);
    expect(params.zoom.value).toBe(start);
  });

  it("drops the redo steps after a new change", () => {
    const params = createParams();
    const history = new SettingsHistory(params, createPlayState());
    params.zoom.value = 2;
    history.commit();
    history.undo();
    params.zoom.value = 1.5;
    expect(history.redo()).toBe(false);
    expect(params.zoom.value).toBe(1.5);
    expect(history.canRedo).toBe(false);
  });

  it("does not count animation time as a change", () => {
    const state = createPlayState();
    const history = new SettingsHistory(createParams(), state);
    state.time = 50;
    state.clock = 40;
    expect(history.commit()).toBe(false);
  });
});

describe("settings history and audio switches", () => {
  it("undoes and redoes an audio switch", () => {
    const params = createParams();
    const state = createPlayState();
    const history = new SettingsHistory(params, state);
    state.sound.zoom = true;
    history.commit();
    expect(history.undo()).toBe(true);
    expect(state.sound).toEqual({});
    expect(history.redo()).toBe(true);
    expect(state.sound).toEqual({ zoom: true });
  });
});
