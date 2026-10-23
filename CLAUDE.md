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

- The dev app must run outside Claude's process tree. Everything Claude starts
  directly (a tool call, a Claude Terminal panel tab) stops when Claude quits,
  and the Claude desktop app restarts itself without asking to install
  updates, so the user's dev app (and its unsaved work) goes down with it.
  Start it only with `start-dev.vbs`, opened through Explorer:
  `Start-Process "$env:WINDIR\explorer.exe" '"D:\Code\KaleidoSage\start-dev.vbs"'`.
  Explorer, not Claude, then owns it. It runs `npm run tauri dev --
  --no-watch` (Vite on port 14510) with no console window, and writes its
  output to `dev.log` in the project folder: read that file for build errors
  and for `[client] hot update applied: <file>`. The user can also
  double-click `start-dev.vbs`. Start or restart the dev app only when the
  user asks or agrees.
- Without `--no-watch`, every Rust edit restarts the app, and the new window
  takes the focus from the user's other apps (a game exits).
- Stop it with `.\kill-dev.ps1`. It first closes the window the gentle way,
  so unsaved changes get the "Save changes?" question, and waits up to 5
  minutes for the user. Exit code 1 means the app is still open: tell the
  user, and never use `-Force` (it loses unsaved work) without their go-ahead.
  Then it tree-kills what is left of `kaleidosage.exe` and frees ports
  14510 and 14511.
- Do not start the dev app while an installed KaleidoSage is running; the
  single-instance plugin would route the launch to it.
