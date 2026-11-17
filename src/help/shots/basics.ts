import type { Shot } from "../shots";
import { PLAY_BUTTON, menuItem, settingRow } from "../shotHelpers";

/**
 * The pictures of the Basics chapters "Getting started" and "Projects and
 * scenes". The "blank" shots share one new project and change it in this
 * order.
 */
export const BASICS: Shot[] = [
  /* The start screen */
  { name: "start-screen", needs: "empty", target: [".start-screen .start-above", ".start-screen h1", ".start-screen .start-below"], margin: 36 },

  /* A new project: one blank scene, no audio. The shots change it in this order. */
  { name: "window-new", needs: "blank", target: ".app", margin: 0 },
  {
    /** The help line with the tip of the play button, and the play controls over it. A text column is 640 wide. */
    name: "help-line",
    needs: "blank",
    setup: (page) => page.point(PLAY_BUTTON),
    box: (page) => {
      const top = page.find(".scene-transport").getBoundingClientRect().top - 24;
      return { x: 0, y: top, width: 640, height: window.innerHeight - top };
    },
    cleanup: (page) => page.unpoint()
  },
  {
    name: "file-menu",
    needs: "blank",
    setup: (page) => page.openMenu("File"),
    target: (page) => [page.find(".menubar-dropdown"), ...page.findAll(".menubar-root > button.active")],
    margin: [20, 60],
    cleanup: (page) => page.closeMenu()
  },
  /* "Make your first scene": one picture for each step, in the order of the steps. Each shot leaves the scene as the next step needs it. */
  {
    /** Step 1: the mouse over slot A, so its four buttons show. */
    name: "first-slot",
    needs: "blank",
    cursor: '[data-image-slot="0"] .source-actions button',
    target: ".source-section",
    margin: 22
  },
  {
    /** Step 2: the Add an effect menu, with the mouse on Kaleidoscope. The cleanup selects it, which adds the effect. */
    name: "first-fx-menu",
    needs: "blank",
    setup: async (page) => {
      page.press(".fx-card .add-effect .panel-button");
      await page.waitFor(".add-effect-menu");
    },
    cursor: (page) => menuItem(page, "Kaleidoscope"),
    cursorAt: [0.7, 0.6],
    target: [".add-effect-menu", ".add-effect-preview", ".fx-card .add-effect .panel-button"],
    margin: 22,
    cleanup: async (page) => {
      menuItem(page, "Kaleidoscope").click();
      await page.settle(800);
    }
  },
  {
    /** Step 3: the new effect's Pan X and Pan Y, which have ranges, and the picture beside them. */
    name: "first-pan",
    needs: "blank",
    setup: async (page) => {
      settingRow(page, "Pan Y").scrollIntoView({ block: "center" });
      await page.settle(300);
    },
    box: (page) => {
      const top = settingRow(page, "Pan X").getBoundingClientRect().top - 26;
      const bottom = settingRow(page, "Pan Y").getBoundingClientRect().bottom + 26;
      return { x: 0, y: top, width: 640, height: bottom - top };
    }
  },
  {
    /** Step 4: the mouse on the range button of Twirl, which the setup turns on. */
    name: "first-range",
    needs: "blank",
    setup: async (page) => {
      const row = settingRow(page, "Twirl");
      row.scrollIntoView({ block: "center" });
      await page.settle(300);
      row.querySelector<HTMLElement>(".panel-drift:not(.on)")?.click();
    },
    cursor: (page) => settingRow(page, "Twirl").querySelector(".panel-drift")!,
    box: (page) => {
      const row = settingRow(page, "Twirl").getBoundingClientRect();
      return { x: 0, y: row.top - 60, width: 640, height: row.height + 120 };
    }
  },
  { name: "fx-random", needs: "blank", target: '.fx-card button[aria-label="Random all"]', margin: 3 },
  {
    /** Step 6: the mouse on the Input list of the play controls. */
    name: "first-input",
    needs: "blank",
    cursor: ".scene-transport .dropdown-button",
    cursorAt: [0.8, 0.6],
    target: ".scene-transport",
    margin: 22
  },
  {
    /** The left part of the title bar and the menu bar, to the end of the names: the project has changes now, so its name has a star. */
    name: "titlebar-file",
    needs: "blank",
    box: (page) => ({ x: 0, y: 0, width: page.find(".titlebar-file").getBoundingClientRect().right + 28, height: 112 })
  },
  {
    /** Three tabs: the first scene and two more, with the top of the picture and the panel beside them. */
    name: "scene-tabs",
    needs: "blank",
    setup: async (page) => {
      page.newScene();
      await page.settle(300);
      page.newScene();
      await page.settle(300);
    },
    target: (page) => page.findAll(".document-tabs .document-tab"),
    margin: [44, 60]
  },

  /* The base project: a show with its playlist and its scenes */
  {
    /** The top of the Scenes list, with the edges of the Playlist and the Scene card beside it; the full list is as tall as the window. */
    name: "scene-list",
    needs: "file",
    box: (page) => {
      const list = page.find(".scene-list").getBoundingClientRect();
      return { x: list.left - 28, y: list.top - 28, width: list.width + 56, height: 470 };
    }
  },
  {
    /** The dialog opens at the folder it showed last; the base project is selected when that folder holds it. */
    name: "open-dialog",
    needs: "file",
    setup: async (page) => {
      await page.menuCommand("File", "Open Project…");
      await page.waitFor(".open-dialog");
      await page.settle(600);
      if (page.findAll(".open-entry").some((entry) => entry.textContent?.includes("Robert Mirabelle"))) {
        page.pressText(".open-entry", "Robert Mirabelle");
        await page.settle(1200);
      }
    },
    target: ".open-dialog",
    margin: 28,
    cleanup: (page) => page.press(".open-dialog-close")
  }
];
