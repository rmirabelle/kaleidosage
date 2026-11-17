import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { SHOTS, type Shot } from "./shots";

/**
 * The capture run, for dev builds only. It makes every help picture: for each
 * shot in shots.ts it puts the app in the state the shot needs, measures the
 * part to show, and asks Rust (`help_capture`) to photograph that rectangle
 * into `public/help/<name>.png`. Run it again after the UI changes.
 *
 * Start it from Help, Capture Help Pictures, or from a terminal with
 * `curl http://localhost:14510/__help-shots` (see vite.config.ts).
 */

/** Picture pixels for each CSS pixel. The same on every screen, so the help shows each picture at a known size. */
const SHOT_SCALE = 2;

/**
 * The project that the pictures of a full window show: the user's own show,
 * with its scenes and its playlist. The run never saves it.
 */
export const BASE_PROJECT = String.raw`D:\Images\Kaleido Sage\Robert Mirabelle.ksage`;

/**
 * Where the run saves a project that is open with changes when the run
 * starts, before it closes that project: no work of the user is lost. The
 * folder is in the project folder and is not kept in Git.
 */
export const HELP_STASH = "D:/Code/KaleidoSage/help-stash";

/** What the app gives the capture run: it opens the base project and closes it with no save. */
export interface Stage {
  /** True when the start screen shows (no project is open). */
  isEmpty: () => boolean;
  openBase: () => Promise<void>;
  /** Closes the project and throws its changes away; the start screen shows again. */
  closeBase: () => Promise<void>;
  /** Adds a blank scene; on the start screen, it starts a new, untitled project. */
  newScene: () => void;
  /** Saves the open project to the stash folder when it has changes. Returns the path of the copy, or "" when the project had no changes. */
  stashOpen: () => Promise<string>;
}

/** The stage of the run in progress, for the shots that add scenes. */
let activeStage: Stage | null = null;

/** Space around a shot's targets when the shot gives none: enough to show some of the window around them. */
const DEFAULT_MARGIN = 28;

/**
 * The page size of each part of the run, in CSS pixels: a small window for
 * a new project, and a large screen for the base project, whose playlist,
 * scenes and Song Map need the room. A picture of the whole large window
 * shows small in the text; a click on it shows it at full size.
 */
const STAGE_SIZE = { small: { width: 1280, height: 800 }, large: { width: 2560, height: 1440 } } as const;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const isVisible = (element: Element) => {
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
};

/** The tools a shot uses to put the app in its state. */
export const page = {
  /** The first visible element that matches, so a hidden panel is never used. */
  find(selector: string): HTMLElement {
    const found = Array.from(document.querySelectorAll<HTMLElement>(selector)).find(isVisible);
    if (!found) throw new Error(`Nothing visible matches ${selector}`);
    return found;
  },
  /** A click with no mouse; toolbar buttons that act on press accept it too. */
  press(selector: string) {
    page.find(selector).click();
  },
  /** Selects a tool button; a press on a tool that is in use would put it away. */
  select(selector: string) {
    const button = page.find(selector);
    if (button.getAttribute("aria-checked") !== "true") button.click();
  },
  /** Opens one menu of the menu bar. */
  openMenu(label: string) {
    const button = Array.from(document.querySelectorAll<HTMLElement>(".menubar-root > button")).find((item) => item.textContent?.trim() === label);
    if (!button) throw new Error(`There is no ${label} menu`);
    if (button.getAttribute("aria-expanded") !== "true") button.click();
  },
  /** Closes the open menu. */
  closeMenu() {
    document.querySelector<HTMLElement>(".menubar-root > button.active")?.click();
  },
  /** Chooses one item of the open menu. */
  chooseMenuItem(label: string) {
    const item = Array.from(document.querySelectorAll<HTMLElement>(".menubar-dropdown button")).find((entry) => entry.querySelector(".menubar-item-label")?.textContent?.trim() === label);
    if (!item) throw new Error(`The open menu has no item ${label}`);
    item.click();
  },
  /** Sends one key to the window, as the keyboard does. */
  key(key: string, modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) {
    const init = { key, bubbles: true, cancelable: true, ctrlKey: !!modifiers.ctrl, shiftKey: !!modifiers.shift, altKey: !!modifiers.alt };
    /** The app ignores keys that come from a text field, so the key goes to the page itself. */
    (document.activeElement as HTMLElement | null)?.blur?.();
    document.body.dispatchEvent(new KeyboardEvent("keydown", init));
    document.body.dispatchEvent(new KeyboardEvent("keyup", init));
  },
  /** Opens a menu of the menu bar and chooses one of its items. */
  async menuCommand(menu: string, item: string) {
    page.openMenu(menu);
    await page.settle(50);
    page.chooseMenuItem(item);
  },
  /** A click on the first visible element that matches and has this text. */
  pressText(selector: string, text: string) {
    const found = Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => isVisible(element) && element.textContent?.trim().includes(text));
    if (!found) throw new Error(`Nothing visible matches ${selector} with the text ${text}`);
    found.click();
  },
  /** A right-click, which opens the element's menu. */
  rightClick(selector: string) {
    const element = page.find(selector);
    const box = element.getBoundingClientRect();
    element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2, button: 2 }));
  },
  /** Closes open menus and popovers: they close on a press somewhere else. */
  dismiss() {
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX: 2, clientY: 2 }));
    document.body.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, button: 0, clientX: 2, clientY: 2 }));
  },
  /** Sets a slider, as a drag does. */
  setRange(selector: string, value: number) {
    const input = page.find(selector) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  },
  /** Adds a blank scene, as File, Add Blank Scene does. */
  newScene() {
    if (!activeStage) throw new Error("No capture run is in progress");
    activeStage.newScene();
  },
  /** A click on the first element that matches, also when it shows only under the mouse. */
  click(selector: string) {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Nothing matches ${selector}`);
    element.click();
  },
  /** Puts the mouse over an element, with no real mouse: the help line then shows the element's tip. */
  point(selector: string) {
    const element = page.find(selector);
    const box = element.getBoundingClientRect();
    element.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }));
  },
  /** Takes the mouse off the window: the help line shows no tip. */
  unpoint() {
    window.dispatchEvent(new Event("blur"));
  },
  /** All visible elements that match. */
  findAll(selector: string): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(isVisible);
  },
  /** Waits until the window shows the new state. */
  async settle(ms = 200) {
    await frame();
    await frame();
    await wait(ms);
  },
  /** Waits until something visible matches. */
  async waitFor(selector: string, timeout = 5000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (Array.from(document.querySelectorAll(selector)).some(isVisible)) return;
      await wait(50);
    }
    throw new Error(`${selector} did not appear`);
  }
};
export type Page = typeof page;

/** The rectangle of a shot, kept inside the window: its own `box`, or the rectangle around all of its targets plus its margin. */
function shotBox(shot: Shot) {
  const clip = (left: number, top: number, right: number, bottom: number) => {
    const x = Math.max(0, Math.floor(left));
    const y = Math.max(0, Math.floor(top));
    return { x, y, width: Math.min(window.innerWidth, Math.ceil(right)) - x, height: Math.min(window.innerHeight, Math.ceil(bottom)) - y };
  };
  if (shot.box) {
    const box = shot.box(page);
    return clip(box.x, box.y, box.x + box.width, box.y + box.height);
  }
  if (!shot.target) throw new Error("The shot has no part to show");
  const elements = typeof shot.target === "function" ? shot.target(page) : (Array.isArray(shot.target) ? shot.target : [shot.target]).map((selector) => page.find(selector));
  if (!elements.length) throw new Error("The shot has no part to show");
  const targets = elements.map((element) => element.getBoundingClientRect());
  const [marginY, marginX] = Array.isArray(shot.margin) ? shot.margin : [shot.margin ?? DEFAULT_MARGIN, shot.margin ?? DEFAULT_MARGIN];
  return clip(
    Math.min(...targets.map((box) => box.left)) - marginX,
    Math.min(...targets.map((box) => box.top)) - marginY,
    Math.max(...targets.map((box) => box.right)) + marginX,
    Math.max(...targets.map((box) => box.bottom)) + marginY
  );
}

/** The classes that stand in for the mouse during a shot: CSS gives "help-hover" the look of :hover (see index.css). */
const HOVER_CLASS = "help-hover";

/**
 * Puts a drawn mouse pointer over the shot's `cursor` element, and gives the
 * element the look and the effects of the real mouse over it: its hover
 * style, its tip in the help line, and what its pointer events start. A
 * picture of the page has no mouse pointer of its own. Returns the function
 * that takes all of it away.
 */
function showCursor(shot: Shot) {
  if (!shot.cursor) return () => {};
  const element = typeof shot.cursor === "function" ? shot.cursor(page) : page.find(shot.cursor);
  const box = element.getBoundingClientRect();
  const [alongX, alongY] = shot.cursorAt ?? [0.5, 0.6];
  const x = box.left + box.width * alongX;
  const y = box.top + box.height * alongY;
  const hovered: Element[] = [];
  for (let node: Element | null = element; node && node !== document.body; node = node.parentElement) {
    node.classList.add(HOVER_CLASS);
    hovered.push(node);
  }
  const at = { bubbles: true, clientX: x, clientY: y };
  element.dispatchEvent(new PointerEvent("pointerover", at));
  element.dispatchEvent(new PointerEvent("pointermove", at));
  const arrow = document.createElement("div");
  arrow.className = "help-cursor";
  arrow.style.left = `${x}px`;
  arrow.style.top = `${y}px`;
  arrow.innerHTML = '<svg viewBox="0 0 20 28" width="20" height="28"><path d="M1.5 1.5v20.2l5-4.6 3.5 8.3 3.3-1.4-3.5-8.2h6.9z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  document.body.appendChild(arrow);
  return () => {
    arrow.remove();
    hovered.forEach((node) => node.classList.remove(HOVER_CLASS));
    element.dispatchEvent(new PointerEvent("pointerout", { bubbles: true }));
  };
}

async function takeShot(shot: Shot, log: (message: string) => void) {
  let marked: HTMLElement | null = null;
  let hideCursor = () => {};
  try {
    /** A tip from the real mouse, or from the shot before, does not belong in this picture. */
    page.unpoint();
    await shot.setup?.(page);
    await page.settle();
    hideCursor = showCursor(shot);
    /** Hover styles change over a short time. */
    if (shot.cursor) await page.settle(300);
    if (shot.mark) {
      marked = page.find(shot.mark);
      marked.classList.add("help-shot-mark");
      await frame();
    }
    /** The webview multiplies the scale by the screen's own scale, so that one is divided out. */
    await invoke<string>("help_capture", { name: shot.name, ...shotBox(shot), scale: SHOT_SCALE / window.devicePixelRatio });
    log(`help picture made: ${shot.name}`);
    return true;
  } catch (error) {
    log(`help picture FAILED: ${shot.name}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  } finally {
    marked?.classList.remove("help-shot-mark");
    hideCursor();
    try {
      await shot.cleanup?.(page);
      await page.settle(80);
    } catch (error) {
      log(`help picture cleanup FAILED: ${shot.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

let running = false;

/** Makes all help pictures, or only those whose name starts with `only`. Returns how many were made and how many failed. */
export async function captureHelpShots(stage: Stage, log: (message: string) => void, only?: string) {
  if (running) {
    log("help pictures: a run is in progress");
    return { made: 0, failed: 0 };
  }
  running = true;
  activeStage = stage;
  /** Tooltips and the text cursor must not show in a picture. */
  document.documentElement.classList.add("help-capturing");
  let made = 0;
  let failed = 0;
  const count = (ok: boolean) => { if (ok) made += 1; else failed += 1; };
  /** Pictures for README.md ("readme-...") are made only when asked for by name; the app does not ship them. */
  /** `only` is the start of a shot's name, or the full name of a group: a group's shots depend on each other, so they are made together. */
  const wanted = SHOTS.filter((shot) => only ? shot.name.startsWith(only) || shot.group === only : !shot.name.startsWith("readme-"));
  if (only && !wanted.length) log(`help pictures: no shot's name starts with "${only}", and no group has that name`);
  try {
    /** Every run draws the page at one size, so the pictures do not depend on the screen. The window itself does not change or take the focus. */
    await invoke("help_stage", { on: true, ...STAGE_SIZE.small });
    await page.settle(500);
    /** A project that is open goes away first: with changes, a copy of it goes to the stash folder, so no work is lost. */
    if (!stage.isEmpty()) {
      const name = document.querySelector(".titlebar-file")?.textContent?.trim() ?? "the open project";
      const copy = await stage.stashOpen();
      log(copy ? `help pictures: saved a copy of ${name} as ${copy}, then closed it` : `help pictures: closed ${name}, which had no changes`);
      await stage.closeBase();
      await page.settle(400);
    }
    const empty = wanted.filter((shot) => shot.needs === "empty");
    if (empty.length && !stage.isEmpty()) {
      log(`help pictures: ${empty.length} need the start screen; close the project and run again`);
      failed += empty.length;
    } else {
      for (const shot of empty) count(await takeShot(shot, log));
    }
    for (const shot of wanted.filter((item) => item.needs === "none")) count(await takeShot(shot, log));

    /** The groups of some shots, in the order of their first shot. */
    const groupsOf = (shots: Shot[]) => Array.from(new Set(shots.map((shot) => shot.group ?? "main")));

    /** Each group of "blank" shots gets its own new project with one blank scene. */
    const withBlank = wanted.filter((shot) => shot.needs === "blank");
    for (const group of groupsOf(withBlank)) {
      stage.newScene();
      await page.waitFor(".control-panel");
      await page.settle(500);
      try {
        for (const shot of withBlank.filter((item) => (item.group ?? "main") === group)) count(await takeShot(shot, log));
      } finally {
        await stage.closeBase();
        await page.settle(300);
      }
    }

    /** Each group of "file" shots gets its own opening of the base project, at the large page size. */
    const withFile = wanted.filter((shot) => shot.needs === "file");
    if (withFile.length) await invoke("help_stage", { on: true, ...STAGE_SIZE.large });
    for (const group of groupsOf(withFile)) {
      await stage.openBase();
      /** The base project is large, and its scenes load one by one. */
      try {
        await page.waitFor(".control-panel", 120000);
      } catch (error) {
        const status = document.querySelector(".status-toast")?.textContent?.trim();
        log(`help pictures: the base project did not open${document.querySelector(".start-screen") ? " (the start screen shows)" : ""}${status ? `: ${status}` : ""}`);
        throw error;
      }
      await page.settle(800);
      try {
        for (const shot of withFile.filter((item) => (item.group ?? "main") === group)) count(await takeShot(shot, log));
      } finally {
        await stage.closeBase();
        await page.settle(300);
      }
    }
  } catch (error) {
    log(`help pictures stopped: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    document.documentElement.classList.remove("help-capturing");
    await invoke("help_stage", { on: false }).catch((error) => log(`help pictures: the window size did not come back: ${String(error)}`));
    running = false;
    activeStage = null;
  }
  log(`help pictures done: ${made} made, ${failed} failed`);
  void emitTo("help", "help-shots-updated").catch(() => { /* The help window is not open. */ });
  return { made, failed };
}
