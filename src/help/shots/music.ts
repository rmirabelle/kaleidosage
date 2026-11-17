import type { Page } from "../capture";
import type { Shot } from "../shots";
import { addEffect, settingRow } from "../shotHelpers";
import { tracks } from "../../lib/tracks";

/**
 * The pictures of the Music chapters: "Audio input and audio links", "The
 * Playlist and the Scenes list" and "Song follow and the Song Map".
 *
 * No shot plays music. A click on a Song Map slice selects it and plays the
 * song from there, so `selectSlice` turns the play off for that one click.
 * No shot picks an Input or an Output either: those lists only open.
 */

/** A box of the window, in CSS pixels. */
const rect = (page: Page, selector: string) => page.find(selector).getBoundingClientRect();

/** One entry of the open Input or Output list, by the start of its text. */
const listOption = (page: Page, start: string): HTMLElement => {
  const option = page.findAll(".dropdown-list .toolbar-dropdown-item").find((item) => item.textContent?.trim().startsWith(start));
  if (!option) throw new Error(`The open list has no entry that starts with ${start}`);
  return option;
};

/** Opens the Input or the Output list of the play controls. */
const openList = async (page: Page, label: "Input" | "Output") => {
  page.press(`.dropdown-button[aria-label="${label}"]`);
  await page.waitFor(".dropdown-list");
};

/** The audio link button (the speaker) of one setting. */
const linkButton = (page: Page, name: string): HTMLElement => {
  const button = settingRow(page, name).querySelector<HTMLElement>(".audio-link");
  if (!button) throw new Error(`${name} has no audio link button`);
  return button;
};

/** The rows of the Scenes list that show. */
const sceneRows = (page: Page) => page.findAll(".scene-list .scene-list-item");

/** The slices of the Song Map, from the start of the song. */
const slices = (page: Page) => page.findAll(".song-map-slice");

/**
 * Selects a slice of the Song Map with no sound: the click that selects a
 * slice also plays the song from its start, so the play is off for the click.
 */
const selectSlice = (page: Page, index: number) => {
  const slice = slices(page)[index];
  if (!slice) throw new Error(`The Song Map has no slice ${index + 1}`);
  const playAt = tracks.playAt;
  tracks.playAt = () => {};
  try {
    slice.click();
  } finally {
    tracks.playAt = playAt;
  }
};

/** One button of the Song Map toolbar, by its text. */
const mapButton = (page: Page, text: string): HTMLElement => {
  const button = page.findAll(".song-map-toolbar .panel-button").find((item) => item.textContent?.trim() === text);
  if (!button) throw new Error(`The Song Map toolbar has no ${text} button`);
  return button;
};

/** The left part of the Song Map: its title, its toolbar and its first slices. A text column is 640 wide, so this shows a little smaller. */
const mapLeft = (page: Page, width = 800) => {
  const dock = rect(page, ".song-map-dock");
  return { x: dock.left - 12, y: dock.top - 12, width, height: dock.height + 24 };
};

/** The toolbar of the Song Map and its first slices, at full size: for a picture about one toolbar button. */
const mapTools = (page: Page) => {
  const top = rect(page, ".song-map-toolbar").top - 14;
  return { x: rect(page, ".song-map-dock").left + 4, y: top, width: 700, height: rect(page, ".song-map-strip").bottom + 14 - top };
};

/** The first slices of the Song Map alone, at full size. */
const mapStrip = (page: Page) => {
  const strip = rect(page, ".song-map-strip");
  return { x: rect(page, ".song-map-dock").left + 4, y: strip.top - 18, width: 660, height: strip.height + 36 };
};

/** The slice that the song-map shots select and change: the third one. */
const SLICE = 2;
/** The scene that the song-map shots put on that slice: the fifth row of the Scenes list. */
const PICKED_SCENE = 4;

export const MUSIC: Shot[] = [
  /* "Audio input and audio links": a new project, where the Input is Nothing. */
  {
    /** The Input list, open, with the mouse on the PC's default output. Nothing is picked. */
    name: "audio-input-menu",
    needs: "blank",
    group: "audio",
    setup: (page) => openList(page, "Input"),
    cursor: (page) => listOption(page, "Default output"),
    cursorAt: [0.75, 0.6],
    target: [".dropdown-list", ".scene-input-row"],
    margin: 24,
    cleanup: (page) => page.unpoint()
  },
  {
    /** The FX card's speaker button, turned on: each setting of the open effect then has its own speaker. */
    name: "audio-show-buttons",
    needs: "blank",
    group: "audio",
    setup: async (page) => {
      await addEffect(page, "Kaleidoscope");
      const toggle = page.find(".fx-card .panel-title-audio");
      if (toggle.getAttribute("aria-pressed") !== "true") toggle.click();
      await page.settle(400);
    },
    cursor: ".fx-card .panel-title-audio",
    box: (page) => ({ x: 0, y: rect(page, ".fx-card").top - 16, width: 640, height: 300 })
  },
  { name: "audio-link-icon", needs: "blank", group: "audio", target: (page) => [linkButton(page, "Tile size")], margin: 3 },
  {
    /** The speaker of Pan X, turned on. Pan X has a range, so the picture shows where the sound pushes the value. */
    name: "audio-link-on",
    needs: "blank",
    group: "audio",
    setup: async (page) => {
      settingRow(page, "Pan Y").scrollIntoView({ block: "center" });
      await page.settle(300);
      const button = linkButton(page, "Pan X");
      if (!button.classList.contains("on")) button.click();
    },
    cursor: (page) => linkButton(page, "Pan X"),
    box: (page) => {
      const top = settingRow(page, "Pan X").getBoundingClientRect().top - 44;
      const bottom = settingRow(page, "Pan Y").getBoundingClientRect().bottom + 30;
      return { x: 0, y: top, width: 640, height: bottom - top };
    }
  },
  { name: "audio-link-lit", needs: "blank", group: "audio", target: (page) => [linkButton(page, "Pan X")], margin: 3 },

  /* The Audio panel, with the base project: Files is the Input, and its first scene has audio links. */
  {
    name: "audio-panel",
    needs: "file",
    group: "audio-file",
    setup: async (page) => {
      await page.menuCommand("View", "Show Audio Panel");
      await page.waitFor(".midi-panel.open");
      await page.settle(500);
    },
    box: (page) => {
      const panel = rect(page, ".midi-panel.open");
      return { x: 0, y: panel.top - 12, width: 960, height: window.innerHeight - panel.top + 12 };
    },
    cleanup: (page) => page.menuCommand("View", "Hide Audio Panel")
  },

  /* "The Playlist and the Scenes list": the base project, a show with 20 songs and 58 scenes. */
  { name: "playlist-window", needs: "file", group: "playlist", target: ".app", margin: 0 },
  {
    /** The top of the Playlist card: its title bar and its first files, with the edge of the Scenes list. */
    name: "playlist-card",
    needs: "file",
    group: "playlist",
    box: (page) => {
      const column = rect(page, ".files-column");
      return { x: 0, y: column.top - 14, width: column.right + 40, height: 400 };
    }
  },
  { name: "playlist-add", needs: "file", group: "playlist", target: ".files-card-buttons .button", margin: 3 },
  {
    /** The foot of the Playlist card and the music controls under it. */
    name: "playlist-controls",
    needs: "file",
    group: "playlist",
    box: (page) => {
      const column = rect(page, ".files-column");
      const top = rect(page, ".files-card-foot").top - 70;
      return { x: 0, y: top, width: column.right + 40, height: rect(page, ".playlist-transport").bottom + 22 - top };
    }
  },
  { name: "playlist-play", needs: "file", group: "playlist", target: '.playlist-transport [aria-label="Play the music"]', margin: 3 },
  { name: "playlist-stop", needs: "file", group: "playlist", target: '.playlist-transport [aria-label="Stop the music"]', margin: 3 },
  {
    /** The Output list, open, with the mouse on its first entry. Nothing is picked. */
    name: "playlist-output-menu",
    needs: "file",
    group: "playlist",
    setup: (page) => openList(page, "Output"),
    cursor: (page) => listOption(page, "Default output"),
    cursorAt: [0.75, 0.6],
    target: [".dropdown-list", '.dropdown-button[aria-label="Output"]'],
    margin: [26, 70],
    cleanup: (page) => page.unpoint()
  },
  {
    /** The Playlist as a narrow strip, with the Scenes list beside it. The cleanup shows the Playlist again. */
    name: "playlist-collapsed",
    needs: "file",
    group: "playlist",
    setup: async (page) => {
      page.press(".files-collapse");
      await page.waitFor(".files-collapsed");
    },
    cursor: ".files-collapsed",
    cursorAt: [0.5, 0.08],
    box: (page) => {
      const strip = rect(page, ".files-collapsed");
      return { x: 0, y: strip.top - 14, width: strip.right + 330, height: 300 };
    },
    cleanup: async (page) => {
      page.press(".files-collapsed");
      await page.waitFor(".files-card");
    }
  },
  {
    /** The mouse on the use count of a scene, and the list of the songs that use the scene. */
    name: "scene-use-pop",
    needs: "file",
    group: "playlist",
    cursor: (page) => {
      const badge = sceneRows(page)[2]?.querySelector(".scene-use-badge:not(.unused)");
      if (!badge) throw new Error("The third scene has no use count");
      return badge;
    },
    target: (page) => [page.find(".scene-use-pop"), ...sceneRows(page).slice(0, 5)],
    margin: [30, 26]
  },
  {
    /** The menu of a scene, from a right-click on its row. */
    name: "scene-row-menu",
    needs: "file",
    group: "playlist",
    setup: async (page) => {
      const row = sceneRows(page)[3];
      const box = row.getBoundingClientRect();
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: box.left + 90, clientY: box.top + box.height / 2, button: 2 }));
      await page.waitFor(".context-menu");
    },
    target: (page) => [page.find(".context-menu"), ...sceneRows(page).slice(1, 6)],
    margin: [26, 26],
    cleanup: (page) => page.dismiss()
  },
  {
    /** The Sort menu of the Scenes list, with the mouse on the use count order. Nothing is picked. */
    name: "scene-sort-menu",
    needs: "file",
    group: "playlist",
    setup: async (page) => {
      page.press(".scene-sort-button");
      await page.waitFor(".context-menu");
    },
    cursor: (page) => {
      const item = page.findAll(".context-menu .toolbar-dropdown-item").find((entry) => entry.textContent?.includes("Usage count"));
      if (!item) throw new Error("The Sort menu has no usage count order");
      return item;
    },
    cursorAt: [0.8, 0.6],
    target: [".context-menu", ".scene-sort-button"],
    margin: [30, 150],
    cleanup: (page) => page.dismiss()
  },
  {
    /**
     * The scene's play controls as they are with Song follow off: the time to
     * the next scene, Scene Hold, and the play buttons. The setup turns Song
     * follow off; the project closes with no save after the group.
     */
    name: "scene-controls-auto",
    needs: "file",
    group: "playlist",
    setup: async (page) => {
      const follow = page.find('[aria-label="Song follow"]');
      if (follow.getAttribute("aria-pressed") === "true") follow.click();
      await page.waitFor(".scene-transport .hold-toggle:not(.wide)");
      await page.settle(300);
    },
    target: ".control-panel .scene-transport",
    margin: [44, 24]
  },
  {
    /** The level of the music in the music controls, with the line of the Master Threshold; the line shows only with Song follow off. */
    name: "playlist-threshold",
    needs: "file",
    group: "playlist",
    cursor: '.playlist-level[aria-label="Master Threshold"]',
    cursorAt: [0.76, 0.75],
    target: '.playlist-level[aria-label="Master Threshold"]',
    margin: [70, 60]
  },

  /* "Song follow and the Song Map": the base project again; its songs have their analyses. */
  {
    /** The music controls, with the mouse on the Song follow button, which is on. */
    name: "song-follow-button",
    needs: "file",
    group: "song-map",
    cursor: '[aria-label="Song follow"]',
    box: (page) => {
      const column = rect(page, ".files-column");
      const top = rect(page, ".playlist-transport-row").top - 60;
      return { x: 0, y: top, width: column.right + 40, height: rect(page, ".playlist-transport").bottom + 16 - top };
    }
  },
  { name: "song-follow-icon", needs: "file", group: "song-map", target: '[aria-label="Song follow"]', margin: 3 },
  {
    /** A selected slice: its outline, and the slice tools that now work. The setup selects it with no sound. */
    name: "song-map-slice",
    needs: "file",
    group: "song-map",
    setup: (page) => selectSlice(page, SLICE),
    cursor: (page) => slices(page)[SLICE],
    box: (page) => mapLeft(page)
  },
  {
    /** The Mood buttons, with the mouse on Peak, which the setup selects for the slice. */
    name: "song-map-mood",
    needs: "file",
    group: "song-map",
    setup: (page) => mapButton(page, "Peak").click(),
    cursor: (page) => mapButton(page, "Peak"),
    box: (page) => mapTools(page)
  },
  {
    /** The Hit button, on: the slice shows the red mark of a hit. */
    name: "song-map-hit",
    needs: "file",
    group: "song-map",
    setup: (page) => {
      const hit = mapButton(page, "Hit");
      if (!hit.classList.contains("active")) hit.click();
    },
    cursor: (page) => mapButton(page, "Hit"),
    box: (page) => mapTools(page)
  },
  { name: "song-map-hit-mark", needs: "file", group: "song-map", target: (page) => [slices(page)[SLICE].querySelector(".song-map-drop-tag")!], margin: 3 },
  {
    /** Ctrl held, with the mouse on a scene of the Scenes list: a click puts that scene on the selected slice. The cleanup does that click. */
    name: "song-map-pick",
    needs: "file",
    group: "song-map",
    setup: async (page) => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", ctrlKey: true, bubbles: true }));
      await page.settle(200);
    },
    cursor: (page) => sceneRows(page)[PICKED_SCENE],
    cursorAt: [0.45, 0.6],
    box: (page) => {
      const list = rect(page, ".scene-list");
      return { x: list.left - 28, y: list.top - 14, width: list.width + 56, height: 330 };
    },
    cleanup: async (page) => {
      sceneRows(page)[PICKED_SCENE].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Control", ctrlKey: false, bubbles: true }));
      await page.settle(400);
    }
  },
  {
    /** The slice with the name of its scene, after the pick. */
    name: "song-map-picked",
    needs: "file",
    group: "song-map",
    box: (page) => mapStrip(page)
  },
  {
    /** The mouse on the divider at the end of the selected slice. */
    name: "song-map-divider",
    needs: "file",
    group: "song-map",
    cursor: (page) => page.findAll(".song-map-divider")[SLICE],
    cursorAt: [0.5, 0.4],
    box: (page) => mapStrip(page)
  },
  { name: "song-map-fill", needs: "file", group: "song-map", target: ".song-map-fill", margin: 3 },
  { name: "song-map-reset", needs: "file", group: "song-map", target: ".song-map-reset", margin: 3 },
  {
    /** Scene Hold as it is with Song follow on: one wide button in place of the scene's play controls. */
    name: "scene-hold-bar",
    needs: "file",
    group: "song-map",
    cursor: ".scene-hold-bar .hold-toggle",
    cursorAt: [0.7, 0.6],
    target: ".scene-hold-bar",
    margin: [70, 24]
  }
];
