# KaleidoSage repository instructions

Kaleido Sage turns any image into a moving kaleidoscope with motion blur, and
plays it full screen. Tauri 2 + React + WebGL 2.

## Layout

- `src/engine/` holds the picture: `shaders.ts` (GLSL), `renderer.ts` (WebGL
  passes: kaleidoscope into an offscreen texture, then motion blur to the
  canvas), `params.ts` (parameters and drift math), `engine.ts` (clock and
  render loop). Keep it free of React.
- `src/components/` holds the UI. The control panel writes live readouts from
  the frame loop, not through React state.
- `src-tauri/src/files.rs` reads picked image files and saves PNG snapshots to
  `Pictures\Kaleido Sage` (raw request body + `file-name` header).
- `src-tauri/src/updater.rs` checks `rmirabelle/kaleidosage` GitHub releases.
- `prototype.html` is the original single-file prototype. It is a reference only.

## Release memory

- Read `docs/RELEASING.md` before changing installer configuration, preparing a
  release, or publishing.
- Preserve the shared XSage per-user installer contract. Keep
  `src-tauri/installer.nsi`, the bundled `icons/icon.ico` resource, and the
  Windows GUI-subsystem attribute intact.
- Use `set-version.ps1` and `publish.ps1`; do not manually create release tags or
  GitHub releases. A local build is not authorization to publish.

## Development process

- Start the dev app with `npm run tauri dev -- --no-watch` (Vite on port 14510).
  Without `--no-watch`, every Rust edit restarts the app, and the new window
  takes the focus from the user's other apps (a game exits). Restart the dev
  app only when the user agrees.
- Stop it with `.\kill-dev.ps1` (tree-kills `kaleidosage.exe` and frees ports
  14510 and 14511).
- Do not start the dev app while an installed KaleidoSage is running; the
  single-instance plugin would route the launch to it.
