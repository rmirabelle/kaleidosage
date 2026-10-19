import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";

/** The splash stays up at least this long, so a fast start does not flash it. */
const MIN_SPLASH_MS = 3000;

let revealed = false;

/**
 * Shows the main window and closes the splash window. The main window starts
 * hidden (tauri.conf.json) and loads behind the splash. Runs only once; later
 * calls do nothing. If this never runs, the Rust side shows the main window
 * after a time limit (see lib.rs).
 */
export async function revealMainWindow() {
  if (revealed || !isTauri()) return;
  revealed = true;
  const main = getCurrentWindow();
  /**
   * A page reload (in dev, after an engine or MIDI edit) finds the window
   * already shown. It must not take the focus from another app, such as a
   * game the user is playing.
   */
  if (await main.isVisible()) {
    await (await Window.getByLabel("splash"))?.close();
    return;
  }
  /* performance.now() counts from page start, which is about when the splash opened. */
  const remaining = MIN_SPLASH_MS - performance.now();
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  /* Let the first frame paint, but do not wait long: a hidden window can hold back animation frames. */
  await Promise.race([
    new Promise((resolve) => requestAnimationFrame(resolve)),
    new Promise((resolve) => setTimeout(resolve, 100))
  ]);
  await main.show();
  await main.setFocus();
  const splash = await Window.getByLabel("splash");
  await splash?.close();
}
