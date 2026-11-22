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

## Network cast (started 2026-11-22, in work)

The goal: the picture and the sound go to a screen in another room with no
other program (no Sunshine, Moonlight or virtual screen) and no setup.
Kaleido Sage is both ends: the sender, and, started with `--receiver`,
the receiver (one installer, one version).

- Sender, page: `src/lib/castStream.ts`. `Engine.streamTo` draws at the
  receiver's size (at most 1080 pixels of height for now) with the clock
  of `src/engine/frameTicker.ts`: a worker's timer at the stream's 60
  frames a second. It does not need the window on the screen, so the cast
  goes on while the main window is minimized or behind other windows.
  Each frame that draws is read from the GPU into memory shared with the
  app (as a video export does); up to 3 frames are on their way at a time.
- Sender, Rust: `src-tauri/src/cast_stream.rs`. FFmpeg encodes the frames
  to AV1 with the NVIDIA encoder at its lowest delay (`av1_nvenc`, `-tune
  ull`, constant 30 Mbit/s) and writes IVF, which gives one frame at a
  time. Each frame goes to the receiver over one TCP connection (port
  14530). The file's first comment has the message layout.
- Receiver, Rust: `src-tauri/src/receiver.rs`. One full-screen window. It
  takes one sender at a time and passes the messages to its page through
  a WebSocket on the PC itself.
- Receiver, page: `src/lib/receiver.ts`, `src/components/ReceiverView.tsx`.
  The web view's decoder (the graphics chip) decodes the frames. Each frame
  shows a fixed delay after the sender took it; the delay follows the
  network (see the file's first comment).

Measured 2026-11-22, RTX 5090 to a MINIX N300 mini PC over Wi-Fi, a busy
scene at 1080p: 60 frames a second sent with none skipped, about 8 ms from
the draw to the encoder, 60 to 77 ms from the picture in the app to the
receiver's screen, no lost frames. About every 5 to 10 seconds one frame
takes 150 ms (Wi-Fi), which shows as a short stutter.

Findings that decided the design:

- The web view's own video encoder (WebCodecs) did not use the NVIDIA card
  on the test PC: 18 to 30 frames a second with a busy scene. FFmpeg with
  NVENC does.
- A page behind other windows gets no animation frames, and its timers
  slow down; a worker's timer keeps its rate.
- Tauri's channel to the page makes one more call for each large message:
  about 40 ms more trip time on the mini PC, with an uneven rhythm. A
  local WebSocket does not.
- Windows Firewall on the receiver PC asks one time to allow Kaleido Sage,
  and blocks the receiver until the user allows it.

### Sound (2026-11-22)

The stream carries the app's own music (the tracks), not the PC's other
sounds (the user's decision). `TrackList.castTap` gives each block of the
music in stereo and closes the music's way to this PC's speakers, so only
the receiver plays it. The blocks are not compressed (16 bits, about
1.5 Mbit/s), four blocks (43 ms) in each call to the app: one call for
each block made the frames wait.

- The time stamp of a block is the moment it is heard on the sender, not
  the moment it is processed: `songClock.ts` draws each picture for the
  heard moment, which is later by the speakers' delay
  (`TrackList.latency`). So the stream has the same relation of picture
  and sound as the sender's own screen and speakers.
- The receiver plays the music with a worklet (`SOUND_SOURCE` in
  `receiver.ts`) at the same delay as the picture, corrected for the
  sound output delay that the web view reports (about 40 ms on the mini
  PC). The worklet plays up to 0.3 % faster or slower to hold the time.
- While music comes, the delay covers the slowest frame or block of the
  last 5 seconds, not 19 of 20, and comes down at 2.5 ms a second: a late
  block of music is a gap that the ear hears.
- A screen or speakers can add a delay of their own that no PC can
  measure. `StreamCast.soundOffsetMs` moves the sound (negative is
  earlier). The JMGO projector with its own speakers through HDMI needed
  -135 ms, found by ear. Earlier sound has a longer trip, so the picture's
  delay grows by the same time.

Measured with music: about 280 ms from the picture in the app to the
projector (180 ms of it for the Wi-Fi's slow moments of up to 300 ms and
for the sound offset), no gaps in the music.

Not done yet: a receiver that is found by itself and shows in the Cast
menu; the "Use this PC as a receiver" choice with a start with Windows; a
"Sound timing" setting for each receiver in place of the fixed offset;
H.264 or HEVC for graphics cards with no AV1 encoder, and the processor's
encoder for PCs with no NVIDIA card; a stream quality setting; a transport
that hides the Wi-Fi's slow moments (the delay could then be much
shorter). Until the Cast menu has it, `src/dev/castProbe.ts` starts and
stops the network cast in the dev app, and has the sound offset.
