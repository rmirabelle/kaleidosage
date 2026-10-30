import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Engine } from "../engine/engine";

/**
 * Cast: the picture full screen on another screen, in the Show window, while
 * the main window stays free for work (see src-tauri/src/cast.rs). The
 * other screen is often a virtual screen that a stream sends to a
 * projector. The Show window opens with window.open, so it shares this
 * page's scripts: the engine draws in the main window's canvas at the Show
 * screen's size, the Show window times the frames (see Engine.castTo), and
 * after each frame that draws, the picture is copied into the Show
 * window's canvas. So the show plays on while the main window is minimized,
 * and the main window's canvas is a preview. The picked screen is kept by
 * its monitor's name and size, because the Windows device name can change.
 */

export interface CastScreen {
  /** The Windows device name (\\.\DISPLAY2); cast_place takes it. */
  id: string;
  /** The monitor's own name. */
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  /** The screen that the main window is on now. */
  current: boolean;
}

export type CastStatus =
  | { state: "off" }
  | { state: "starting" }
  | { state: "on"; screen: CastScreen }
  | { state: "error"; message: string };

const STORE_KEY = "kaleidosage.cast";
/** The window.open name of the Show window; the Rust side makes only this window. */
const SHOW_NAME = "kaleidosage-show";
/** The longest wait for the Show window's page. */
const OPEN_WAIT_MS = 5000;

/** Dev only: a hot update would leave the Show window with the old code; edits here reload the window instead, as midi.ts does. */
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());

export const screenLabel = (screen: CastScreen) => `${screen.name} (${screen.width}×${screen.height})`;
const screenKey = (screen: CastScreen) => `${screen.name} ${screen.width}x${screen.height}`;

function loadKey(): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as { screen?: unknown };
    return typeof saved.screen === "string" ? saved.screen : null;
  } catch {
    return null;
  }
}

class Cast {
  status: CastStatus = { state: "off" };
  screens: CastScreen[] = [];
  /** The picked screen's name and size (see screenKey), or null for the first screen that the main window is not on. */
  screenKey = loadKey();
  /** Goes up with each change, for useSyncExternalStore. */
  version = 0;
  private readonly listeners = new Set<() => void>();
  private show: Window | null = null;
  private engine: Engine | null = null;
  private stopFrames: (() => void) | null = null;
  /** The Rust close of the last Show window (see stop); a new cast waits for it, because both use one window label. */
  private closing: Promise<unknown> = Promise.resolve();

  /** Calls the listener after each change of status, screens or pick. Returns a function that removes it. */
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private changed() {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  get on() {
    return this.status.state === "on" || this.status.state === "starting";
  }

  async refreshScreens() {
    if (!isTauri()) return;
    try {
      this.screens = await invoke<CastScreen[]>("cast_screens");
    } catch {
      this.screens = [];
    }
    this.changed();
  }

  /** The screen a cast goes to: the picked one, else the first screen that the main window is not on. */
  get target(): CastScreen | null {
    return this.screens.find((screen) => screenKey(screen) === this.screenKey)
      ?? this.screens.find((screen) => !screen.current)
      ?? null;
  }

  /** Picks the screen for the next cast; a cast that runs moves there. */
  pick(screen: CastScreen) {
    this.screenKey = screenKey(screen);
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ screen: this.screenKey })); } catch { /* The pick goes back to the default at the next start. */ }
    this.changed();
    if (this.engine && this.on) {
      const engine = this.engine;
      this.stop();
      void this.start(engine);
    }
  }

  async toggle(engine: Engine) {
    if (this.on) this.stop();
    else await this.start(engine);
  }

  async start(engine: Engine) {
    if (this.on) return;
    this.status = { state: "starting" };
    this.changed();
    try {
      if (!isTauri()) throw new Error("Cast needs the Kaleido Sage app.");
      await this.refreshScreens();
      const screen = this.target;
      if (!screen) throw new Error("Connect a second screen first. Cast shows the picture on a screen that the app is not on.");
      if (screen.current) throw new Error(`The app is on ${screenLabel(screen)}. Move it to another screen, or pick another screen for Cast.`);
      await this.closing;
      /* A Show window that a reload left behind would take the label. */
      await invoke("cast_close");
      await invoke("cast_target", { screen: screen.id });
      const show = window.open("about:blank", SHOW_NAME);
      if (!show) throw new Error("The Show window did not open.");
      this.show = show;
      await ready(show);
      await invoke("cast_place", { screen: screen.id });
      const canvas = setUp(show);
      /* The screen's own pixels: the window may not have its full-screen size yet. */
      const size: [number, number] = [screen.width, screen.height];
      canvas.width = size[0];
      canvas.height = size[1];
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("The Show window cannot draw.");
      /* Each frame that draws is copied at once, while the WebGL canvas still holds it. */
      const off = engine.onFrame(() => {
        if (engine.stats.drawing) context.drawImage(engine.canvas, 0, 0, size[0], size[1]);
      });
      this.stopFrames = off;
      this.engine = engine;
      engine.castTo({ window: show, size });
      /* The Show window can close by itself (the app quits, the screen goes): the cast then stops. */
      show.addEventListener("pagehide", () => { if (this.show === show) this.stop(); });
      this.status = { state: "on", screen };
    } catch (error) {
      this.stop();
      this.status = { state: "error", message: error instanceof Error ? error.message : String(error) };
    }
    this.changed();
  }

  /** Stops the cast: the main window times the frames again, and Rust closes the Show window (see cast_close). */
  stop() {
    this.stopFrames?.();
    this.stopFrames = null;
    if (this.engine?.casting) this.engine.castTo(null);
    this.engine = null;
    this.show = null;
    if (isTauri()) this.closing = invoke("cast_close").catch(() => { /* The window ends with the app. */ });
    this.status = { state: "off" };
    this.changed();
  }
}

/** Waits until the Show window's empty page has loaded: a page made before that is replaced by it. */
function ready(show: Window) {
  return new Promise<void>((resolve, reject) => {
    const started = performance.now();
    const check = () => {
      if (show.closed) return reject(new Error("The Show window closed."));
      if (show.document?.readyState === "complete" && show.document.body) return resolve();
      if (performance.now() - started > OPEN_WAIT_MS) return reject(new Error("The Show window did not load."));
      setTimeout(check, 20);
    };
    check();
  });
}

/** The Show window's page: one canvas over the whole window, on black, with no mouse pointer. */
function setUp(show: Window) {
  const document = show.document;
  document.title = "Kaleido Sage Show";
  document.documentElement.style.cssText = "margin:0;height:100%;background:#000;";
  document.body.style.cssText = "margin:0;height:100%;overflow:hidden;background:#000;cursor:none;";
  document.body.replaceChildren();
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100vw;height:100vh;";
  document.body.append(canvas);
  return canvas;
}

export const cast = new Cast();

/* A page that reloads or closes takes the Show window with it. */
window.addEventListener("pagehide", () => cast.stop());
