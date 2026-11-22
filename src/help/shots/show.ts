import type { Page } from "../capture";
import type { Shot } from "../shots";
import { PLAY_BUTTON, addEffect, settingRow } from "../shotHelpers";

/**
 * The pictures of the Performing chapters ("Playing a show", "MIDI
 * controllers", "Cast and VR") and the Output chapters ("Save PNG and Export
 * Video", "Updates and shortcuts").
 *
 * No shot here starts a thing that goes on after the picture: no export, no
 * Save PNG, no update check, no Cast, no VR, no full screen and no MIDI
 * Learn. A shot only opens a menu, a panel or a dialog, and closes it again.
 */

/** One item of the open menu of the menu bar, by its label. */
const menuBarItem = (page: Page, label: string): HTMLElement => {
  const item = page.findAll(".menubar-dropdown button").find((entry) => entry.querySelector(".menubar-item-label")?.textContent?.trim() === label);
  if (!item) throw new Error(`The open menu has no item ${label}`);
  return item;
};

/** The first item of the open menu whose label passes "test"; for the Cast items, whose labels have the names of this PC's screens and receivers. */
const menuBarItemWhere = (page: Page, what: string, test: (label: string) => boolean): HTMLElement => {
  const item = page.findAll(".menubar-dropdown button").find((entry) => test(entry.querySelector(".menubar-item-label")?.textContent?.trim() ?? ""));
  if (!item) throw new Error(`The open menu has no item ${what}`);
  return item;
};

/** The open View menu with the mouse on the first item whose label passes "test". */
const viewMenuShot = (name: string, what: string, test: (label: string) => boolean): Shot => ({
  name,
  group: "cast",
  needs: "blank",
  setup: (page) => page.openMenu("View"),
  cursor: (page) => menuBarItemWhere(page, what, test),
  cursorAt: [0.55, 0.6],
  target: (page) => [page.find(".menubar-dropdown"), ...page.findAll(".menubar-root > button.active")],
  margin: [20, 60],
  cleanup: (page) => page.closeMenu()
});

/** The open menu of the menu bar with its name in the bar, and the mouse on one item. */
const menuShot = (name: string, group: string, menu: string, item: string, needs: Shot["needs"] = "blank"): Shot => ({
  name,
  group,
  needs,
  setup: (page) => page.openMenu(menu),
  cursor: (page) => menuBarItem(page, item),
  cursorAt: [0.55, 0.6],
  target: (page) => [page.find(".menubar-dropdown"), ...page.findAll(".menubar-root > button.active")],
  margin: [20, 60],
  cleanup: (page) => page.closeMenu()
});

/** Opens the Export Video dialog; nothing in it is pressed, because each choice is remembered and Export Video starts the work. */
const openExport = async (page: Page) => {
  if (!page.findAll(".video-dialog").length) {
    await page.menuCommand("File", "Export Video…");
    await page.waitFor(".video-dialog");
    await page.settle(300);
  }
};
const closeExport = (page: Page) => {
  if (page.findAll(".video-dialog").length) page.press(".video-dialog .about-dialog-close");
};

/** One row of the Export Video dialog, by its label, with the notes under it up to the next row. */
const exportRows = (page: Page, from: string, to?: string): Element[] => {
  const rows = Array.from(page.find(".video-dialog-body").children).filter((row) => (row as HTMLElement).offsetHeight > 0);
  const labelOf = (row: Element) => row.querySelector(".video-label")?.textContent?.trim() ?? "";
  const start = rows.findIndex((row) => labelOf(row) === from);
  if (start < 0) throw new Error(`The Export Video dialog has no ${from} row`);
  let end = to ? rows.findIndex((row) => labelOf(row) === to) : start;
  if (end < start) end = start;
  /** The notes that follow the last row belong to it. */
  while (end + 1 < rows.length && !labelOf(rows[end + 1])) end += 1;
  return rows.slice(start, end + 1);
};

/** A part of the Export Video dialog, with the dialog's sides around it. */
const exportShot = (name: string, from: string, to?: string): Shot => ({
  name,
  group: "dialogs",
  needs: "file",
  setup: openExport,
  box: (page) => {
    const dialog = page.find(".video-dialog").getBoundingClientRect();
    const rows = exportRows(page, from, to).map((row) => row.getBoundingClientRect());
    const top = Math.min(...rows.map((row) => row.top)) - 18;
    const bottom = Math.max(...rows.map((row) => row.bottom)) + 18;
    return { x: dialog.left - 20, y: top, width: dialog.width + 40, height: bottom - top };
  },
  cleanup: closeExport
});

/** Opens the MIDI tab of the bottom panel. */
const openMidiPanel = async (page: Page) => {
  if (!page.findAll('section[aria-label="MIDI mappings"]').length) {
    page.key("m");
    await page.waitFor('section[aria-label="MIDI mappings"]');
    await page.settle(300);
  }
};
const closeBottomPanel = (page: Page) => {
  if (page.findAll(".midi-panel.open").length) page.press('.bottom-panel-tab-row [aria-label="Close the panel"]');
};

/** The FX card's button that shows the MIDI buttons of the settings; it is there only with a controller or a mapping. */
const MIDI_TOGGLE = '.fx-card button[aria-label="Show MIDI buttons"]';
/** True when this shot turned the MIDI buttons on, so its cleanup turns them off again. */
let midiButtonsTurnedOn = false;
const showMidiButtons = async (page: Page) => {
  const toggle = page.find(MIDI_TOGGLE);
  midiButtonsTurnedOn = toggle.getAttribute("aria-pressed") !== "true";
  if (midiButtonsTurnedOn) toggle.click();
  await page.settle(300);
};
const hideMidiButtons = (page: Page) => {
  if (midiButtonsTurnedOn) page.find(MIDI_TOGGLE).click();
  midiButtonsTurnedOn = false;
};

/** The scene's play controls with the help line under them, which shows the tip of the control under the mouse. */
const playControlsBox = (page: Page) => {
  const controls = page.find(".scene-transport").getBoundingClientRect();
  return { x: 0, y: controls.top - 26, width: controls.right + 110, height: window.innerHeight - controls.top + 26 };
};

export const SHOW: Shot[] = [
  /* "Playing a show": a new project with a Kaleidoscope effect, so the picture moves. */
  {
    /** The scene's play controls, with the mouse on Pause. */
    name: "play-controls",
    group: "playing",
    needs: "blank",
    setup: (page) => addEffect(page, "Kaleidoscope"),
    cursor: PLAY_BUTTON,
    box: playControlsBox
  },
  { name: "play-stop", group: "playing", needs: "blank", target: '.scene-transport button[aria-label="Stop"]', margin: 3 },
  { name: "play-pause", group: "playing", needs: "blank", target: PLAY_BUTTON, margin: 3 },
  {
    /** The buttons at the top right of the picture, which show while the mouse is over the picture. */
    name: "stage-buttons",
    group: "playing",
    needs: "blank",
    cursor: '.stage-controls button[aria-label="Full screen"]',
    box: (page) => {
      const stage = page.find("main.stage").getBoundingClientRect();
      return { x: stage.right - 420, y: stage.top - 60, width: 440, height: 220 };
    }
  },
  menuShot("view-menu", "playing", "View", "Full Screen"),
  {
    /** The Performance panel, over the top left of the picture. */
    name: "performance",
    group: "playing",
    needs: "blank",
    setup: async (page) => {
      if (!page.findAll(".perf-panel").length) page.key("p");
      await page.waitFor(".perf-fps-value");
      /** The chart needs some seconds of frames. */
      await page.settle(4000);
    },
    target: ".perf-panel",
    margin: 24,
    cleanup: (page) => {
      if (page.findAll(".perf-panel").length) page.key("p");
    }
  },
  {
    /** With more than one scene, the play controls get the countdown bar and Scene Hold. */
    name: "play-hold",
    group: "playing",
    needs: "blank",
    setup: async (page) => {
      page.newScene();
      await page.settle(400);
      page.newScene();
      await page.settle(600);
    },
    cursor: ".scene-transport .hold-toggle",
    box: playControlsBox
  },

  /* "MIDI controllers": the pictures show the user's own controller and mappings as they are; nothing is learned, changed or removed. */
  {
    /** The MIDI tab of the bottom panel: its left part, with the toolbar, the devices and the first mappings. */
    name: "midi-panel",
    group: "midi",
    needs: "blank",
    setup: async (page) => {
      await addEffect(page, "Kaleidoscope");
      await openMidiPanel(page);
    },
    box: (page) => {
      const panel = page.find(".midi-panel").getBoundingClientRect();
      return { x: 0, y: panel.top - 40, width: 900, height: window.innerHeight - panel.top + 40 };
    }
  },
  {
    /** The Learn button of the MIDI tab; the mouse is on it, with no click. */
    name: "midi-learn",
    group: "midi",
    needs: "blank",
    setup: openMidiPanel,
    cursor: ".midi-learn-toggle",
    box: (page) => {
      const header = page.find(".midi-panel-header").getBoundingClientRect();
      return { x: 0, y: header.top - 56, width: 640, height: header.height + 150 };
    },
    cleanup: closeBottomPanel
  },
  {
    /** The FX card's Show MIDI buttons button; it is there only with a controller or a mapping. */
    name: "midi-show-buttons",
    group: "midi",
    needs: "blank",
    cursor: MIDI_TOGGLE,
    target: ".fx-card .panel-header-bar",
    margin: 24
  },
  {
    /** The MIDI button of one setting, with the mouse on it and no click. */
    name: "midi-assign",
    group: "midi",
    needs: "blank",
    setup: async (page) => {
      await showMidiButtons(page);
      settingRow(page, "Twirl").scrollIntoView({ block: "center" });
      await page.settle(300);
    },
    cursor: (page) => {
      const button = settingRow(page, "Twirl").querySelector(".midi-assign");
      if (!button) throw new Error("The Twirl setting has no MIDI button");
      return button;
    },
    box: (page) => {
      const row = settingRow(page, "Twirl").getBoundingClientRect();
      return { x: 0, y: row.top - 60, width: 640, height: row.height + 120 };
    },
    cleanup: hideMidiButtons
  },

  /* "Cast and VR": only the buttons and the menu items; a cast or a VR session never starts. */
  /* The Cast item is "Cast" with no place to cast to, else "Cast to" with a screen's or a receiver's name. */
  viewMenuShot("cast-menu", "Cast", (label) => label === "Cast" || label.startsWith("Cast to ")),
  /* These two need a receiver on the network while the pictures are made. */
  viewMenuShot("cast-network-menu", "Cast to a receiver", (label) => label.startsWith("Cast to ") && label.endsWith("(network)")),
  viewMenuShot("receiver-menu", "Use This PC as a Receiver", (label) => label.startsWith("Use This PC as a Receiver")),
  {
    /** The Cast button over the picture; it is there only while another screen is connected. */
    name: "cast-button",
    group: "cast",
    needs: "blank",
    cursor: '.stage-controls button[aria-label="Cast"]',
    box: (page) => {
      const stage = page.find("main.stage").getBoundingClientRect();
      return { x: stage.right - 420, y: stage.top - 60, width: 440, height: 220 };
    }
  },
  {
    /** The Cast button alone, for a sentence. The buttons show only under the mouse, so the drawn mouse is on the button, with its tip outside the picture. */
    name: "cast-icon",
    group: "cast",
    needs: "blank",
    cursor: '.stage-controls button[aria-label="Cast"]',
    cursorAt: [3, 3],
    target: '.stage-controls button[aria-label="Cast"]',
    margin: 3
  },
  menuShot("vr-menu", "cast", "View", "Enter VR"),

  /* "Save PNG and Export Video": the dialog opens and closes; nothing in it is pressed. */
  menuShot("export-menu-png", "export", "File", "Save PNG"),
  menuShot("export-menu-video", "export", "File", "Export Video…"),
  /**
   * The dialog is taller than the small page, so these shots use the base
   * project and its large page. The base project also has several scenes
   * and songs, so the dialog shows its Scenes row.
   */
  {
    name: "export-dialog",
    group: "dialogs",
    needs: "file",
    setup: openExport,
    target: ".video-dialog",
    margin: 24,
    cleanup: closeExport
  },
  exportShot("export-scenes", "Scenes", "Song"),
  exportShot("export-size", "Size", "Resolution"),
  exportShot("export-quality", "Quality", "Frame rate"),
  exportShot("export-style", "Style", "Fade out"),
  {
    /** The footer of the dialog, with the mouse on Export Video and no click. */
    name: "export-button",
    group: "dialogs",
    needs: "file",
    setup: openExport,
    cursor: ".video-dialog footer .button.primary",
    box: (page) => {
      const dialog = page.find(".video-dialog").getBoundingClientRect();
      const footer = page.find(".video-dialog footer").getBoundingClientRect();
      return { x: dialog.left - 20, y: footer.top - 70, width: dialog.width + 40, height: footer.height + 100 };
    },
    cleanup: closeExport
  },

  /* "Updates and shortcuts" */
  {
    /** The About dialog as it opens; its buttons are not pressed. */
    name: "about-dialog",
    group: "updates",
    needs: "blank",
    setup: async (page) => {
      await page.menuCommand("Help", "About Kaleido Sage");
      await page.waitFor(".about-dialog");
      await page.settle(500);
    },
    target: ".about-dialog",
    margin: 24,
    cleanup: (page) => page.press(".about-dialog .about-dialog-close")
  },
  {
    /** The sheet is taller than the small page, so it uses the large page of the base project. */
    name: "shortcuts-sheet",
    group: "dialogs",
    needs: "file",
    setup: async (page) => {
      await page.menuCommand("Help", "Keyboard Shortcuts");
      await page.waitFor(".shortcuts-dialog");
      await page.settle(300);
    },
    target: ".shortcuts-dialog",
    margin: 24,
    cleanup: (page) => page.press(".shortcuts-dialog .about-dialog-close")
  }
];
