import type { Page } from "./capture";

/**
 * Tools that the shot lists in src/help/shots/ share: they find parts of the
 * window by what the user sees there.
 */

/** The row of one setting in an open effect, by the name it shows. */
export const settingRow = (page: Page, name: string): HTMLElement => {
  const row = page.findAll(".panel-row").find((item) => item.querySelector(".panel-row-name")?.textContent?.trim().toLowerCase() === name.toLowerCase());
  if (!row) throw new Error(`No setting ${name} shows`);
  return row;
};

/** One effect in the open Add an effect menu, by its name. */
export const menuItem = (page: Page, name: string): HTMLElement => {
  const item = page.findAll(".add-effect-menu .toolbar-dropdown-item").find((entry) => entry.textContent?.trim().startsWith(name));
  if (!item) throw new Error(`The Add an effect menu has no ${name}`);
  return item;
};

/** The play or pause button of the scene's play controls. */
export const PLAY_BUTTON = '.scene-transport button[aria-label="Pause"], .scene-transport button[aria-label="Play"]';

/** One effect group of the FX list, by the title it shows ("Kaleidoscope"). */
export const effectGroup = (page: Page, title: string): HTMLElement => {
  const group = page.findAll(".fx-card .panel-group").find((item) => item.querySelector(".panel-group-title")?.textContent?.trim().toLowerCase().startsWith(title.toLowerCase()));
  if (!group) throw new Error(`The FX list has no ${title}`);
  return group;
};

/** Adds an effect with the Add an effect menu, as the user does; the new effect opens. */
export const addEffect = async (page: Page, name: string) => {
  page.press(".fx-card .add-effect .panel-button");
  await page.waitFor(".add-effect-menu");
  menuItem(page, name).click();
  await page.settle(700);
};

/** Sets a text field as typing does. */
export const typeText = (input: HTMLInputElement, text: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
