import type { Page } from "../capture";
import type { Shot } from "../shots";
import { addEffect, effectGroup, settingRow } from "../shotHelpers";

/**
 * The pictures of the three effect reference chapters. Each effect has its
 * own group, so it gets its own new project: `tools/help-capture.sh
 * fx-kaleidoscope` makes the pictures of one effect again.
 */

/** Loads one test pattern into slot A, with the slot's pattern menu, as the user does. */
const loadPattern = async (page: Page, name: string) => {
  page.click('[data-image-slot="0"] button[aria-label="Use a test pattern as source A"]');
  await page.waitFor(".source-pattern-menu");
  const item = page.findAll(".source-pattern-menu .toolbar-dropdown-item").find((entry) => entry.textContent?.trim() === name);
  if (!item) throw new Error(`The pattern menu has no ${name}`);
  item.click();
  await page.settle(300);
  /** The pattern menu stays open after a pick; a press somewhere else closes it. */
  page.dismiss();
  await page.settle(300);
};

/** One menu row of an open effect: the row with that name at its left, or the row at that place (0 is the first) for a menu with no name. */
const menuRow = (page: Page, effect: string, menu: string | number): HTMLElement => {
  const rows = Array.from(effectGroup(page, effect).querySelectorAll<HTMLElement>(".panel-select-row"));
  const row = typeof menu === "number" ? rows[menu] : rows.find((item) => item.querySelector(".panel-row-name")?.textContent?.trim().toLowerCase() === menu.toLowerCase());
  if (!row) throw new Error(`${effect} has no menu ${menu}`);
  return row;
};

/** Picks one choice of a menu of an open effect. */
const pickMenu = async (page: Page, effect: string, menu: string | number, choice: string) => {
  menuRow(page, effect, menu).querySelector<HTMLElement>(".dropdown-button")!.click();
  await page.waitFor(".dropdown-list");
  const option = page.findAll(".dropdown-list .toolbar-dropdown-item").find((entry) => entry.textContent?.trim() === choice);
  if (!option) throw new Error(`The menu ${menu} of ${effect} has no ${choice}`);
  option.click();
  await page.settle(400);
};

/** Sets a slider of an open effect to a part of its travel (0 is the left end, 1 the right end), as a drag does. */
const setSlider = (page: Page, name: string, part: number) => {
  const input = settingRow(page, name).querySelector<HTMLInputElement>('input[type="range"]');
  if (!input) throw new Error(`${name} has no slider`);
  const low = Number(input.min);
  const high = Number(input.max);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(low + (high - low) * part));
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
};

/** A text button of an open effect, such as Fill: Linear. */
const pressButton = (page: Page, effect: string, label: string) => {
  const button = Array.from(effectGroup(page, effect).querySelectorAll<HTMLElement>("button.panel-button")).find((item) => item.textContent?.trim() === label);
  if (!button) throw new Error(`${effect} has no button ${label}`);
  button.click();
};

/**
 * The FX card with the picture beside it: the open effect's controls and
 * what they do. The usual crop holds the left half of the picture; `wide`
 * goes to the right edge of the window and starts higher, for an effect that
 * draws around the center of the picture.
 */
const besidePicture = (wide = false) => (page: Page) => {
  const card = page.find(".fx-card").getBoundingClientRect();
  const x = Math.max(0, card.left - 14);
  /** A wide picture also starts higher, so it holds most of the picture's height: the center of the picture is above the middle of the FX card. */
  const top = card.top - (wide ? 130 : 12);
  return { x, y: top, width: wide ? window.innerWidth - x : 900, height: card.bottom + 12 - top };
};

interface Look {
  /** The effect's name in the Add an effect menu. */
  effect: string;
  /** The picture is `fx-<name>.png`, in the group `fx-<name>`. */
  name: string;
  /** A test pattern for slot A, in place of the checkerboard. */
  pattern?: string;
  /** An effect to add first: one that needs motion under it gets a Kaleidoscope, whose pans move at once. */
  under?: string;
  /** Changes to the new effect, for a result that shows well. */
  adjust?: (page: Page) => void | Promise<void>;
  /** How long the scene plays before the picture, in ms. The default is 1500. */
  wait?: number;
  /** The picture goes to the right edge of the window: for an effect that draws around the center. */
  wide?: boolean;
}

/** One effect at work: its controls, open, with the picture beside them. */
const look = (item: Look): Shot => ({
  name: `fx-${item.name}`,
  needs: "blank",
  group: `fx-${item.name}`,
  setup: async (page) => {
    if (item.pattern) await loadPattern(page, item.pattern);
    if (item.under) await addEffect(page, item.under);
    await addEffect(page, item.effect);
    await item.adjust?.(page);
    await page.settle(item.wait ?? 1500);
  },
  box: besidePicture(item.wide)
});

/** Where the model browser keeps its choices (STORE_KEY in ModelBrowserDialog.tsx), and the user's own choices while the model shots run. */
const MODEL_BROWSER_KEY = "kaleidosage.model-browser";
let keptBrowser: string | null = null;

/** The model that the model shots pick in the browser: one that fills the picture well, or the first one if Poly Haven no longer has it. */
const modelTile = (page: Page): HTMLElement => {
  const tiles = page.findAll(".model-browser-result") as HTMLElement[];
  return tiles.find((tile) => tile.querySelector(".model-browser-name")?.textContent?.trim() === "Marble Bust 01") ?? tiles[0];
};

export const EFFECTS: Shot[] = [
  /* Effects that shape space */
  look({ effect: "Kaleidoscope", name: "kaleidoscope", pattern: "Truchet tiles" }),
  look({ effect: "Kaleidoscope", name: "kaleidoscope-penrose", pattern: "Truchet tiles", adjust: (page) => pickMenu(page, "Kaleidoscope", "Type", "Penrose"), wide: true }),
  look({ effect: "Kaleidoscope", name: "kaleidoscope-sphere", pattern: "Truchet tiles", adjust: (page) => pickMenu(page, "Kaleidoscope", "Type", "Sphere"), wide: true }),
  look({ effect: "Kaleidoscope", name: "kaleidoscope-pinwheel", pattern: "Truchet tiles", adjust: (page) => pickMenu(page, "Kaleidoscope", "Type", "Pinwheel"), wide: true }),
  look({ effect: "Kaleidoscope", name: "kaleidoscope-tunnel", pattern: "Truchet tiles", adjust: (page) => pickMenu(page, "Kaleidoscope", "Type", "Mirror tunnel"), wide: true }),
  look({ effect: "Kaleidoscope", name: "kaleidoscope-fractal", pattern: "Truchet tiles", adjust: (page) => pickMenu(page, "Kaleidoscope", "Type", "Fractal"), wide: true }),
  look({ effect: "Algorithm", name: "algorithm", pattern: "Color grid", wait: 2500 }),
  look({ effect: "Warp", name: "warp" }),
  look({ effect: "Camera", name: "camera", wait: 2500 }),
  {
    /** Terrain needs the internet: the shot selects Load, and waits until the status line shows the land. */
    ...look({ effect: "Terrain", name: "terrain" }),
    setup: async (page) => {
      await addEffect(page, "Terrain");
      const load = Array.from(effectGroup(page, "Terrain").querySelectorAll<HTMLElement>("button")).find((item) => item.textContent?.trim() === "Load");
      load?.click();
      const end = Date.now() + 60000;
      while (Date.now() < end && !/\d m$/.test(effectGroup(page, "Terrain").querySelector(".driver-video-name")?.textContent?.trim() ?? "")) await page.settle(500);
      await page.settle(3000);
    }
  },
  {
    /** Terrain's Place and Area menus, with the mouse on Load. */
    name: "fx-terrain-load",
    needs: "blank",
    group: "fx-terrain",
    cursor: (page) => Array.from(effectGroup(page, "Terrain").querySelectorAll<HTMLElement>("button")).find((item) => item.textContent?.trim().startsWith("Load"))!,
    target: (page) => [menuRow(page, "Terrain", "Place"), effectGroup(page, "Terrain").querySelector(".driver-video-name")!],
    margin: 22
  },
  look({ effect: "3D object", name: "solid", pattern: "Color grid", wait: 2500, wide: true }),
  {
    /**
     * Effects for the object only: a Kaleidoscope below the 3D object, with
     * its check box set, mirrors the picture on the cube and not the
     * background. The 3D object's controls must be open for the picture.
     */
    name: "fx-solid-effects",
    needs: "blank",
    group: "fx-solid",
    setup: async (page) => {
      await addEffect(page, "Kaleidoscope");
      if (!effectGroup(page, "3D object").classList.contains("open")) {
        effectGroup(page, "3D object").querySelector<HTMLElement>(".panel-group-title")!.click();
        await page.settle(500);
      }
      effectGroup(page, "3D object").querySelector<HTMLInputElement>(".panel-object-effects input")!.click();
      effectGroup(page, "3D object").scrollIntoView({ block: "start" });
      await page.settle(2500);
    },
    cursor: (page) => effectGroup(page, "3D object").querySelector(".panel-object-effects label")!,
    cursorAt: [0.1, 0.6],
    box: besidePicture(true)
  },
  {
    /**
     * The model browser, which a new 3D model effect opens when the scene
     * has no model. It needs the internet. The browser's kept choices are
     * set to a known start (Poly Haven, no search words, small pictures)
     * and put back by the last shot of the group.
     */
    name: "fx-model-browser",
    needs: "blank",
    group: "fx-model",
    setup: async (page) => {
      keptBrowser = localStorage.getItem(MODEL_BROWSER_KEY);
      localStorage.setItem(MODEL_BROWSER_KEY, JSON.stringify({ source: "haven", words: "", category: "", order: "used", size: "1k" }));
      await addEffect(page, "3D model");
      await page.waitFor(".model-browser-dialog");
      /** The list comes from Poly Haven; then the first pictures must load. */
      const end = Date.now() + 60000;
      while (Date.now() < end && page.findAll(".model-browser-result").length === 0) await page.settle(500);
      const loaded = () => page.findAll(".model-browser-result img").slice(0, 12).every((image) => (image as HTMLImageElement).complete);
      while (Date.now() < end && !loaded()) await page.settle(500);
      await page.settle(800);
    },
    cursor: modelTile,
    target: ".model-browser-dialog",
    /** Little space above and below: the help line under the dialog would show a cut tip. */
    margin: [2, 20]
  },
  {
    /** A click on the model downloads it; the picture shows the model with its own colors, beside the effect's settings. */
    name: "fx-model",
    needs: "blank",
    group: "fx-model",
    setup: async (page) => {
      modelTile(page).click();
      const end = Date.now() + 120000;
      while (Date.now() < end && page.findAll(".model-browser-dialog").length) await page.settle(500);
      if (page.findAll(".model-browser-dialog").length) throw new Error("The model did not load");
      await page.settle(3500);
    },
    box: besidePicture(true)
  },
  {
    /** The File row with the mouse on Search, and the Map menu and Map amount below it. */
    name: "fx-model-file",
    needs: "blank",
    group: "fx-model",
    cursor: (page) => effectGroup(page, "3D model").querySelector('button[aria-label="Search for a 3D model"]')!,
    target: (page) => [menuRow(page, "3D model", "File"), settingRow(page, "Map amount")],
    margin: 22
  },
  {
    /** A 3D object next to the 3D model in the list: its cube and the model are in one space, and go through each other. */
    name: "fx-model-shared",
    needs: "blank",
    group: "fx-model",
    setup: async (page) => {
      await addEffect(page, "3D object");
      await pickMenu(page, "3D object", "Shape", "Cube");
      await page.settle(3000);
    },
    box: besidePicture(true),
    cleanup: () => {
      if (keptBrowser === null) localStorage.removeItem(MODEL_BROWSER_KEY);
      else localStorage.setItem(MODEL_BROWSER_KEY, keptBrowser);
    }
  },
  look({ effect: "Bubble", name: "bubble" }),
  {
    /** Panorama over a Bubble, half a screen width to the side and with no speed: the mirror copies of the bubble show at the left and right edges. */
    ...look({ effect: "Panorama", name: "panorama", under: "Bubble", wide: true }),
    setup: async (page) => {
      await addEffect(page, "Bubble");
      await addEffect(page, "Panorama");
      /** The Bubble also has a Pan X, so the sliders are found in the Panorama. */
      const slide = (name: string, part: number) => {
        const row = Array.from(effectGroup(page, "Panorama").querySelectorAll<HTMLElement>(".panel-row")).find((item) => item.querySelector(".panel-row-name")?.textContent?.trim().toLowerCase() === name.toLowerCase());
        const input = row?.querySelector<HTMLInputElement>('input[type="range"]');
        if (!input) throw new Error(`Panorama has no slider ${name}`);
        const low = Number(input.min);
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(low + (Number(input.max) - low) * part));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      };
      slide("Speed X", 0.5);
      slide("Pan X", 0.625);
      /** Stop puts the travel by Speed X back to 0, so only Pan X moves the picture. */
      page.click('.scene-transport button[aria-label="Stop"]');
      await page.settle(1500);
    }
  },

  /* Effects that draw light */
  look({
    effect: "Light cycles",
    name: "cycles",
    pattern: "Color grid",
    /** A dark background and more cycles, so the lines show well. */
    adjust: (page) => {
      setSlider(page, "Count", 0.45);
      settingRow(page, "Background").scrollIntoView({ block: "center" });
      setSlider(page, "Background", 0.08);
      effectGroup(page, "Light cycles").scrollIntoView({ block: "start" });
    },
    wait: 9000,
    wide: true
  }),
  look({ effect: "Light rays", name: "rays", pattern: "Star field" }),
  look({ effect: "Lasers", name: "lasers", pattern: "Solid Black", wait: 2500, wide: true }),
  look({ effect: "Light cone", name: "cone", pattern: "Star field", wait: 2500, wide: true }),
  look({
    effect: "Light cone",
    name: "cone-shell",
    pattern: "Star field",
    adjust: async (page) => {
      await pickMenu(page, "Light cone", "Type", "Laser shell");
      await pickMenu(page, "Light cone", "Shape", "Pyramid");
    },
    wait: 2500,
    wide: true
  }),
  look({ effect: "Light paths", name: "paths", pattern: "Solid Black", wait: 5000, wide: true }),
  look({ effect: "Light shapes", name: "outlines", pattern: "Solid Black", wait: 6000, wide: true }),
  look({ effect: "Spirograph", name: "spiro", pattern: "Solid Black", wait: 5000, wide: true }),
  {
    /** The first wheel of the Spirograph, with the mouse in its picture, where a click places the pen hole. */
    name: "fx-spiro-wheel",
    needs: "blank",
    group: "fx-spiro",
    cursor: ".spiro-wheel .spiro-wheel-picture",
    cursorAt: [0.62, 0.42],
    target: ".spiro-wheel",
    margin: 22
  },
  look({ effect: "Particles", name: "particles", pattern: "Color grid", adjust: (page) => setSlider(page, "Background", 0.15), wait: 6000 }),
  look({ effect: "Bloom", name: "bloom", pattern: "Star field" }),

  /* Effects for time, texture and color */
  look({ effect: "Trails", name: "trails", pattern: "Sunburst", under: "Kaleidoscope", wait: 4000 }),
  look({
    effect: "Time smear",
    name: "smear",
    under: "Kaleidoscope",
    /** Rings with some bands show the delay as steps in the moving picture. */
    adjust: async (page) => {
      await pickMenu(page, "Time smear", 0, "Rings");
      setSlider(page, "Bands", 0.35);
    },
    wait: 6000
  }),
  look({ effect: "Blur", name: "blur" }),
  look({ effect: "Sharpen", name: "sharpen", pattern: "Scattered lines", adjust: (page) => setSlider(page, "Sharpen", 0.8) }),
  look({ effect: "Contours", name: "contours", pattern: "Color clouds" }),
  {
    /** The black and white chips of Contours' Color, with the mouse on the white chip. */
    name: "fx-contours-chips",
    needs: "blank",
    group: "fx-contours",
    cursor: ".tone-chips .tone-chip.white",
    target: (page) => [page.find(".tone-chips").closest(".panel-row") ?? page.find(".tone-chips")],
    margin: 22
  },
  look({ effect: "Relief", name: "relief", pattern: "Rings", adjust: (page) => setSlider(page, "Relief depth", 0.6) }),
  look({ effect: "Pixel sort", name: "sort", pattern: "Color clouds" }),
  look({ effect: "Driver", name: "driver", wait: 2500 }),
  {
    /** A new Image or Video effect opens the Open dialog at once; the shot closes it, so the picture shows the effect with no file yet. */
    ...look({ effect: "Image or Video", name: "picture" }),
    setup: async (page) => {
      await addEffect(page, "Image or Video");
      await page.settle(600);
      if (page.findAll(".open-dialog").length) page.press(".open-dialog-close");
      await page.settle(600);
    }
  },
  look({ effect: "Text", name: "text", pattern: "Contour lines", adjust: (page) => setSlider(page, "Glow", 0.5), wide: true }),
  {
    /** The Text effect's Font box with the focus in it and its list open. */
    name: "fx-text-font",
    needs: "blank",
    group: "fx-text",
    setup: async (page) => {
      /* A click opens the list also when the window does not have the focus, where focus() alone may not fire. */
      const input = page.findAll(".fx-card .font-picker-box input")[0];
      input?.focus();
      input?.click();
      await page.waitFor(".font-picker-list");
      await page.settle(300);
    },
    cursor: ".fx-card .font-picker-box",
    cursorAt: [0.4, 0.5],
    target: [".fx-card .font-picker-box", ".font-picker-list"],
    margin: 14,
    cleanup: () => (document.activeElement as HTMLElement | null)?.blur()
  },
  look({
    effect: "Color",
    name: "color",
    adjust: async (page) => {
      pressButton(page, "Color", "Linear");
      await page.settle(300);
      setSlider(page, "Color overlay", 0.7);
    }
  }),
  {
    /** The gradient of Color with the color picker of one stop open. */
    name: "fx-color-gradient",
    needs: "blank",
    group: "fx-color",
    setup: async (page) => {
      /** A stop opens its color picker on a press and release with no move between them. */
      const stop = page.findAll(".fx-card .gradient-stop")[1];
      const box = stop.getBoundingClientRect();
      const at = { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
      stop.dispatchEvent(new PointerEvent("pointerdown", at));
      stop.dispatchEvent(new PointerEvent("pointerup", at));
      await page.waitFor(".color-popup");
    },
    cursor: (page) => page.findAll(".fx-card .gradient-stop")[1],
    target: [".fx-card .gradient-row", ".color-popup"],
    margin: 14,
    cleanup: () => document.querySelector<HTMLElement>(".color-popup .color-ok")?.click()
  },
  look({ effect: "Levels", name: "levels", pattern: "Color clouds", adjust: (page) => setSlider(page, "Black level", 0.45) }),
  look({ effect: "Opacity mask", name: "mask", adjust: (page) => pickMenu(page, "Opacity mask", "Type", "Radial"), wide: true }),
  look({ effect: "Opacity mask", name: "mask-shape", adjust: (page) => pickMenu(page, "Opacity mask", "Type", "Triangle"), wide: true })
];
