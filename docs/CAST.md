# Cast: the picture on another screen

Written 2026-10-29. Cast shows the picture full screen on another screen,
in a second window, the Show window, while the main window stays free:
the user can resize, use or minimize it, and the show plays on. At first,
the usual other screen was a virtual screen (Virtual Display Driver) that
Sunshine streamed to a projector in another room (the CastSage project).
Since 2026-11-22 the app sends the picture and the music to another PC
itself: see "Network cast" below.

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

- `C`, the View menu (one item for each other screen and each network
  receiver when there are several), and the Cast button over the picture.
  With no pick, Cast goes where the last cast went: to the remembered
  receiver, else to a screen, else to the first receiver.
- View > Use This PC as a Receiver makes the PC a network receiver (see
  below).

## Network cast (2026-11-22)

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
  to H.264 at its lowest delay, constant 30 Mbit/s, with the first encoder
  of `ENCODERS` that works on the PC: NVIDIA (`h264_nvenc`), AMD
  (`h264_amf`), Intel (`h264_qsv`), then the processor (`libx264`,
  ultrafast). It writes FLV, which gives one frame at a time with its
  length. Each frame goes to the receiver over one TCP connection (port
  14530). The file's first comment has the message layout. (Until
  2026-11-22 the stream was AV1 with `av1_nvenc`, which only RTX 40 cards
  and later have; the user rejected that limit.)
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
  and sound as the sender's own screen and speakers. The heard moment
  comes from the sound system's own clock (`getOutputTimestamp`).
- The receiver plays the music with a worklet (`SOUND_SOURCE` in
  `receiver.ts`) at the same delay as the picture, corrected for the
  sound output delay that the web view reports (about 40 ms on the mini
  PC). The worklet plays up to 0.3 % faster or slower to hold the time.
- While music comes, the delay covers the slowest frame or block of the
  last 5 seconds, not 19 of 20, and comes down at 2.5 ms a second: a late
  block of music is a gap that the ear hears.
- The user gets no sound timing setting (the user's decision): the app
  calculates the timing. `StreamCast.soundOffsetMs` stays 0; it is only
  for tests. The music's trip counts for the delay as a frame's trip
  does, so music always arrives before its time.

How the timing was proven (2026-11-22), with no listening by ear to a
scene, which misled: a first tuning by ear ended at -135 ms, and was wrong.

- A plain video with a white flash and a beep at the same moment, played
  by the browser on the mini PC: flash and beep together on the JMGO
  projector. So the projector adds no difference of its own.
- The same flash and beep through the stream, with the same time stamp
  (`StreamCast.testPattern`): together. So the receiver plays by the
  time stamps correctly.
- On the sender, the newest samples in the player's graph were found in a
  second decoding of the song file (`measure` in `src/dev/castProbe.ts`):
  the audio element's `currentTime` is 2 ms ahead of them. So the song
  clock's picture and the block's heard moment have the relation that the
  code assumes.
- A stamp from the blocks' arrival times was 6 ms later than the stamp
  from the sound system's clock, which the code now uses.
- In the real show with a song (`measureShow`): for the same moment of
  the song, the music's time stamp is 6 ms after the picture's.
- The click test (`StreamCast.flashEvery`): a click track plays as a song,
  and each frame whose song time is at a click goes out white. Flash and
  click came together on the projector. Make the click track with FFmpeg
  (a 30 ms tone each half second); it is not kept in Git.
- The receiver's sound player follows each step up of the delay at once
  (`jump`), and stays within 4 ms of its time.

The user saw scenes out of time with their music in the cast, and never
on the sender's own screen. After the two corrections above (the stamp
from the sound system's clock, and the sound that follows each step of the
delay at once), the user found the cast close enough for a short time.

**Open fault (2026-11-22, to revisit):** more tests by the user show that
real scenes are still out of time with their music in the cast, and only
in the cast; on the sender's own screen they are in perfect time. The
sound now seems early, not late, but the user cannot be sure. The click
test and the measurements above do not show this fault, so they do not
cover its cause. Not yet examined: the picture's way through the engine
in a cast (the stream's own frame clock gives the engine evenly spaced
times, not the real time; `rangeAhead` and the trails draw for a moment
ahead), the time from the receiver's draw to light on the screen, and
the 43 ms that the music waits in blocks. A test for it needs a real
scene's motion in the measurement, for example a setting that the song's
beat moves, read back from the frames on the receiver.

Measured with music: about 200 ms from the picture in the app to the
projector (most of it for the Wi-Fi's slow moments of up to 300 ms), no
gaps in the music.

### The Cast menu and receiver mode (2026-11-22)

- Search: the sender sends `KALEIDOSAGE-FIND 1` (UDP, port 14530) from
  each of its network addresses to all PCs on that network
  (`cast_receivers`); each receiver answers with its name and screen
  size. Windows Firewall lets the answers in with no question on the
  sender, because they answer a message the app sent a moment before. The
  app searches at its start, when its window gets the focus, and each 15
  seconds while it has the focus.
- The receivers show in the View menu as "Cast to NAME (network)", after
  the screens. `StreamCast.pick` keeps the last receiver by name
  (localStorage `kaleidosage.cast-receiver`).
- A sender and a receiver with different `PROTOCOL` numbers do not work
  together; the sender says to update both.
- Receiver mode: View > Use This PC as a Receiver (`receiver_mode_set`)
  adds a value to the user's Run key in the registry, so Windows starts
  `kaleidosage.exe --receiver` at each sign-in, then the app closes (with
  its usual question about changes) and starts again as a receiver. Only
  the installed app can do this, not the dev build. The uninstaller does
  not remove the Run value; Windows ignores a value whose program is gone.
- On the receiver screen, Esc or a click opens the options: back, Close
  the Receiver (it comes back with Windows), or Use This PC as Before
  (removes the Run value and opens the normal app).
- The receiver keeps the screen and the PC on (`keep_awake`).

Not done yet: a stream quality
setting; a transport that hides the Wi-Fi's slow moments (the delay could
then be much shorter); app updates on a PC in receiver mode (the update
question is in the normal app only); a help picture of the receiver
screen (the picture tool photographs only the main window).
`src/dev/castProbe.ts` has the timing
tests, and can start a cast with a line of numbers each second in the dev
log.
