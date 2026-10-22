# KaleidoSage release playbook

This is the durable source of truth for building, testing, and publishing KaleidoSage.
Do not publish directly from memory or bypass `publish.ps1`.

## Windows installer contract

KaleidoSage follows the shared XSage installer protocol used by Image Sage, DB Sage
and the other XSage desktop applications:

- Installation is **per-user** (`currentUser`), under the user's local application
  data. Do not change it to `perMachine` or Program Files without an explicit new
  product decision and a full installer migration plan.
- `src-tauri/installer.nsi` is the shared custom XSage NSIS template, copied from
  IconSage (`D:/Code/IconSage/src-tauri/installer.nsi`) with one change, the same
  as Image Sage's and DB Sage's: in passive mode (`/P`), `PageLeaveReinstall`
  takes the first choice (uninstall the old version, keep app data) without
  showing the page. KaleidoSage adds a second change of its own: the product
  name was "KaleidoSage" up to 0.10.0 and is "Kaleido Sage" now, so the
  install section first silently uninstalls an install found under the old
  uninstall key (app data is kept).
- `src-tauri/icons/icon.ico` must be both the bundle icon and a bundled resource.
- The installer copies the icon to `C:\Users\Public\${PRODUCTNAME}\icon.ico`, then
  assigns that explicit path and the AppUserModelId to Start Menu and optional
  desktop shortcuts. Explorer does not reliably expand an environment-variable
  icon path in shortcut metadata.
- Release builds use the Windows GUI PE subsystem. The release executable must
  never open a console window.
- In-app updates exit KaleidoSage, then run setup with `/P /R`: no setup pages,
  and the app starts again when the install finishes.
- No key or token is embedded in the binary. Random images come from the
  Wikimedia Commons Picture of the Day, which needs no key.

`publish.ps1` validates these rules before it creates a tag and validates the
generated executable and NSIS script again after the release build.

## Release workflow

1. Stop the Tauri dev process (`.\kill-dev.ps1`). The single-instance plugin
   routes a second launch to whichever KaleidoSage is already running.
   `kill-dev.ps1` closes the window the gentle way, so unsaved changes get
   their "Save changes?" question, and it waits for the answer. Never use
   `-Force` (it loses unsaved changes) unless the user says so.
   `publish.ps1` runs this close again before it builds.
2. Synchronize the intended semantic version:

   ```powershell
   .\set-version.ps1 0.2.0
   ```

3. Run the tests (`npm test`, and `cargo test` in `src-tauri`).
4. Commit the source changes. Publishing requires a clean work tree and the
   public `rmirabelle/kaleidosage` origin.
5. Confirm GitHub CLI authentication, then publish:

   ```powershell
   gh auth status
   .\publish.ps1
   ```

   The script builds the installer and checks it automatically. It also pushes
   the commit and the version tag, so when the user says "publish", that
   includes the push.
6. Confirm the printed release URL.

If the user asks for a manual installer check, install the NSIS bundle from
`src-tauri\target\release\bundle\nsis` with a **GUI** install (not `/S`) and
check the window and the shortcuts' icon.

The script creates and verifies the new public release first, then deletes every
older release and its tag. If verification fails before cleanup, older releases
are intentionally preserved.

## Windows PowerShell 5.1 note

`set-version.ps1` and `publish.ps1` run under Windows PowerShell 5.1 with
`$ErrorActionPreference = "Stop"`. In 5.1, a native command's stderr output
becomes a `NativeCommandError` record whenever stderr is redirected or the host
is not a plain console. Under `Stop`, the first such line aborts the script even
though the command succeeded.

Both scripts therefore call every native command (`git`, `gh`, `npm`, `cargo`)
through the `Invoke-Native` helper, which temporarily sets the preference to
`Continue` and fails on the exit code instead. Keep that pattern when adding new
native calls; never call a native command directly in these scripts.
