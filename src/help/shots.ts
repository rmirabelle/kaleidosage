import type { Page } from "./capture";
import { BASICS } from "./shots/basics";
import { SCENE } from "./shots/scene";
import { EFFECTS } from "./shots/effects";
import { MUSIC } from "./shots/music";
import { SHOW } from "./shots/show";
import { README } from "./shots/readme";

/**
 * One help picture. The capture run (capture.ts) makes
 * `public/help/<name>.png` from it; a chapter shows it with
 * `<Shot name="..." />`.
 */
export interface Shot {
  /** The file name: lowercase letters, digits and hyphens. */
  name: string;
  /**
   * What must show: the start screen ("empty"), a new project with one blank
   * scene ("blank"), the base project ("file", see BASE_PROJECT in
   * capture.ts), or it does not matter ("none").
   */
  needs: "empty" | "blank" | "file" | "none";
  /**
   * Shots with the same group share one project: a new blank project for
   * "blank" shots, one opening of the base project for "file" shots. A later
   * shot of a group sees what an earlier one changed. Each group starts
   * fresh, so one chapter's shots do not depend on another's. `?only=` with
   * a group's name makes that whole group. The default group is "main".
   */
  group?: string;
  /**
   * The page size for this shot alone, in CSS pixels, in place of the size
   * of its part of the run (1280 by 800 for "blank", 2560 by 1440 for
   * "file"). For a picture of the whole window that must stay readable
   * when a page shows it small.
   */
  page?: { width: number; height: number };
  /** Puts the app in the state to show, for example selects a tool or opens a menu. */
  setup?: (page: Page) => void | Promise<void>;
  /**
   * The part to show: one CSS selector, several whose boxes are joined, or a
   * function that returns the elements. The picture is this part plus its
   * margin, so the reader sees where the part is in the window.
   */
  target?: string | string[] | ((page: Page) => Element[]);
  /** Space around the part in CSS pixels: one number, or [top and bottom, left and right]. The default is 28: some of the window around the part. */
  margin?: number | [number, number];
  /** In place of target and margin: the rectangle to show, in CSS pixels of the window. A text column is 640 wide; a wider picture shows smaller. */
  box?: (page: Page) => { x: number; y: number; width: number; height: number };
  /**
   * The element the mouse is over, as a CSS selector or a function: the picture shows a
   * drawn mouse pointer there, the element's hover look, and its tip in the
   * help line. Use it when the text says to point at or to select a control.
   */
  cursor?: string | ((page: Page) => Element);
  /** Where the pointer's tip is in the cursor element, as parts of its width and height. The default is [0.5, 0.6]. */
  cursorAt?: [number, number];
  /** An element that gets a ring, to point at it. */
  mark?: string;
  /** Puts the app back, for example closes the menu or dialog. */
  cleanup?: (page: Page) => void | Promise<void>;
}

/**
 * All pictures, in the order the run makes them. Each part of the help has
 * its own list in src/help/shots/, and its own groups (see Shot.group).
 */
export const SHOTS: Shot[] = [...BASICS, ...SCENE, ...EFFECTS, ...MUSIC, ...SHOW, ...README];
