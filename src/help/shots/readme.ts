import type { Page } from "../capture";
import type { Shot } from "../shots";

/**
 * Pictures for README.md, the public page of the app. Their names start
 * with "readme-", so a usual run does not make them and the app does not
 * ship them: ask for them by name or by group (`tools/help-capture.sh
 * readme-scenes`), then move them from public/help to docs/readme (see
 * tools/readme-pictures.py).
 */

/** The number of scenes of the base project that get a picture. */
const SCENE_COUNT = 58;

/** The rows of the Scenes list. */
const sceneRows = (page: Page) => page.findAll('.scene-list [role="listbox"] [role="option"]');

/**
 * Shows one scene of the base project and lets it move with no music: a
 * press on its row selects it, and Scene Hold gives it its own clock (the
 * music gate holds a scene still while the music is stopped).
 */
const showScene = async (page: Page, index: number) => {
  const row = sceneRows(page)[index];
  if (!row) throw new Error(`The project has no scene ${index + 1}`);
  row.scrollIntoView({ block: "center" });
  row.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
  await page.settle(700);
  const hold = page.find(".scene-transport .hold-toggle");
  if (hold.getAttribute("aria-pressed") !== "true") hold.click();
  /** Trails, particles and light lines need some seconds to fill the picture. */
  await page.settle(5000);
};

/** One picture of each scene: the picture area alone. */
const scenePictures: Shot[] = Array.from({ length: SCENE_COUNT }, (_, index) => ({
  name: `readme-scene-${String(index + 1).padStart(2, "0")}`,
  needs: "file" as const,
  group: "readme-scenes",
  setup: (page: Page) => showScene(page, index),
  target: ".stage canvas",
  margin: 0
}));

/**
 * The whole window with a show open and a vivid scene in motion, at a page
 * size that stays readable when the README shows it about 900 pixels wide.
 */
const windowPicture: Shot = {
  name: "readme-window",
  needs: "file",
  group: "readme-window",
  page: { width: 1600, height: 900 },
  setup: async (page: Page) => {
    await showScene(page, 6);
    /** Scene Hold goes off again: the picture stays as it is, and the window shows its usual state. */
    const hold = page.find(".scene-transport .hold-toggle");
    if (hold.getAttribute("aria-pressed") === "true") hold.click();
    await page.settle(400);
  },
  target: ".app",
  margin: 0
};

export const README: Shot[] = [...scenePictures, windowPicture];
