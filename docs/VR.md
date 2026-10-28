# Live VR

View → Enter VR (or the headset button over the picture) shows the picture
all around the viewer in a VR headset, live: sliders, MIDI and sound keep
working. Esc, Exit VR or the headset's own menu ends it.

## Quest setup

1. Install the Meta Quest Link app on the PC and sign in.
2. In it, Settings → General: set Meta Quest Link as the active OpenXR runtime.
3. Connect the headset (USB 3 cable, or Air Link on Wi-Fi), and in the
   headset open Quick Settings → Quest Link → Launch.
4. The VR button and menu item turn on when the headset is ready.

## How it works

- `src/engine/vr.ts` starts the WebXR session and works out where each eye
  looks. The headset's session times the frames while VR runs.
- The engine draws the flat picture square (`VR_SIZE`, 2048 pixels) on its
  canvas; the screen shows it letterboxed.
- `KaleidoRenderer.drawVr` copies the new picture and draws each eye with
  `VR_SHADER`. It uses the same wrap as the 360 video (`sphereUv` in
  `shaders.ts`): the center straight ahead, a mirror image behind, the two
  halves meeting in a ring at the viewer's sides.
- Both eyes see the same picture, very far away, so it has no depth.

## The web view setting

WebView2 has the WebXR API, but it finds no headset unless WebXR and OpenXR
are turned on. `tauri.conf.json` sets this for both windows (they share one
web engine, so their settings must match):

`--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --enable-features=WebXR,OpenXR`

The first part is Tauri's default, which a custom setting replaces, so it is
kept.
