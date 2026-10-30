# Cast: the picture on another screen

Written 2026-10-29. Cast shows the picture full screen on another screen,
in a second window, the Show window, while the main window stays free:
the user can resize, use or minimize it, and the show plays on. The usual
other screen is a virtual screen (Virtual Display Driver) that Sunshine
streams to a projector in another room (the CastSage project).

## How it works

- `src/lib/cast.ts` opens the Show window with
  `window.open("about:blank", "kaleidosage-show")`. Rust makes it
  (`on_new_window` on the main window, see `src-tauri/src/lib.rs` and
  `cast.rs`), so the main window is built in code from its entry in
  `tauri.conf.json`, which has `"create": false`. The Show window shares
  the page's scripts, so no state is copied between windows.
- The engine draws in the main window's canvas, as always, but at the Show
  screen's size (`KaleidoRenderer.castSize`), and the Show window times
  the frames (`Engine.castTo`). A minimized window gets no animation
  frames, so the show must not depend on the main window. After each frame
  that draws, `cast.ts` copies the canvas into the Show window's 2D canvas
  (`drawImage`, at once, while the WebGL canvas still holds the frame).
- The main window's canvas is the preview (`.stage.casting canvas`, with
  `object-fit: contain`). It pauses while the window is minimized; the
  show does not.
- Effects that work in pixels keep their look (`texelScale`), as in VR.
- Cast and VR do not run together.
- The screen list comes from Rust (`cast_screens`), with the monitors' own
  names. The pick is kept by name and size (localStorage `kaleidosage.cast`);
  with none, Cast goes to the first screen that the main window is not on.
  Rust puts the window on the screen and makes it full screen
  (`cast_place`), without taking the focus from the main window.
- The Show window closes with the main window (Rust), and with a page
  reload (`pagehide`).

## Controls

- `C`, the View menu (one item per other screen when there are several),
  and the Cast button over the picture.
