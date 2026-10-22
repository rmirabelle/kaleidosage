# Audio design: settings that move with music

A design note, written 2026-10-18, before any code. It builds on the MIDI
code (`src/lib/midi.ts`, `Engine.holdRange`, `Engine.follow`) and the
range code in `src/engine/params.ts` as they are today.

## Goal

Music moves the picture. The first source is the sound that the PC plays
now (any app: Spotify, a browser, a DJ program). An audio file and the
microphone come later and use the same analysis and the same links.

## Rule

An audio link connects one band of the sound to one setting, the way a MIDI
mapping connects one knob to one setting. A setting with no link plays as
it does today. When the music stops, every linked setting goes back to its
normal motion. So a scene still looks right with no sound.

## 1. Capture the sound (Rust)

Built in `src-tauri/src/sound_capture.rs`. One Sound source menu lists both
kinds of device (decided 2026-10-18): "PC sound" (each output device, what
plays on it, in loopback mode) and "Microphones and line inputs" (each
input device, a plain capture stream). The code is the same for both, but
for the loopback flag. A sound card can show in both groups, because its
output and its line-in are separate Windows devices.

Windows gives the PC's output sound through WASAPI loopback: open a capture
stream, in shared mode, on the render (output) device, with the flag
`AUDCLNT_STREAMFLAGS_LOOPBACK`. Windows cannot capture one app only; the
capture is everything the output device plays.

- New file `src-tauri/src/pc_audio.rs`. Use the `windows` crate that the
  app already has (add the `Win32_Media_Audio` and `Win32_System_Com`
  features), not a new audio crate. The cpal crate may also do loopback
  (an input stream on an output device), but I could not confirm it.
  Check cpal's issues before you pick it.
- A capture thread reads the buffer every 10 ms (timer, not event mode: a
  loopback stream in event mode gives no events). When nothing plays,
  Windows sends no packets; the thread then sends silence, so the levels
  fall to zero and do not freeze.
- The thread mixes the channels to mono and sends blocks of samples (32-bit
  float, about 480 samples per block) to the webview through a
  `tauri::ipc::Channel` with a raw byte body, not JSON. At 48 kHz that is
  about 190 KB per second.
- Commands: `pc_audio_devices` (the output devices, the default one first),
  `pc_audio_start(device, channel)` (returns the sample rate) and
  `pc_audio_stop`. If the output device changes (headphones in), stop and
  start on the new default device.

Why raw samples and not levels from Rust: the file and microphone sources
come later through Web Audio in the webview. With raw samples, one
analysis in TypeScript serves all three sources, and vitest can test it
with made-up signals.

## 2. Analysis (TypeScript, no React)

New file `src/engine/audio.ts`, pure and testable, like `params.ts`.

- Delay budget (measured 2026-10-18): Windows wakes the capture thread for
  each block (event mode, every 10 ms or less); the analysis shows a new
  sound in 3 to 4 ms (bass: 10 ms, a part of its own cycle). The screen
  adds up to one frame. A first version read every 20 ms and used a
  2048-sample FFT, whose window gave the newest sound almost no weight:
  the meters reacted 80 to 100 ms after the sound.
- The bands are chains of second-order filters (four in a row at each
  edge, so a tone does not leak into the next band), run sample by
  sample, each with an envelope that rises in 2 ms and falls in 150 ms.
- Four bands, each a level from 0 to 1:

  | Band   | Range          | Good for                        |
  |--------|----------------|---------------------------------|
  | Level  | all            | general size or brightness      |
  | Bass   | 20 to 150 Hz   | kick drum, zoom, pulse          |
  | Mids   | 150 to 2000 Hz | voice, melody, rotation         |
  | Highs  | 2 to 12 kHz    | hi-hats, sparkle, particles     |

- Peaks, in dBFS (decided 2026-10-18): each band's level is its peak, as
  on a DAW's peak meter and in a compressor's peak mode, so 0 dB means the
  same here as there. The peak rises with each sample and falls over
  about 50 ms. (History: first each band's share of its recent peak, with
  auto gain, which sat near full in compressed music; then RMS in dBFS,
  which sat 3 to 10 dB under the peaks, so a threshold of 0 dB never moved
  anything.) Gain adds dB. A band's level is 0 at the Threshold (sound
  below it moves nothing) and 1 at 0 dBFS, with at least 6 dB of room
  above a high threshold. The meters show dBFS from -60 to 0, with a mark
  at the threshold.
- Beat (automatic since 2026-10-18; a Beat sensitivity slider came first,
  and the user saw no use for it): the bass peak is above the threshold,
  and the bass RMS (over about 10 ms) jumps
  within about 10 ms by at least half the largest jump of the last few
  seconds (and at least 3 dB). So the clear hits count in compressed and
  in dynamic music alike, and the small ones between them do not. A jump
  out of silence does not set that size, or a song's start would block the
  beats. No second beat within 100 ms. The check uses the plain RMS, so a
  softer hit right after a hard one still counts.

The analysis puts its latest result in one object that the engine reads in
each frame. It does not use React state.

## 3. Links (what a setting does with a band)

**Changed 2026-10-22: one audio switch per setting replaces the links.**
The rest of this part, and parts 4 and 5, are the history of the links.
A setting's speaker is now an on/off switch (`PlayState.sound`, saved in
the scene as `sound`, a list of setting names). An older scene opens with
each of its linked settings switched on; the link's source, range,
threshold and release, and the scene's Release, are left out. While the
switch is on, the sound moves the setting by its family
(`familyOf` in `src/engine/songScript.ts`): brightness and size follow
the level and pulse on each beat, detail follows the level slowly,
sparkle follows the high sounds, and every other setting moves one step
through its range on each beat. With a song and Song follow on, the
song's plan moves it (`songScript.ts`); otherwise the live sound of the
input moves it (`src/engine/liveSound.ts`). The span is the range's
handles, or with no range, from the slider value toward the end of the
slider with more room (`pushRange`). The Audio panel lists the
switched-on settings, with Enable All (every setting with a range) and
Disable All. A MIDI hold wins over the sound.

```ts
type AudioBand = "level" | "bass" | "mids" | "highs" | "beat";
interface AudioLink {
  band: AudioBand;
  /** How far the sound can move the value, from 0 to 1: the sensitivity. */
  amount: number;
  /** For "beat" only: see Beat styles below. */
  beatStyle?: "kick";
}
```

What a link does, with the band at level `a` (0 to 1):

- **Range on** (changed 2026-10-18): while the app listens, the range
  stops playing. The value rests at the start handle, and the sound pushes
  it toward the end handle: `value = start + amount × a × (end − start)`.
  So the handles are the span the music moves in, and the Reverse button
  sets the direction. (The first rule pushed from the playing value toward
  the end handle: near that handle there was almost no motion.) With no
  input, the range plays as normal.
- **Range off:** the slider's value is the home, and the sound pushes it
  toward the end of the slider with more room (the maximum on a tie),
  `amount × a` of the way. See `pushRange` in `src/engine/audio.ts`.

Beat styles below. */
  beatStyle?: "kick";
}
```

What a link does, with the band at level `a` (0 to 1):

- **Range on (the main case):** the range plays as normal, and the sound
  pushes the value from where the range is now toward the end handle:
  `value = drift + amount × a × (end handle − drift)`. Silence gives the
  normal range; loud sound with amount 1 gives the end handle. The value
  never leaves the handles.
- **Range off:** the slider's value is the rest point, and the sound pushes
  it toward the slider's maximum by `amount × a` of the way. (Option: push
  toward the minimum instead, with a "reverse" switch on the link.)

Beat styles (a link on the "beat" band):

- **Kick:** on each beat the value jumps toward the end handle and falls
  back smoothly (about 250 ms), like a drum hit.
- **Jump** (removed 2026-10-18; the user did not want it): on each beat the value went to a new random place between the
  handles and glides there with the MIDI spring (`MIDI_SMOOTH_SECONDS`).
  This is your "random point on each beat" idea. A plain jump with no glide
  looks jerky, so it glides.

Engine change: `Engine.live(key)` applies the link last, after the range,
the glide and a MIDI hold. A MIDI hold wins: while a knob holds a range,
the audio link has no effect on it. The engine gets a read-only
`audio: AudioLevels | null` field that the audio code sets.

Response curve (decided 2026-10-18): a link's push rises at once and falls
back over the scene's Release (in the scene file; default 0.25 s, from 20
ms to 3 s), times the link's own factor (×0.25 to ×4, default ×1). So the
Release sets the scene's general feel, and a factor keeps a link faster
or slower than it when the feel changes. The analysis itself falls in
20 ms, so the meters show the sound as it is. Both sliders are in the
Audio panel's list of links, not in the setting rows.

Per-link threshold (decided 2026-10-18): each link has a threshold offset
in dB (-24 to +24, default 0), added to the app's Threshold, in the same
way the release factor scales the scene's Release. A band link follows
its band's loudness above that sum; a beat counts for a Beat link only
when the bass is above it. The link's "amount" shows as "Range" in the
Audio panel: how far the sound can move the setting.

## 4. Where links are kept

Recommendation: in the scene. A link is part of the look, so it goes in the
`.ksage` file (a new `audio` entry; older versions skip it), in Undo, and
in the unsaved-changes fingerprint. The MIDI map stays global, because it
belongs to the controller, not to the scene.

The source (PC sound on or off, the device) and the global Gain and Beat
sensitivity are app settings, kept in `localStorage`, not in the scene.
The capture and the analysis belong to the app, not to a tab: they keep
running when the user selects another scene tab, and that scene's links
react to the same sound at once. So one stream of music can play while
the user switches from scene to scene. (Decided 2026-10-18.)

Note for live switching: today a tab switch starts the trails again from
the still picture, so the change of scene is a hard cut. A crossfade
between two scenes is a separate, later feature.

## 5. Controls

- **Setting rows:** an audio button (a small speaker or wave icon) next to
  the MIDI button. A click opens a small menu: Off, Level, Bass, Mids,
  Highs, Beat (the kick). A pick closes the menu; the Audio panel's list sets each link's amount. The icon is lit
  while the row has a link, and it moves with the band's level, so the user
  sees that it works.
- **Audio panel:** a second tab in the bottom panel, next to MIDI (the
  panel already slides up with M). It has the source (PC sound, the device
  menu, an on/off switch), live meters for the four bands, a light that
  flashes on each beat, the Gain and Threshold sliders, and a list
  of every link in the scene, one line each (setting, band, amount, X), as
  the MIDI panel lists its mappings.
- **Per effect:** the effect's header could get one Audio amount that
  scales every link inside the effect. This is not in the first version;
  each link's own amount covers it.

## 6. Video export

Live sound cannot be played again, so a video export plays the ranges
with no audio links. Later, with an audio file as the source, the export
can analyze the file frame by frame and put the music in the MP4.

## 7. Files (decided 2026-10-18; first named "Playlist", then "Tracks"; the code still says "tracks")

A third kind of input, under its own heading in the Input menu: the app
plays audio files itself, through the speakers, and the same sound goes to
the analysis. The playlist then runs the show.

- Files: picked in the Open dialog (several at once). Only a playlist
  file keeps them: outside a playlist the list starts empty at each start
  of the app, and a new or opened scene empties it. Shown in the Audio panel under the Input
  menu: click a track to play it, X removes it, Add files adds more. The
  playlist repeats forever.
- Playback: an `<audio>` element streams each file through the app's
  `video://` protocol (no bytes through IPC). Web Audio sends it to the
  speakers and to an AudioWorklet tap, which mixes to mono and posts blocks
  of 512 samples to the analyzer.
- Play controls (changed 2026-10-21; before, one set of controls under the
  picture ran the music and the animation together): the music and the
  scene play on their own. The Playlist card has a play toolbar at its
  bottom (`PlaylistTransport` in `FilesCard.tsx`): Stop, Play/Pause, the
  time in the file and a bar to seek in it (Rewind, which took the place
  of Previous and Next on 2026-10-20, went on 2026-10-21). The scene's
  toolbar at the bottom of the left panel, under the FX card (`SceneTransport` in
  `SourcePanel.tsx`; before, a bar over the picture), Space and
  Shift+Space run the scene only. Its bar scrubs the scene in its Length
  (`Engine.seekTo` steps the scene there from its start without drawing),
  and a bar above it counts down to the next scene. A scene that comes
  in plays or stays paused as the scene before it did. Hold keeps the shown scene (a HOLD
  button after the next-scene countdown in the scene's toolbar: gray while
  off, red and blinking while on; a click turns it on or off): a
  Length end or a new track does not change it, and the music plays on. A
  change that the user makes to the scene with the mouse or the keys turns
  Hold on by itself; MIDI knobs and audio links do not, so a live show with
  knobs goes on. A click on Hold, a save of the scene or the playlist, or
  a tab click turns it off, and the scene then plays to the end of
  its Length.
- Scenes: at the end of each scene's Length (a playhead line in the Length slider
  shows the place in it), the show crossfades to the next scene tab, and
  round again. Ranges with their own times, or that need two Lengths to
  come back, do not make the scene longer. Each scene starts from 0 when it
  shows (a tab click, a Length end or a new track), so it plays its whole
  Length. A pause holds it. Each new track (the end of a track, or a pick in the list) also
  goes to the next tab. The track end takes precedence: a Length that ends
  in the last half Length of a track waits for the new track. A tab click
  takes precedence over both: it cancels a switch that is on its way, the
  order goes on from the clicked tab, and a new track does not take the
  clicked scene away before it has played half its Length
  (changed 2026-10-20; before, track N always went to tab N). Later: a
  choice to change the scene every 16 or 32 beats instead.
- Show schedule (2026-10-22): with Song follow on, the scenes follow a
  fixed schedule across the whole playlist (`showSchedule.ts`) instead of
  Lengths and new tracks. A slice plays the scene the user picked for it
  (Ctrl+click on a scene in the scene list, or Fill); any other slice
  keeps the scene of the slice before it, and the first slice of a song
  with no pick plays the scene after the previous song's last one, in tab
  order (after the last tab, the first). So a pick never moves when the
  scenes or the songs change order (changed 2026-10-22; before, each
  slice brought in the next scene, and Keep Scene kept the one before).
  Fill picks the next scenes for a song's slices that have none. A picked
  scene follows its scene when the tabs move; a closed scene's picks go.
  In an automatic map, a slice at the same level as the one before it,
  with no hit, joins that slice. A jump (a seek, a click on a slice, a new track) brings in
  that slice's scene. A tab click shows its tab until the next slice that
  changes the scene; Hold keeps the scene. While Hold is on, the slice
  that plays loops in the music too; a click on a slice with another scene
  turns Hold off and brings that scene in. The Song Map page shows one
  song's map, with each slice's scene number; arrows beside the song's
  name show the song before or after it, and a click on a slice plays that
  song from the slice's start.
- The app does not play music at its start; the user starts it.
- Order and layout (2026-10-20; the scene list also shows for any open
  playlist): a drag moves a track in the Files list,
  and a drag moves a scene tab (the scenes play in tab order). While Files
  is the input, the left side is one panel of three columns: the Files
  card (`FilesCard.tsx`), the scenes as a list (`SceneList.tsx`), not as
  tabs, which filled many rows for a long show, and the Source and FX
  column. A drag moves a scene in the list, and its X closes it. The
  Audio panel keeps the input and the audio links. The line at the Files
  card's right edge sets its width (`src/lib/panelLayout.ts`);
  playlist.json keeps it as "layout.filesWidth", so a change counts as a
  change of the playlist.
- Play time: the Files card's footer shows the number of files and
  their play time. The app reads each file's length from its header, once
  (`TrackList.measure`). Save Playlist keeps the lengths in playlist.json
  ("trackSeconds"), so the Open Playlist preview shows each track's length
  and the total, and an opened playlist needs not read them again. A
  playlist saved before 2026-10-20 shows them after its next save.

## 8. Playlist files (decided 2026-10-18)

"Playlist" names the file that holds a whole show; the list of audio
files in it is "Tracks" (part 7), so one word means one thing.

- A .ksplaylist is a ZIP64 archive, entries stored: playlist.json (the
  audio settings: input, device, gain, threshold, beat sensitivity; and
  the tab that was selected), then a copy of each scene file in tab order
  (scenes/<n>/<name>.ksage) and of each track (tracks/<n>/<name>). The user
  wants portability, not small files: one file goes to another PC and
  plays there. A device that the other PC does not have becomes the
  default device of its kind.
- Open Playlist (File menu) first asks "Save changes?" for each scene and
  the playlist, closes the open scenes, unpacks the file into a folder of
  its own in the temp folder, opens its scenes, puts its tracks in
  (stopped), and applies its audio settings. Old unpacked folders go at
  the next Open Playlist and at the app's start.
- Scopes (changed 2026-10-18; first, Save Playlist asked to write each
  changed scene over its own file, which felt wrong): a scene in an open
  playlist is the playlist's. Save Playlist stores each scene as it is
  now, in the playlist, and never writes over the scene's own file on
  disk, so a scene can change in one playlist and stay as it was in the
  others. The first Save Playlist gives each scene a copy of its own in
  the temp folder (playlist_scene_path); from then on Ctrl+S saves the
  playlist, Save Scene gives way to Export Scene As (a copy on disk), a
  tab closes with no question, and the playlist's unsaved mark counts
  every scene's changes too. Closing the window asks once, for the
  playlist. The title bar shows "Show.ksplaylist › Scene.ksage".
- Close Playlist (File menu, 2026-10-20): asks "Save changes?" once for the
  playlist, then closes its scenes, takes its files out of the Files list
  and shows the start screen. The audio settings stay as they are.

## Order of work

1. Rust capture and the Audio panel with meters only. Check that the
   meters follow the music and that silence gives zero.
2. The analysis module with tests (sine waves for the bands, clicks for
   the beat).
3. Links on the rows, the engine change, scene file, Undo, fingerprint.
4. Beat style (Kick).
5. Later: audio file and microphone sources, export with a file's music.

## Open questions

- One link per setting (recommended for the first version), or several
  bands on one setting?
