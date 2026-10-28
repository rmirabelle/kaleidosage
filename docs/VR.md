# Live VR

View → Enter VR (or the headset button over the picture) shows the picture
live on a large virtual screen in a dark room, in a VR headset. Sliders,
MIDI and sound keep working. Esc, Exit VR or the headset's own menu ends it.

While VR runs, the VR screen card (bottom left of the picture) sets the
screen's Shape (16:9, 21:9, 4:3, 1:1), its Width and Distance in meters,
and its Curve (0% flat, 100% part of a circle around you). The shape is
the setting's, not the desktop picture's. The app keeps the last settings.

In the headset, the controllers do the same:

- Right stick forward or back: the screen moves away or near.
- Right stick right or left: the screen gets wider or narrower.
- Left stick forward or back: more or less curve.
- A: the next shape. B: reset (16:9, 4 m wide, 3 m away, flat).
- Hold the Meta button to bring the screen in front of you again.

The 360° size in Export Video still makes a video that wraps the picture
all around the viewer; live VR uses the screen, as a full wrap made the
subject too large.

## Quest setup

1. Install the Meta Quest Link app on the PC and sign in.
2. In it, Settings → General: set Meta Quest Link as the active OpenXR runtime.
3. Connect the headset (USB 3 cable, or Air Link on Wi-Fi), and in the
   headset open Quick Settings → Quest Link → Launch.
4. Click Enter VR. With no headset ready, the app says how to start Link.
   The app asks for a headset only on that click: each question connects
   the web view to the headset's software, which then shows the app as
   loading in the headset. The VR button over the picture shows once VR
   has worked on this PC.

## How it works

- `src/engine/vr.ts` starts the WebXR session, holds the screen settings
  (`VrScreen`), and works out each eye's matrix. The headset's session
  times the frames while VR runs.
- The engine draws the flat picture `VR_HEIGHT` (1440) pixels tall, in the
  screen's shape; the PC screen shows it letterboxed. Each headset frame,
  `moveVrScreen` applies the controllers first.
- `KaleidoRenderer.drawVr` copies each new picture (with mipmaps, so a far
  screen does not shimmer) and draws each eye with `VR_SHADER`, which
  follows each pixel's ray from the eye to the flat or curved screen.
- Both eyes see the screen from their own place, so it has real distance;
  the picture on it is flat.

## The web view setting

WebView2 has the WebXR API, but it finds no headset unless WebXR and OpenXR
are turned on. `tauri.conf.json` sets this for both windows (they share one
web engine, so their settings must match):

`--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --enable-features=WebXR,OpenXR`

The first part is Tauri's default, which a custom setting replaces, so it is
kept.
