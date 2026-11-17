import type { Page } from "../capture";
import type { Shot } from "../shots";
import { addEffect, effectGroup, menuItem, settingRow, typeText } from "../shotHelpers";

/**
 * The pictures of "The Scene card", "The FX list" and "Settings that move".
 * Each chapter has its own group, so each starts from a new project with one
 * blank scene: the checkerboard in slot A, no effects.
 */

const SLOT_A = '[data-image-slot="0"]';
const SLOT_B = '[data-image-slot="1"]';

/** One button of a slot's four, by the start of its aria-label ("Search for a photo"). */
const slotButton = (slot: string, label: string) => `${slot} .source-actions button[aria-label^="${label}"]`;

/** One item of an open menu, by its text. */
const itemOf = (page: Page, menu: string, text: string): HTMLElement => {
  const item = page.findAll(`${menu} .toolbar-dropdown-item, ${menu} [role="option"]`).find((entry) => entry.textContent?.trim().startsWith(text));
  if (!item) throw new Error(`The menu ${menu} has no ${text}`);
  return item;
};

/** A right-click on an element, which opens its menu. */
const rightClickOn = (element: Element) => {
  const box = element.getBoundingClientRect();
  element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2, button: 2 }));
};

/**
 * Ctrl + press and hold on an element: the app's "no effect while held"
 * gesture. A drawn press has no real pointer for the app to capture, so the
 * capture call does nothing during it. `release` lets go.
 */
let held: Element | null = null;
const ctrlHold = (element: Element) => {
  const box = element.getBoundingClientRect();
  const capture = Element.prototype.setPointerCapture;
  Element.prototype.setPointerCapture = () => {};
  try {
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, ctrlKey: true, button: 0, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }));
  } finally {
    Element.prototype.setPointerCapture = capture;
  }
  held = element;
};
const release = () => {
  held?.dispatchEvent(new PointerEvent("lostpointercapture", { bubbles: true }));
  held = null;
};

/** Shows the four buttons of slot B with no drawn mouse, for the small pictures of single buttons: the slot is empty then, so each button is on a plain ground. */
const showSlotButtons = (on: boolean) => document.querySelector(SLOT_B)?.classList.toggle("help-hover", on);

/** One small picture of a single button, to sit in a sentence. */
const icon = (name: string, group: string, target: Shot["target"], more: Partial<Shot> = {}): Shot => ({ name, needs: "blank", group, target, margin: 3, ...more });

/** The Search dialog remembers its words for the user; the run puts the user's own words back. */
const SEARCH_KEY = "kaleidosage.image-search";
let searchBefore: string | null = null;

/** The header of an effect in the FX list. */
const headerOf = (page: Page, title: string) => effectGroup(page, title).querySelector<HTMLElement>(".panel-group-header")!;

/** Opens an effect that is closed. */
const openEffect = async (page: Page, title: string) => {
  const group = effectGroup(page, title);
  if (!group.classList.contains("open")) {
    const title = group.querySelector<HTMLElement>(".panel-group-title")!;
    /** A press comes before a real click; the header needs it to accept the click after a Ctrl + hold. */
    title.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    title.click();
  }
  await page.settle(500);
};

/** A setting's row, scrolled to the middle of the list. */
const showRow = async (page: Page, name: string) => {
  const row = settingRow(page, name);
  row.scrollIntoView({ block: "center" });
  await page.settle(300);
  return row;
};

/** A picture of one setting's row with the panel around it and the picture beside it: a text column wide. */
const rowBox = (name: string, above = 44, below = 44): Shot["box"] => (page) => {
  const row = settingRow(page, name).getBoundingClientRect();
  return { x: 0, y: row.top - above, width: 640, height: row.height + above + below };
};

export const SCENE: Shot[] = [
  /* "The Scene card" */
  { name: "scene-card", needs: "blank", group: "scene-card", target: ".source-section", margin: 24 },
  {
    name: "scene-length",
    needs: "blank",
    group: "scene-card",
    cursor: ".source-length input[type=range]",
    cursorAt: [0.18, 0.7],
    target: [".source-section .panel-header-bar", ".source-length"],
    margin: 24
  },
  {
    /** The mouse over slot A, on the Search button, so the four buttons show. */
    name: "scene-slot-buttons",
    needs: "blank",
    group: "scene-card",
    cursor: slotButton(SLOT_A, "Search for a photo"),
    target: SLOT_A,
    margin: 30
  },
  icon("scene-icon-random", "scene-card", slotButton(SLOT_B, "Load a random photo"), { setup: () => { showSlotButtons(true); }, cleanup: () => { showSlotButtons(false); } }),
  icon("scene-icon-search", "scene-card", slotButton(SLOT_B, "Search for a photo"), { setup: () => { showSlotButtons(true); }, cleanup: () => { showSlotButtons(false); } }),
  icon("scene-icon-pattern", "scene-card", slotButton(SLOT_B, "Use a test pattern"), { setup: () => { showSlotButtons(true); }, cleanup: () => { showSlotButtons(false); } }),
  icon("scene-icon-open", "scene-card", slotButton(SLOT_B, "Open an image or video file"), { setup: () => { showSlotButtons(true); }, cleanup: () => { showSlotButtons(false); } }),
  {
    /** The Search dialog with results. With no internet, the dialog shows its message in place of results. */
    name: "scene-search",
    needs: "blank",
    group: "scene-card",
    setup: async (page) => {
      searchBefore = localStorage.getItem(SEARCH_KEY);
      page.click(slotButton(SLOT_A, "Search for a photo"));
      await page.waitFor(".image-search-dialog");
      typeText(page.find(".image-search-dialog .image-search-bar input") as HTMLInputElement, "rose window");
      await page.settle(100);
      page.pressText(".image-search-dialog .image-search-bar button", "Search");
      await page.waitFor(".image-search-result", 12000).catch(() => { /* No internet: the picture shows the dialog's message. */ });
      await page.settle(1500);
    },
    target: ".image-search-dialog",
    margin: 16,
    cleanup: async (page) => {
      page.press(".image-search-dialog .about-dialog-close");
      await page.settle(200);
      if (searchBefore === null) localStorage.removeItem(SEARCH_KEY);
      else localStorage.setItem(SEARCH_KEY, searchBefore);
    }
  },
  {
    /** The pattern menu of slot A, with the mouse on a pattern. */
    name: "scene-pattern-menu",
    needs: "blank",
    group: "scene-card",
    setup: async (page) => {
      page.click(slotButton(SLOT_A, "Use a test pattern"));
      await page.waitFor(".source-pattern-menu");
    },
    cursor: (page) => itemOf(page, ".source-pattern-menu", "Color grid"),
    cursorAt: [0.6, 0.6],
    target: [".source-pattern-menu", SLOT_A],
    margin: 22,
    cleanup: async (page) => {
      page.dismiss();
      await page.settle(200);
    }
  },
  {
    /** Both slots in use: the setup puts a pattern in slot B and sets Crossfade to the middle. */
    name: "scene-crossfade",
    needs: "blank",
    group: "scene-card",
    setup: async (page) => {
      page.click(slotButton(SLOT_B, "Use a test pattern"));
      await page.waitFor(".source-pattern-menu");
      itemOf(page, ".source-pattern-menu", "Color grid").click();
      await page.settle(300);
      page.dismiss();
      await page.settle(400);
      const slider = settingRow(page, "Crossfade").querySelector<HTMLInputElement>("input[type=range]")!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, "0.5");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
      await page.settle(300);
    },
    cursor: (page) => settingRow(page, "Crossfade").querySelector(".slider")!,
    cursorAt: [0.5, 0.7],
    box: (page) => {
      const card = page.find(".source-section").getBoundingClientRect();
      return { x: 0, y: card.top - 14, width: 640, height: card.height + 28 };
    }
  },
  {
    /** The right-click menu of Crossfade. */
    name: "scene-crossfade-menu",
    needs: "blank",
    group: "scene-card",
    setup: async (page) => {
      rightClickOn(settingRow(page, "Crossfade").querySelector(".panel-row-name")!);
      await page.waitFor(".context-menu");
    },
    cursor: (page) => itemOf(page, ".context-menu", "Dissolve by brightness"),
    cursorAt: [0.7, 0.6],
    target: (page) => [page.find(".context-menu"), settingRow(page, "Crossfade")],
    margin: 22,
    cleanup: async (page) => {
      page.dismiss();
      await page.settle(200);
    }
  },
  icon("scene-icon-swap", "scene-card", ".source-swap"),
  icon("scene-icon-tiling", "scene-card", ".source-tiling"),
  {
    name: "scene-tiling-menu",
    needs: "blank",
    group: "scene-card",
    setup: async (page) => {
      page.press(".source-tiling");
      await page.waitFor(".context-menu");
    },
    cursor: (page) => itemOf(page, ".context-menu", "Mirror"),
    cursorAt: [0.7, 0.6],
    target: [".context-menu", ".source-images"],
    margin: 22,
    cleanup: async (page) => {
      page.dismiss();
      await page.settle(200);
    }
  },
  {
    /** The remove button of slot B. */
    name: "scene-remove",
    needs: "blank",
    group: "scene-card",
    cursor: `${SLOT_B} .source-remove`,
    target: SLOT_B,
    margin: 30
  },

  /* "The FX list" */
  {
    /** The empty FX card of a new scene. */
    name: "fx-empty",
    needs: "blank",
    group: "fx-list",
    target: [".fx-card .panel-header-bar", ".fx-card .empty-state"],
    margin: 24
  },
  {
    /** The Add an effect menu with two effects in the list already; the cleanup adds Bloom. */
    name: "fx-add-menu",
    needs: "blank",
    group: "fx-list",
    setup: async (page) => {
      await addEffect(page, "Kaleidoscope");
      await addEffect(page, "Warp");
      page.press(".fx-card .add-effect .panel-button");
      await page.waitFor(".add-effect-menu");
    },
    cursor: (page) => menuItem(page, "Bloom"),
    cursorAt: [0.7, 0.6],
    target: [".add-effect-menu", ".add-effect-preview", ".fx-card .add-effect .panel-button"],
    margin: 22,
    cleanup: async (page) => {
      menuItem(page, "Bloom").click();
      await page.settle(800);
    }
  },
  {
    /** Three effects, all closed: the list in its order. */
    name: "fx-list",
    needs: "blank",
    group: "fx-list",
    setup: async (page) => {
      page.findAll(".fx-card .panel-group.open .panel-group-title").forEach((title) => title.click());
      await page.settle(600);
    },
    target: (page) => [page.find(".fx-card .panel-header-bar"), ...page.findAll(".fx-card .panel-group")],
    margin: 24
  },
  {
    /** The buttons of the FX title bar, with the mouse on Nudge all. */
    name: "fx-title-buttons",
    needs: "blank",
    group: "fx-list",
    cursor: '.fx-card button[aria-label="Nudge all"]',
    target: ".fx-card .panel-header-bar",
    margin: [30, 24]
  },
  icon("fx-icon-audio", "fx-list", '.fx-card button[aria-label="Show audio buttons"]'),
  icon("fx-icon-nudge", "fx-list", '.fx-card button[aria-label="Nudge all"]'),
  icon("fx-icon-clear", "fx-list", '.fx-card button[aria-label="Clear all"]'),
  icon("fx-icon-new", "fx-list", ".fx-card .panel-header-bar .add-effect .panel-button"),
  {
    /** The header of one effect, with the mouse on its dice. */
    name: "fx-group-header",
    needs: "blank",
    group: "fx-list",
    cursor: (page) => headerOf(page, "Warp").querySelector(".panel-group-dice")!,
    target: (page) => [headerOf(page, "Warp")],
    margin: [34, 24]
  },
  icon("fx-icon-dice", "fx-list", (page) => [headerOf(page, "Warp").querySelector(".panel-group-dice")!]),
  icon("fx-icon-remove", "fx-list", (page) => [headerOf(page, "Warp").querySelector(".panel-group-remove")!]),
  icon("fx-icon-grip", "fx-list", (page) => [headerOf(page, "Warp").querySelector(".panel-group-grip")!]),
  {
    /** The right-click menu of an effect's header; the cleanup selects Lock. */
    name: "fx-group-menu",
    needs: "blank",
    group: "fx-list",
    setup: async (page) => {
      rightClickOn(headerOf(page, "Warp"));
      await page.waitFor(".context-menu");
    },
    cursor: (page) => itemOf(page, ".context-menu", "Lock"),
    cursorAt: [0.7, 0.6],
    target: (page) => [page.find(".context-menu"), headerOf(page, "Warp")],
    margin: 24,
    cleanup: async (page) => {
      itemOf(page, ".context-menu", "Lock").click();
      await page.settle(300);
    }
  },
  {
    /** A locked effect: the lock shows, and its dice does not. */
    name: "fx-group-locked",
    needs: "blank",
    group: "fx-list",
    target: (page) => [headerOf(page, "Warp")],
    margin: [34, 24]
  },
  {
    /** An effect with Ctrl held on its header: it has no effect, and its header is dim. */
    name: "fx-bypass",
    needs: "blank",
    group: "fx-list",
    setup: async (page) => {
      ctrlHold(headerOf(page, "Kaleidoscope").querySelector(".panel-group-fill") ?? headerOf(page, "Kaleidoscope"));
      await page.settle(300);
      if (!effectGroup(page, "Kaleidoscope").classList.contains("disabled")) throw new Error("Ctrl + hold did not bypass the effect");
    },
    cursor: (page) => headerOf(page, "Kaleidoscope").querySelector(".panel-group-title")!,
    cursorAt: [0.8, 0.6],
    target: (page) => [page.find(".fx-card .panel-header-bar"), ...page.findAll(".fx-card .panel-group")],
    margin: 24,
    cleanup: async (page) => {
      release();
      await page.settle(200);
    }
  },
  {
    /** An open effect: its header and its first settings, with the picture beside them. */
    name: "fx-open-effect",
    needs: "blank",
    group: "fx-list",
    setup: (page) => openEffect(page, "Kaleidoscope"),
    box: (page) => {
      const top = page.find(".fx-card").getBoundingClientRect().top - 14;
      return { x: 0, y: top, width: 640, height: 400 };
    }
  },
  {
    /** The Common section at the end of an effect, with its Blend list open. */
    name: "fx-common-blend",
    needs: "blank",
    group: "fx-list",
    setup: async (page) => {
      await openEffect(page, "Kaleidoscope");
      effectGroup(page, "Kaleidoscope").querySelector(".panel-layer-blend")!.scrollIntoView({ block: "center" });
      await page.settle(300);
      effectGroup(page, "Kaleidoscope").querySelector<HTMLElement>(".panel-layer-blend .dropdown-button")!.click();
      await page.waitFor(".dropdown-list");
    },
    cursor: (page) => itemOf(page, ".dropdown-list", "Screen"),
    cursorAt: [0.6, 0.6],
    target: (page) => [page.find(".dropdown-list"), effectGroup(page, "Kaleidoscope").querySelector(".panel-common-head")!, effectGroup(page, "Kaleidoscope").querySelector(".panel-layer-blend")!],
    margin: 22,
    cleanup: async (page) => {
      page.dismiss();
      await page.settle(200);
    }
  },

  /* "Settings that move": a Kaleidoscope effect, whose Twirl gets a range step by step */
  {
    /** One setting with a single value: its name, its value and its slider. */
    name: "row-single",
    needs: "blank",
    group: "settings",
    setup: async (page) => {
      await addEffect(page, "Kaleidoscope");
      await showRow(page, "Tile size");
    },
    box: rowBox("Tile size", 70, 30)
  },
  {
    /** Ctrl held on a name: the setting has no effect while held. */
    name: "row-bypass",
    needs: "blank",
    group: "settings",
    setup: async (page) => {
      const name = (await showRow(page, "Tile size")).querySelector(".panel-row-name")!;
      ctrlHold(name);
      await page.settle(300);
      if (!name.classList.contains("bypassed")) throw new Error("Ctrl + hold did not turn the setting off");
    },
    cursor: (page) => settingRow(page, "Tile size").querySelector(".panel-row-name")!,
    box: rowBox("Tile size", 70, 30),
    cleanup: async (page) => {
      release();
      await page.settle(200);
    }
  },
  icon("row-icon-range", "settings", (page) => [settingRow(page, "Tile size").querySelector(".panel-drift")!]),
  {
    /** The range button of Twirl, just turned on: two handles show. */
    name: "row-range-on",
    needs: "blank",
    group: "settings",
    setup: async (page) => {
      (await showRow(page, "Twirl")).querySelector<HTMLElement>(".panel-drift:not(.on)")?.click();
      await page.settle(300);
    },
    cursor: (page) => settingRow(page, "Twirl").querySelector(".panel-drift")!,
    box: rowBox("Twirl")
  },
  {
    /** The mouse between the two handles, where a drag moves the whole range. */
    name: "row-range-grab",
    needs: "blank",
    group: "settings",
    setup: async (page) => { await showRow(page, "Twirl"); },
    cursor: (page) => settingRow(page, "Twirl").querySelector(".range-grab") ?? settingRow(page, "Twirl").querySelector(".slider")!,
    cursorAt: [0.5, 0.7],
    box: rowBox("Twirl")
  },
  icon("row-icon-range-on", "settings", (page) => [settingRow(page, "Twirl").querySelector(".panel-drift")!]),
  icon("row-icon-reverse", "settings", (page) => [settingRow(page, "Twirl").querySelector(".panel-reverse")!]),
  icon("row-icon-ease", "settings", (page) => [settingRow(page, "Twirl").querySelector(".panel-ease")!]),
  icon("row-icon-own-time", "settings", (page) => [settingRow(page, "Twirl").querySelector(".panel-custom")!]),
  {
    /** The Easing menu of Twirl, with the mouse on Bounce; the cleanup selects it. */
    name: "row-ease-menu",
    needs: "blank",
    group: "settings",
    setup: async (page) => {
      (await showRow(page, "Twirl")).querySelector<HTMLElement>(".panel-ease")!.click();
      await page.waitFor(".ease-menu");
    },
    cursor: (page) => itemOf(page, ".ease-menu", "Bounce"),
    cursorAt: [0.7, 0.6],
    target: (page) => [page.find(".ease-menu"), settingRow(page, "Twirl")],
    margin: 22,
    cleanup: async (page) => {
      itemOf(page, ".ease-menu", "Bounce").click();
      await page.settle(300);
    }
  },
  {
    /** Twirl reversed: the setup selects Reverse. */
    name: "row-reverse",
    needs: "blank",
    group: "settings",
    setup: async (page) => {
      (await showRow(page, "Twirl")).querySelector<HTMLElement>(".panel-reverse:not(.on)")?.click();
      await page.settle(300);
    },
    cursor: (page) => settingRow(page, "Twirl").querySelector(".panel-reverse")!,
    box: rowBox("Twirl")
  },
  {
    /** Twirl with its own time: the Loop slider shows under it. */
    name: "row-own-time",
    needs: "blank",
    group: "settings",
    setup: async (page) => {
      (await showRow(page, "Twirl")).querySelector<HTMLElement>(".panel-custom:not(.on)")?.click();
      await page.settle(300);
      settingRow(page, "Twirl").scrollIntoView({ block: "center" });
      await page.settle(300);
    },
    cursor: (page) => settingRow(page, "Twirl").querySelector(".panel-custom")!,
    box: rowBox("Twirl")
  },
  {
    /** The Length of the scene, which every range with no time of its own follows. */
    name: "row-length",
    needs: "blank",
    group: "settings",
    cursor: ".source-length input[type=range]",
    cursorAt: [0.18, 0.7],
    target: [".source-section .panel-header-bar", ".source-length"],
    margin: 24
  }
];
