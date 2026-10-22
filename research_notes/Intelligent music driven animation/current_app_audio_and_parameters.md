# Kaleido Sage today: audio reactivity, looping, and every animatable parameter

Scope: a read-only study of the local repository `D:\Code\KaleidoSage` (Tauri 2 + React 19 + WebGL 2), version 0.9.0 plus uncommitted work in progress (git status shows 15 modified files, among them `docs/AUDIO.md`, `src/engine/engine.ts`, `src/components/SourcePanel.tsx`, `src/components/StageControls.tsx`, `src/lib/playlistFile.ts`). All sources are code or doc files in that repository; links point to the local file and line. Line numbers are for the working copy on 2026-10-21.

Short paths used below: `params.ts` = `src/engine/params.ts`, `engine.ts` = `src/engine/engine.ts`, `audio.ts` = `src/engine/audio.ts`, `renderer.ts` = `src/engine/renderer.ts`, `audioInput.ts` = `src/lib/audioInput.ts`, `tracks.ts` = `src/lib/tracks.ts`, `midi.ts` = `src/lib/midi.ts`, `loop.ts` = `src/engine/loop.ts`, `scene.ts` = `src/engine/scene.ts`, `submodes.ts` = `src/engine/submodes.ts`.

## Q1. How is audio input obtained today?

### Takeaway
There are three live inputs, all real time: WASAPI capture of an output device in loopback mode ("PC sound") or of an input device (mic/line-in), done in Rust and streamed as raw mono float32 blocks to the webview; and "Files" (the app plays MP3/WAV/FLAC/OGG/Opus/M4A/AAC itself through an `<audio>` element + Web Audio, with an AudioWorklet tap that sends mono 512-sample blocks to the same analyzer). There is no Web Audio `AnalyserNode`, no FFT, and no offline/pre-analysis path.

### Cited Findings
- Input kinds are `"output" | "input" | "tracks" | "none"`; the app listens from start-up unless the input is "none"; the default is the PC sound of the default output device, gain 0 dB, threshold −40 dB; settings are kept in `localStorage` key `kaleidosage.audio` — [audioInput.ts:20-23, 58-63, 134-140](D:/Code/KaleidoSage/src/lib/audioInput.ts#L20)
- Device capture: `invoke("sound_start", { device, kind, samples, status })` with a Tauri `Channel<ArrayBuffer>`; each buffer becomes a `Float32Array` pushed into `AudioAnalyzer.push` — [audioInput.ts:161-176](D:/Code/KaleidoSage/src/lib/audioInput.ts#L161)
- Rust side: shared-mode WASAPI, output devices in loopback mode; event mode about every 10 ms; mixes to mono and sends raw little-endian 32-bit floats at once; sends silence after `SILENCE_WAIT_MS = 20` so levels fall to zero; checks for a new default device every 1 s; commands `sound_devices`, `sound_start`, `sound_stop` — [src-tauri/src/sound_capture.rs:1-30](D:/Code/KaleidoSage/src-tauri/src/sound_capture.rs#L1); [src-tauri/src/lib.rs:106-108](D:/Code/KaleidoSage/src-tauri/src/lib.rs#L106)
- Accepted capture sample formats: IEEE float 32, PCM 16/24/32 (incl. WAVEFORMATEXTENSIBLE) — [sound_capture.rs:510-525](D:/Code/KaleidoSage/src-tauri/src/sound_capture.rs#L510)
- Files ("tracks"): an `AudioContext({latencyHint:"interactive"})`, `createMediaElementSource(audio)` connected to the speakers and to an `AudioWorkletNode("kaleido-tap")` that averages channels to mono and posts `TAP_BLOCK = 512` samples (≈10.7 ms at 48 kHz) to `onSamples` — [tracks.ts:22-57, 237-275](D:/Code/KaleidoSage/src/lib/tracks.ts#L22)
- File bytes are not sent over IPC; each file is opened with `open_video_file` and streamed through the app's `video://` protocol (`convertFileSrc(file.id, "video")`) — [tracks.ts:277-287](D:/Code/KaleidoSage/src/lib/tracks.ts#L277); [src-tauri/src/video_stream.rs:26-50](D:/Code/KaleidoSage/src-tauri/src/video_stream.rs#L26)
- When the tracks are the input, the device capture is stopped and the analyzer is re-made if the player's sample rate differs (e.g. 44.1 vs 48 kHz) — [audioInput.ts:195-204, 126-132](D:/Code/KaleidoSage/src/lib/audioInput.ts#L195)
- Tracks repeat forever (the list wraps at both ends); the app never auto-plays music at start — [tracks.ts:322-330](D:/Code/KaleidoSage/src/lib/tracks.ts#L322); [docs/AUDIO.md:220-223, 261](D:/Code/KaleidoSage/docs/AUDIO.md#L220)
- Playback position is available as `tracks.position` (`audio.currentTime`) and `tracks.duration`; `tracks.seek(seconds)` exists — [tracks.ts:200-208, 317-320](D:/Code/KaleidoSage/src/lib/tracks.ts#L200)
- Design rationale: raw samples (not levels) come from Rust so that one TypeScript analysis serves all sources and can be tested with synthetic signals — [docs/AUDIO.md:52-55](D:/Code/KaleidoSage/docs/AUDIO.md#L52)

### Inferences
- The Files input already gives a single authoritative song clock (`HTMLAudioElement.currentTime`) that a precomputed, song-time-indexed script could follow. The PC-sound and mic inputs have no song clock and no file to pre-analyze, so a pre-analysis design only fits the Files input (or a future "analyze this file" path).

### Gaps
- `docs/AUDIO.md` describes a file `pc_audio.rs` and "timer, not event mode" (lines 34-42), but the code is `sound_capture.rs` in event mode. The doc is partly stale. It also contains a stray duplicated fragment at lines 127-131 (work in progress).

## Q2. What audio features are computed, and where?

### Takeaway
`AudioAnalyzer` (pure TypeScript, no React, no Web Audio) runs four 8th-order Butterworth biquad band filters sample by sample and keeps a peak envelope per band in dBFS: Level (20 Hz–16 kHz), Bass (20–150 Hz), Mids (150–2000 Hz), Highs (2–12 kHz). It also counts beats (bass-RMS jump detector). Nothing else: no tempo/BPM, no beat phase or bar position, no onset strength per band, no spectral centroid, no chroma/key, no section/structure, no lookahead.

### Cited Findings
- Bands and edges: `BAND_RANGES` level 20–16000, bass 20–150, mids 150–2000, highs 2000–12000 Hz; filters are chains of RBJ biquads with Butterworth Qs `[0.5098, 0.6013, 0.9000, 2.5629]` (48 dB/octave) — [audio.ts:134-165](D:/Code/KaleidoSage/src/engine/audio.ts#L134)
- Envelope: peak rises at once and falls to ~1/3 in `RELEASE_SECONDS = 0.05`; levels update every `TICK = 64` samples (~1.3 ms at 48 kHz); floor `FLOOR_DB = -60`, top `TOP_DB = 0` — [audio.ts:170-187, 296-324](D:/Code/KaleidoSage/src/engine/audio.ts#L170)
- Level mapping: `levelAbove(dB, thresholdDb)` = 0 at the threshold, 1 at 0 dBFS, with at least `MIN_SPAN_DB = 6` dB of span — [audio.ts:207-219](D:/Code/KaleidoSage/src/engine/audio.ts#L207)
- Global `gainDb` (added before threshold; −24…+24) and `thresholdDb` (−60…0, default −40) — [audio.ts:267-270](D:/Code/KaleidoSage/src/engine/audio.ts#L267); [audioInput.ts:62-63](D:/Code/KaleidoSage/src/lib/audioInput.ts#L62)
- Beat detection: every `BEAT_TICKS = 4` ticks (~5.3 ms) the bass RMS (~10 ms running mean) is compared to its value `RISE_CHECKS = 2` checks earlier; a beat is a rise ≥ max(3 dB, 0.5 × the largest rise of the last ~4 s), with bass peak above threshold, and ≥ 100 ms since the last beat; output is only a counter `beats` — [audio.ts:189-205, 326-346](D:/Code/KaleidoSage/src/engine/audio.ts#L189)
- Exposed interface the engine reads each frame: `AudioSignal { levels, decibels, thresholdDb, beats }` — [audio.ts:95-101](D:/Code/KaleidoSage/src/engine/audio.ts#L95)
- Measured latency: a new sound shows in 3–4 ms (bass ~10 ms) plus up to one screen frame; an earlier 2048-sample FFT version reacted 80–100 ms late — [docs/AUDIO.md:61-69](D:/Code/KaleidoSage/docs/AUDIO.md#L61)
- History of design choices: band level was first "share of recent peak with auto gain" (sat near full on compressed music), then RMS (sat 3–10 dB under peaks), now peak dBFS; a user-facing beat-sensitivity slider was removed because the user "saw no use for it" — [docs/AUDIO.md:79-97](D:/Code/KaleidoSage/docs/AUDIO.md#L79)
- Tests exist with synthetic signals — `src/engine/audio.test.ts` (220 lines; file list).

### Inferences
- Because `AudioAnalyzer` is pure and sample-driven, it can be run offline over a decoded file in the webview or a worker to produce a feature track at any rate — but its features are thin; an "intelligent" system needs new offline features (tempo/beat grid, downbeats, onsets per band, sections, energy curves).
- A precomputed track could implement the same `AudioSignal` interface, so existing links keep working while new script-driven control is added.

### Gaps
- No code computes BPM, beat phase, downbeats, sections, or key; the AUDIO.md "Later: change the scene every 16 or 32 beats" idea is unimplemented — [docs/AUDIO.md:259-260](D:/Code/KaleidoSage/docs/AUDIO.md#L259)

## Q3. How are audio features mapped to parameters today, and why is it slow to set up?

### Takeaway
The model is "one link per setting": `PlayState.audioLinks: Partial<Record<ParamKey, AudioLink>>` with `{ source: "level"|"bass"|"mids"|"highs"|"kick", amount 0–1, release factor ×0.25–×4, threshold offset −24…+24 dB }`. A link pushes the value from a rest point toward an end point by `amount × push`, where `push` rises instantly and decays exponentially over the scene's Release (default 0.25 s, 0.02–3 s) times the link factor. The user must, per scene and per setting, pick a band, then tune range, threshold and release by ear, and also set range handles that define the span. Nothing is automatic, musical structure is ignored, and video export ignores audio.

### Cited Findings
- Link type and limits: `AudioLink { source; amount; release?; threshold? }`; `AUDIO_RELEASE {default 0.25, min 0.02, max 3}`; `RELEASE_FACTOR [0.25, 4]`; `LINK_THRESHOLD [-24, 24]` — [audio.ts:21-46](D:/Code/KaleidoSage/src/engine/audio.ts#L21)
- Response curve: `followPush` — up at once, down `target + (value − target)·exp(−elapsed/release)` — [audio.ts:55-58](D:/Code/KaleidoSage/src/engine/audio.ts#L55)
- Linkable: any param with a `drift` kind except `cycle` — [audio.ts:61](D:/Code/KaleidoSage/src/engine/audio.ts#L61)
- Push geometry: with the range on, the range stops playing while the app listens, the value rests at the start handle `low` and is pushed toward the end handle `high`; with the range off, the slider value is home and the push goes toward the slider end with more room (max on a tie); motion is in slider space (log sliders move in equal ratios) — [audio.ts:113-131](D:/Code/KaleidoSage/src/engine/audio.ts#L113); [engine.ts:627-643](D:/Code/KaleidoSage/src/engine/engine.ts#L627)
- Per-frame update: `Engine.followAudio(elapsed)` runs on real time (works while paused); target = band `levelAbove(decibels[band], master+offset)`, or for "kick" 1 on a new beat when bass ≥ the link's threshold; then `followPush` with `state.audioRelease × link.release` — [engine.ts:456-476](D:/Code/KaleidoSage/src/engine/engine.ts#L456)
- Precedence: a MIDI hold beats the audio link (`audioMoves` false while held) — [engine.ts:483-498](D:/Code/KaleidoSage/src/engine/engine.ts#L483)
- Scope: links and Release are saved in the scene (`.ksage`), in Undo, and in the unsaved-changes fingerprint; gain, threshold and input are app settings — [scene.ts:58, 241-244, 291](D:/Code/KaleidoSage/src/engine/scene.ts#L58); [src/engine/history.ts:48-49](D:/Code/KaleidoSage/src/engine/history.ts#L48); [docs/AUDIO.md:173-185](D:/Code/KaleidoSage/docs/AUDIO.md#L173)
- UI workflow: each setting row has an audio button whose menu offers Nothing/Level/Bass/Mids/Highs/Beat; a new link starts at amount 0.5; the Audio panel lists every link with a source dropdown and Threshold-offset, Range and Release-factor sliders, plus Master Gain, Master Threshold and the scene's Release — [src/components/AudioLinkButton.tsx:11-28](D:/Code/KaleidoSage/src/components/AudioLinkButton.tsx#L11); [src/components/AudioPanel.tsx:101-121, 215-264, 390-409](D:/Code/KaleidoSage/src/components/AudioPanel.tsx#L101)
- Video export plays ranges with no audio links (the export engine copy has `audio = null`), and the MP4 muxer is configured with a video track only — [engine.ts:426-431](D:/Code/KaleidoSage/src/engine/engine.ts#L426); [docs/AUDIO.md:208-212](D:/Code/KaleidoSage/docs/AUDIO.md#L208); [src/lib/videoExport.ts:400-401](D:/Code/KaleidoSage/src/lib/videoExport.ts#L400)
- Open design question still listed: one band per setting vs several bands — [docs/AUDIO.md:322-325](D:/Code/KaleidoSage/docs/AUDIO.md#L322)

### Inferences
- Time cost comes from: 147 candidate settings; per-setting band choice; four coupled knobs per link (range handles, amount, threshold offset, release factor) plus two global ones (gain, threshold); repeating the work per scene; and tuning only by listening in real time. The mapping is reactive only (no anticipation of drops, no section changes, no beat-synced mode switches), so results feel "meter-like" rather than choreographed.
- Only continuous pushes and a single "kick" impulse exist; there is no way to trigger discrete events (mode change, effect on/off, color change, scene switch) from music.

### Gaps
- No telemetry on how many links users typically make; the "time-consuming" claim is inferred from the UI structure, not measured.

## Q4. The looping system today (per effect and per scene) and how it interacts with audio

### Takeaway
All motion is periodic by design. One shared cycle (`cycle`, labeled "Length", 5–90 s, default 20) sets the global animation speed; every range goes start→end in one cycle and back in the next (a triangle wave shaped by an ease), unless it has its own period (`custom`, 1–60 s, on the real clock). Speed-type settings integrate into ever-growing accumulators. At the scene level, while Files is the input, each scene plays one Length then crossfades (1.5 s) to the next tab, wrapping round; a new track also advances the scene; each scene restarts from time 0. Audio links sit on top: a linked range stops looping while the app listens. Video export has its own seamless-loop math. A song-driven script would replace the clock, the triangle/ease range evaluation, the Length-based scene switching and the "rest at start handle" audio rule.

### Cited Findings
- Per-parameter model: `Param { value, min, max, step, unit?, scale?: "log", drift?: "spin"|"wave", low?, high?, on?, ease?, seed?, custom?, seconds?, startTime? }` — [params.ts:39-69](D:/Code/KaleidoSage/src/engine/params.ts#L39)
- Shared cycle: `REFERENCE_CYCLE = 20`; animation time runs at `speed = 20 / cycle`, so on animation time every cycle is 20 s — [params.ts:355-360, 368](D:/Code/KaleidoSage/src/engine/params.ts#L355); [engine.ts:387-389](D:/Code/KaleidoSage/src/engine/engine.ts#L387)
- Range evaluation `liveValue`: `trips = (clock − startTime)/seconds` where clock = `state.time` (shared, period `REFERENCE_CYCLE`) or `state.clock` (custom range, period `param.seconds`); full-circle spin turns once per trip; one-way eases (explode, implode) play once per trip; wander eases (random, drunk) continue trip to trip by hash; others fold a triangle 0→1→0 and apply `easeCurve`; log params interpolate geometrically — [params.ts:795-851](D:/Code/KaleidoSage/src/engine/params.ts#L795)
- 12 eases: organic (Smooth), linear, inOut, in, out, bounce, explode, implode, early, late, random, drunk; default organic for waves, linear for spins — [params.ts:93-100, 229-245](D:/Code/KaleidoSage/src/engine/params.ts#L93); design in [docs/MODULATION.md:24-54](D:/Code/KaleidoSage/docs/MODULATION.md#L24)
- Custom period: `setCustomTime` clamps to 1…`MAX_CUSTOM_SECONDS = 60`, keeping phase — [params.ts:787-825](D:/Code/KaleidoSage/src/engine/params.ts#L787)
- Accumulators (integrated speeds, never loop on their own): `warpTime += animated × (warpFlow + warpFlowOffset)`, `driverTime += animated × driverSpeed`, `mapTravel += animated × mapSpeed` (÷ Droste copy length in Droste mode), camera aim point `cameraX/Y` moves with `cameraSpeed` along `cameraTurn` — [engine.ts:842-858](D:/Code/KaleidoSage/src/engine/engine.ts#L842)
- Source videos loop inside the Length: `videoLoopTime`/`videoLoopPlan` map `state.time` to a place in the video, with an optional crossfade at the video's loop point (`state.videoCrossfade`) — [src/engine/video.ts:41-59](D:/Code/KaleidoSage/src/engine/video.ts#L41); [engine.ts:347-366](D:/Code/KaleidoSage/src/engine/engine.ts#L347)
- Driver video plays at `driverTime % duration` — [engine.ts:282-304](D:/Code/KaleidoSage/src/engine/engine.ts#L282)
- Time smear restarts every `smearRestart` s of the play clock (with `smearFade`) — [renderer.ts:1315-1335](D:/Code/KaleidoSage/src/engine/renderer.ts#L1315)
- Scene position = `(state.time mod 20)/20`; loop length for export is `cycle × 2` if any shared-cycle non-full-turn range moves, else `cycle` — [loop.ts:55-73](D:/Code/KaleidoSage/src/engine/loop.ts#L55)
- Scene-level loop (Files input only): at the end of the Length the next tab crossfades in (last tab wraps to first); a Length that ends in the last half Length of a track waits for the track; each new track (end or pick) also advances; a user-picked scene stays at least half its Length; Hold (manual, or auto-on when the user edits with mouse/keys, not MIDI/audio) freezes the current scene — [src/App.tsx:1055-1148](D:/Code/KaleidoSage/src/App.tsx#L1055); [docs/AUDIO.md:228-260](D:/Code/KaleidoSage/docs/AUDIO.md#L228)
- Scene switch mechanics: `engine.fadeOut(CROSSFADE_SECONDS = 1.5)` captures the last frame and fades it over the new scene (smoothstep), then `switchToDoc(id)` loads the scene into the single shared Engine and `engine.rewind()` starts it from 0 — [src/App.tsx:73-74, 789-806](D:/Code/KaleidoSage/src/App.tsx#L73); [engine.ts:193-227](D:/Code/KaleidoSage/src/engine/engine.ts#L193)
- `rewind()` pauses, zeroes `time`, `clock`, all `startTime`s and the accumulators, and resets trails — [engine.ts:717-729](D:/Code/KaleidoSage/src/engine/engine.ts#L717)
- Work in progress: `Engine.seekTo(clock)` scrubs a scene by rewinding and stepping `SCRUB_STEP = 1/120` s without drawing, so accumulators land where play would have put them; the new `SceneTransport` (scrub bar over the Length, next-scene countdown, HOLD) lives in `SourcePanel.tsx` — [engine.ts:86-87, 731-747](D:/Code/KaleidoSage/src/engine/engine.ts#L731) (git diff); git diff of `src/components/SourcePanel.tsx` (+152 lines)
- The scene and the music have separate transports since 2026-10-21 (they used to run together) — [docs/AUDIO.md:228-247](D:/Code/KaleidoSage/docs/AUDIO.md#L228)
- Interaction with audio: a linked range stops cycling while the app listens and rests at its start handle; with no input it loops as normal; `followAudio` uses real time so links react while paused — [engine.ts:633-643, 449-456](D:/Code/KaleidoSage/src/engine/engine.ts#L633)
- Video export seamless loop: fits custom periods to the video, corrects warp flow to a whole number of warp periods, and crossfades the seam when something never repeats (wander eases, noise/cell warp flow, tunnel flight, camera flight) — [loop.ts:1-12, 75-125](D:/Code/KaleidoSage/src/engine/loop.ts#L1)

### Inferences — what must change for a precomputed, song-time-indexed script to drive everything
- **Clock source.** Today `Engine.frame` advances `state.clock`/`state.time` by `requestAnimationFrame` deltas (capped at 0.1 s) and `speed`. A script-driven mode needs the song position (`tracks.position`, i.e. `audio.currentTime`, ideally corrected with `AudioContext.outputLatency`/`getOutputTimestamp`) as the master clock, read each frame; `state.clock` should then equal song time, not accumulated frame time.
- **Parameter evaluation.** `Engine.live(key)` → `liveValue` (triangle/ease over `REFERENCE_CYCLE` or custom seconds) would be replaced or bypassed by "sample the script at song time t" (interpolate keyframes/curves per `ParamKey`). The existing override chain in `live()` (bypass → range → glide → MIDI hold → audio push) is the natural insertion point; `live()` is called for every param in `frameValues` and in `step()`, so one change there reaches all renderer inputs ([engine.ts:627-643, 908-1108](D:/Code/KaleidoSage/src/engine/engine.ts#L627)).
- **Accumulators.** `warpTime`, `driverTime`, `mapTravel`, `cameraX/Y` are integrals of speeds; for exact seeking they should be precomputed as functions of song time (script stores either the integral or speed curves whose integral is computed analytically/offline), otherwise a seek must re-integrate like `seekTo` does from 0.
- **Seeking.** `seekTo` steps from the start at 1/120 s (cost grows linearly with position; a 4-minute song is ~28,800 steps without drawing). With a script, seek becomes "evaluate at t" plus re-seeding stateful GPU effects (trails, smear history, particles, contour smoothing), which cannot be reconstructed exactly and must restart ([renderer.ts:912-915, 1871](D:/Code/KaleidoSage/src/engine/renderer.ts#L912)).
- **Pause.** Today scene pause and music pause are separate (two transports). In a script mode they must be one: pause/seek on the song drives the picture. Glide and audio push use real time and keep moving while paused; that behaviour would need a decision.
- **Scene switching.** Length-end and track-change switching in `App.tsx` would be replaced by script events (scene/section changes at musical boundaries, e.g. downbeats), using the existing `fadeOut` crossfade; crossfade duration could become a script value.
- **Loop-only features to retire or re-scope**: `cycle`/`REFERENCE_CYCLE` speed scaling, `custom` periods, `startTime`, `scenePosition`, wander/one-way ease trip logic, `videoLoopPlan` (source video loop inside the Length), Hold logic, and the seamless-loop export math (export would instead render song length with the music muxed in).
- **Export.** The export engine already steps time deterministically ([videoExport.ts:456-458](D:/Code/KaleidoSage/src/lib/videoExport.ts#L456)); driving it by the script at frame times and adding an audio track to `mp4-muxer` would make offline, music-synced video possible.

### Gaps
- How `SceneTransport` and the countdown interact with a future script is not decided anywhere in the docs.

## Q5. Exhaustive inventory of animatable continuous parameters (`PARAM_KEYS`, 147 keys)

### Takeaway
All 147 settings live in `SPECS` in `params.ts` and are read each frame through `Engine.live()` into `FrameValues`. Almost all have a `drift` kind ("wave" or "spin"), so they can be ranged, eased, audio-linked and MIDI-mapped. Exceptions with no drift (step-only, not audio-linkable): `cycle`, `warpDetail`, `mapSteps`, `smearRestart`, `smearFade`. Many settings only have an effect under a given submode (see Q6) or when their effect group is on and in `fxOrder`.

### Cited Findings
Source for every row: `SPECS` — [params.ts:362-696](D:/Code/KaleidoSage/src/engine/params.ts#L362); order and groups — [params.ts:4-25, 1091-1114](D:/Code/KaleidoSage/src/engine/params.ts#L4); renderer use — [engine.ts:908-1108](D:/Code/KaleidoSage/src/engine/engine.ts#L908). Column "range" is `min–max (step)`; "default" is `value`; "default handles" is `low→high` with "on" if the range is on by default. Angles are degrees in the UI, radians to the shader. "log" = log-scale slider.

#### Animation / Source
| key | label | range | default | default handles | drift | what it does / notes |
|---|---|---|---|---|---|---|
| cycle | Length | 5–90 s (1) | 20 | — | none | Shared cycle length; sets global speed `20/cycle`; not linkable or MIDI-mappable ([midi.ts:37](D:/Code/KaleidoSage/src/lib/midi.ts#L37)) |
| imageBlend | Crossfade | 0–1 (0.01) | 0 | 0→1 | wave | Fades image 1 → image 2 (only with a second image); `blendMode` 0 crossfade / 1 dissolve by brightness |

#### Shape-step opacities (Common "Opacity")
| key | label | range | default | handles | drift | notes |
|---|---|---|---|---|---|---|
| warpOpacity | Opacity | 0–1 | 1 | 0→1 | wave | Warp result over picture, mixed by `layerBlend.warp`; <1 or non-normal blend adds a picture version (cost) |
| mapOpacity | Opacity | 0–1 | 1 | 0→1 | wave | Same for Algorithm (map) |
| foldOpacity | Opacity | 0–1 | 1 | 0→1 | wave | Same for Kaleidoscope |

#### Warp (group `warp`; type by `warpType`)
| key | label | range | default | handles | drift | notes |
|---|---|---|---|---|---|---|
| warpAmount | Warp strength | 0–1 | 0 | 0.05→0.3 | wave | Displacement strength |
| warpScale | Warp size | 0.2–8 | 1.5 | 1→2.5 | wave | Pattern size (not Cells) |
| warpCellSize | Cell size | 0.05–25 log | 4 | 3→6 | wave | Cells: size in tenths of screen height |
| warpCellAngle | Cell rotation | 0–360° | 0 | 0→360 | spin | Cells: rotates pattern |
| warpCellSides | Cell sides | 3–6 (0.01) | 4 | 4→6 | wave | Cells: 3 triangles … 4 squares … 6 hexagons, continuous morph |
| warpCellRandom | Cell randomness | 0–1 | 0.7 | 0.2→0.7 | wave | Cells: jitter of cell points |
| warpMarble | Marbling | 0–6 | 0 | 1→3.5 | wave | Noise: domain-warp marbling |
| warpDetail | Warp detail | 1–6 (1) | 4 | — | none | Noise: fbm octaves (shader loop `i < u_warpDetail`, [shaders.ts:154-163](D:/Code/KaleidoSage/src/engine/shaders.ts#L154)); integer, discrete |
| warpFlow | Warp flow | 0–1 | 0 | 0.05→0.6 | wave | SPEED: integrated into `warpTime` |
| warpCenterX | Warp center X | −1–1 | 0 | −0.3→0.3 | wave | Ripple/Swirl/Bulge center (screen heights) |
| warpCenterY | Warp center Y | −1–1 | 0 | −0.3→0.3 | wave | same |
| warpAngle | Wave angle | 0–360° | 30 | 0→360 | spin | Waves: direction |

#### Algorithm / complex map (group `map`; mode by `mapMode`)
| key | label | range | default | handles | drift | notes |
|---|---|---|---|---|---|---|
| mapMix | Map mix | 0–1 | 1 | 0.4→1 | wave | Blend of mapped vs unmapped |
| mapScale | Zoom | 0.25–1.5 | 1 | 0.5→1 | wave | Map zoom (not Möbius/Julia/Droste) |
| juliaZoom | Zoom | 0.5–1.5 | 0.5 | 0.5→1 **on** | wave | Julia zoom |
| mapPower | Power | 0.5–6 | 2 | 1→3 **on** | wave | Power map z^n exponent |
| juliaShape | Shape | 0–360° | 120 | 0→360 | spin | Julia point angle on Mandelbrot main-body edge |
| juliaEdge | Edge | 0.5–1.5 | 1 | 0.9→1.1 | wave | Julia point in/out of the edge (joined vs broken shapes) |
| juliaFog | Darkness | 0–1 | 0 | 0.3→0.7 | wave | Julia depth darkening |
| juliaFogSoftness | Softness | 0–1 | 0.5 | 0.3→0.7 | wave | Julia darkening gradient |
| mapSteps | Steps | 1–12 (1) | 1 | — | none | Julia iterations (shader loop, [shaders.ts:459](D:/Code/KaleidoSage/src/engine/shaders.ts#L459)); integer, discrete; GPU cost grows with it |
| mapArms | Twist | −8–8 (0.05) | 2 | 1→3 | wave | Seamless spiral twist; copy count is fixed from the range middle (`spiralCopies`, [engine.ts:398-404](D:/Code/KaleidoSage/src/engine/engine.ts#L398)) so jumping outside the range can jump the copy count |
| drosteSize | Copy size | 0.1–0.8 | 0.4 | 0.3→0.5 | wave | Droste: size of the inner copy |
| drosteSpirals | Spirals | −4–4 (0.01) | 1 | −1→1 | wave | Droste spiral arms; non-integers crossfade between nearest integers |
| drosteSoftness | Edge softness | 0–1 | 0 | 0→0.6 | wave | Droste frame edge fade |
| drosteRound | Frame shape | 0–1 | 0 | 0→1 | wave | Rectangle → circle |
| drosteRotation | Rotate (post) | 0–360° | 0 | 0→360 | spin | Turns spiral and frames |
| drostePictureTurn | Rotate (pre) | 0–360° | 0 | 0→360 | spin | Turns picture inside frames |
| mapTwist | Twist | −80–80° | 0 | 10→50 | wave | Log spiral twist |
| mapAngle | Rotation | 0–360° | 270 | 153→207 (ease organic) | spin | Turns the map on screen |
| mapSpeed | Speed | −2–2 | 0.15 | 0.1→0.5 | wave | SPEED: integrated into `mapTravel` (Tunnel, Log spiral, Seamless spiral, Droste zoom-through) |
| tunnelTwist | Twist | −90–90° (0.1) | 0 | −5→5 | wave | Tunnel wall spiral |
| mapPanX / mapPanY | Pan X / Pan Y | −2–2 | 0 | −0.35→0.35 | wave | Map center (not Möbius) |
| mapRoll | Roll | 0–360° | 0 | 0→360 | spin | Power/Julia/Sine: turns image inside shapes |
| mapCurl | Twist | 0–1 (0.001) | 0 | 0→0.2 | wave | Power/Julia/Sine: twist with distance |
| mapFog | Darkness | 0–1 | 0 | 0.3→0.7 | wave | Depth darkening (Log spiral, Tunnel, Seamless spiral) |
| mapFogSoftness | Softness | 0–1 | 0.5 | 0.3→0.7 | wave | same |
| mobiusPoint | Point | 0.66–0.99 | 0.98 | 0.94→0.98 **on** | wave | Möbius pole distance (picture size around pole) |
| mobiusTurn | Rotation | 0–360° | 0 | 0→165 **on**, organic | spin | Möbius picture rotation |
| mobiusRotation | Roll | 0–360° | 66 | 0→66 **on**, organic | spin | Möbius roll |
| mobiusTwist | Twist | 0–1 (0.001) | 0 | 0→0.207 | wave | Möbius twist |
| mobiusZoom | Zoom | 1–5 | 1 | 1→5 | wave | Möbius zoom |
| mobiusPanX / mobiusPanY | Pan X / Pan Y | −2–2 | 0 | −0.35→0.35 | wave | Möbius pan |
| mobiusFog | Darkness | 0–1 | 0 | 0→0.14 | wave | Möbius darkening |
| mobiusFogSoftness | Softness | 0–1 | 0.1 | 0→1 | wave | Möbius darkening gradient |

#### Kaleidoscope (group `kaleidoscope`; `foldMode` 0 Radial / 1 Triangle / 2 Hexagon)
| key | label | range | default | handles | drift | notes |
|---|---|---|---|---|---|---|
| segments | Segments | 0–24 (1) | 0 | 3→8 | wave | Radial wedges; a drifting count moves smoothly between integers; Radial preset sets 10 ([params.ts:1016-1021](D:/Code/KaleidoSage/src/engine/params.ts#L1016)) |
| tileSize | Tile size | 0.1–2 | 0.5 | 0.3→0.8 | wave | Tile modes: cell spacing (screen heights) |
| centerX / centerY | Offset X / Y | −0.5–0.5 | 0 | −0.3→0.3 / −0.25→0.25 | wave | Fold center |
| rotation | Rotation | 0–360° | 0 | 0→360 | spin | Kaleidoscope rotation |
| zoom | Zoom | 0.25–1.5 | 1 | 0.5→1 | wave | Kaleidoscope zoom |
| panX / panY | Pan X / Y | −1–1 | 0 | −0.35→0.35 | wave | Pan over the source image |
| twirl | Twirl | −2–2 | 0 | −1.5→1.5 | wave | Rotation increasing with radius |

#### Blur (group `blur`; mask by `blurMask`)
| key | label | range | default | handles | drift | notes |
|---|---|---|---|---|---|---|
| blurAmount | Blur | 0–100 px@1080p | 0 | 0→40 | wave | Blur radius; when Blur is first in the order, the padded texture grows (realloc, grow-only) ([renderer.ts:2028-2040](D:/Code/KaleidoSage/src/engine/renderer.ts#L2028)) |
| blurMaskSize | Mask size | 0.02–1.5 | 0.35 | 0.15→0.6 | wave | Mask size |
| blurMaskSoft | Softness | 0–1 | 0.5 | 0.2→0.8 | wave | Mask edge |
| blurMaskX / blurMaskY | Mask X / Y | −0.5–0.5 | 0 | −0.3→0.3 | wave | Mask position |
| blurMaskAngle | Mask angle | 0–360° | 90 | 0→360 | spin | Gradient mask direction |
| blurMaskLevel | Level | 0–1 | 0.5 | 0.3→0.7 | wave | Bright/dark area mask brightness |

#### Trails (feedback; group `trails`; `trailMode` 1 mix / 2 lighten)
| key | label | range | default | handles | drift | notes |
|---|---|---|---|---|---|---|
| trailAmount | Trail length | 0–0.98 | 0 | 0.7→0.95 | wave | Feedback keep per 1/60 s (stateful) |
| trailZoom | Zoom | 1–1.03 (0.001) | 1 | 1.002→1.015 | wave | Per-frame grow of old frame (cumulative) |
| trailTurn | Trail turn | −1–1° | 0 | −0.3→0.3 | wave | Per-frame turn (cumulative) |
| trailHue | Trail hue | −10–10° (0.1) | 0 | −3→3 | wave | Per-frame hue shift (cumulative) |
| trailFlow | Trail flow | −100–100 px (0.1) | 0 | 2→8 | wave | Push along brightness slopes |
| trailSwirl | Flow swirl | 0–1 | 1 | 0.3→1 | wave | Along (0) vs around (1) slopes |
| trailTint | Trail tint | 0–1 | 0 | 0→0.6 | wave | Multiply old trails by `trailColor` |

#### Time smear (group `smear`; `smearShape` 0 linear/1 rings/2 sweep/3 brightness/4 noise)
| key | label | range | default | handles | drift | notes |
|---|---|---|---|---|---|---|
| smearAmount | Opacity | 0–1 | 0 | 0.5→1 | wave | Mix |
| smearDelay | Delay | 0.05–3 s | 1 | 0.5→2 | wave | Max delay; 32 history slots, ≤320 MB ([renderer.ts:399-400](D:/Code/KaleidoSage/src/engine/renderer.ts#L399)) |
| smearAngle | Angle | 0–360° | 90 | 0→360 | spin | Linear/Sweep direction |
| smearBands | Bands | 1–12 (0.1) | 1 | 1→4 | wave | Pattern repeats |
| smearRestart | Restart | 0–20 s (0.1) | 0 | — | none | Clears history every N s (0 never) |
| smearFade | Fade | 0–3 s (0.05) | 0.5 | — | none | Fade before restart |

#### Contours (group `contours`; `contourTone` hue/black/white; `contourBlend` 0–7)
| key | label | range | default | handles | drift | notes |
|---|---|---|---|---|---|---|
| contourHue | Color | 0–360° | 0 | 0→360 | spin | Line hue (fully saturated) |
| contourOpacity | Opacity | 0–1 | 0 | 0.4→1 | wave | Line strength |
| contourLines | Density | 2–80 (1) | 16 | 8→30 | wave | Number of levels |
| contourWidth | Line width | 0.5–12 px | 1.5 | 1→4 | wave | Width |
| contourResolution | Resolution | 0–6 (0.1) | 4 | 2→5 | wave | Detail (inverse mip blur) |
| contourSteady | Smooth | 0–0.98 | 0.8 | 0.5→0.9 | wave | Temporal smoothing (stateful) |

#### Relief (group `relief`)
| key | label | range | default | handles | drift | notes |
|---|---|---|---|---|---|---|
| reliefAmount | Relief | 0–1.5 | 0 | 0.3→0.9 | wave | Emboss strength |
| reliefDepth | Relief depth | 0.5–20 (0.1) | 6 | 3→10 | wave | Height scale |
| reliefSize | Relief size | 0.5–6 px | 1.5 | 1→3 | wave | Sample radius |
| lightAngle | Light angle | 0–360° | 135 | 0→360 | spin | Light direction |
| shine | Shine | 0–1 | 0 | 0.1→0.5 | wave | Specular |

#### Driver (group `driver`; `driverSource` 0 caustics/1 smoke/2 ink/3 fire/4 ripples/5 user video; `driverMode` 0 bend/1 reveal/2 light)
| key | label | range | default | handles | drift | notes |
|---|---|---|---|---|---|---|
| driverAmount | Opacity | 0–1 | 0 | 0.5→1 | wave | Mix |
| driverStrength | Strength | 0–1 | 0.5 | 0.3→0.8 | wave | Bend/reveal/light amount |
| driverScale | Size | 0.25–4 log | 1 | 0.7→1.5 | wave | Pattern size |
| driverSpeed | Speed | 0–3 | 1 | 0.5→1.5 | wave | SPEED: integrated into `driverTime`; driver video playbackRate |
| driverContrast | Contrast | 0.5–3 | 1 | 0.8→1.6 | wave | Contrast |

#### Camera (3D flyover; group `camera`; `cameraBlend` 0–7, `cameraRepeat` 0–2, `skyColor`)
| key | label | range | default | handles | drift | notes |
|---|---|---|---|---|---|---|
| cameraAmount | Opacity | 0–1 | 0 | 0.5→1 | wave | Raised land over flat floor |
| cameraHeight | Height | −1–1 | 0.25 | 0.1→0.4 | wave | Land height at white (<0 dark rises) |
| cameraTilt | Tilt | 0–85° | 50 | 20→70 | wave | Tilt from straight down |
| cameraTurn | Turn | 0–360° | 270 | 0→360 | spin | Heading (also flight direction) |
| cameraSpeed | Speed | −2–2 | 0 | 0.1→0.5 | wave | SPEED: integrated into `cameraX/Y` |
| cameraDistance | Distance | 0.3–5 | 1.6 | 1→3 | wave | Camera distance |
| cameraLens | Lens | 20–120° | 60 | 40→90 | wave | Field of view |
| cameraLightTurn | Sun angle | 0–360° | 135 | 0→360 | spin | Sun direction |
| cameraLightHeight | Sun height | 5–90° | 40 | 15→60 | wave | Sun elevation |
| cameraShadow | Shadows | 0–1 | 0.7 | 0.3→1 | wave | Shadow darkness |
| cameraFog | Fog | 0–1 | 0.2 | 0→0.5 | wave | Fog |
| cameraSky | Sky | 0–1 | 0.6 | 0.2→0.8 | wave | Sky/fog color weight |
| cameraShine | Shine | 0–1 | 0 | 0.1→0.5 | wave | Specular |
| cameraSmooth | Smooth | 0–6 (0.1) | 2.5 | 1→4 | wave | Height blur |

#### Pixel sort (group `sort`; `sortOrder` 0/1)
| key | label | range | default | handles | drift | notes |
|---|---|---|---|---|---|---|
| sortAmount | Opacity | 0–1 | 0 | 0.5→1 | wave | Mix; when >0 a full bitonic sort runs (O(log² side) passes, side ≤ 2048) every frame — expensive constant cost ([renderer.ts:1470-1536](D:/Code/KaleidoSage/src/engine/renderer.ts#L1470)) |
| sortLow / sortHigh | Low / High | 0–1 | 0.25 / 0.8 | 0.15→0.4 / 0.6→0.95 | wave | Brightness window |
| sortAngle | Angle | 0–360° | 270 | 0→360 | spin | Sort direction |
| sortLength | Length | 0.02–1 | 1 | 0.1→0.5 | wave | Max run length |
| sortThickness | Thickness | 1–64 px log | 1 | 2→16 | wave | Line width |

#### Particles (group `particles`; `particleBlend` 0 glow/1 normal; `particleStops` gradient)
| key | label | range | default | handles | drift | notes |
|---|---|---|---|---|---|---|
| particleAmount | Opacity | 0–1 | 0 | 0.5→1 | wave | Mix |
| particleBackground | Background | 0–1 | 1 | 0→1 | wave | Picture under particles |
| particleCount | Count | 100–1,048,576 log | 4000 | 1000→10000 | wave | GPU cost scales with count (state textures 1024², [renderer.ts:390, 1396, 1453](D:/Code/KaleidoSage/src/engine/renderer.ts#L390)); growing re-uses stale rows |
| particleLevel | Threshold | 0–1 | 0.6 | 0.4→0.8 | wave | Brightness needed to emit |
| particleSize | Size | 0.5–40 px log | 4 | 2→8 | wave | Dot size |
| particleLife | Life | 0.2–10 s | 2.5 | 1→4 | wave | Lifetime |
| particleSpeed | Speed | 0–0.2 (0.001) | 0.15 | 0.05→0.2 | wave | Start speed |
| particleGravity | Gravity | −1–1 | 0.1 | −0.2→0.2 | wave | Pull toward Direction |
| particleAngle | Direction | 0–360° | 270 | 0→360 | spin | Gravity direction |
| particleTurbulence | Turbulence | 0–2 | 0.3 | 0.1→0.8 | wave | Noise push |
| particleDrag | Drag | 0–5 | 1 | 0.5→2 | wave | Slowdown |
| particleFollow | Follow | 0–1 | 0 | 0→1 | wave | Turn toward picture edges |
| particleCling | Focus | 0–1 | 0 | 0→1 | wave | Pull to edge centers |
| particleGradient | Gradient | 0–1 | 0 | 0→1 | wave | Color from life gradient vs picture |
| particleBoost | Boost | 1–8 | 1 | 1→4 | wave | Brightness/coverage per dot |

#### Light rays, Bloom, finish (Sharpen, Color, Levels)
| key | label | range | default | handles | drift | notes |
|---|---|---|---|---|---|---|
| raysAmount | Strength | 0–4 | 0 | 0.8→2 | wave | Ray light (half-res pass) |
| raysThreshold | Threshold | 0–1 | 0.6 | 0.4→0.8 | wave | Brightness start |
| raysLength | Length | 0–1 | 0.4 | 0.2→0.7 | wave | Ray reach |
| raysFade | Fade | 0–1 | 0.5 | 0.2→0.8 | wave | Falloff |
| raysX / raysY | Center X / Y | −0.5–0.5 | 0 | −0.3→0.3 / −0.25→0.25 | wave | Ray center |
| bloomAmount | Strength | 0–3 | 0 | 0.5→1.5 | wave | Glow amount |
| bloomThreshold | Threshold | 0–1 | 0.6 | 0.4→0.8 | wave | Glow start |
| bloomSoftness | Softness | 0–1 | 0.3 | 0.1→0.6 | wave | Knee |
| bloomSize | Size | 1–6 (0.1) | 3 | 2→5 | wave | Spread; level count derived per frame, no realloc ([renderer.ts:1617-1621](D:/Code/KaleidoSage/src/engine/renderer.ts#L1617)) |
| sharpen | Sharpen | 0–3 | 0 | 0.2→1 | wave | Unsharp amount |
| sharpenRadius | Sharpen radius | 0.5–4 px | 1 | 0.8→2.5 | wave | Radius |
| overlayOpacity | Color overlay | 0–1 | 0 | 0→0.5 | wave | `overlayColor` blended by `colorBlend` |
| exposure | Exposure | −6–3 EV (0.05) | 0 | −1.5→0 | wave | Brightness in stops (good for flashes/blackouts) |
| blackLevel | Black level | 0–0.9 | 0 | 0→0.3 | wave | Crush blacks |

- Zero points ("no effect" value inside the slider) are listed in `NO_EFFECT` — [params.ts:703-713](D:/Code/KaleidoSage/src/engine/params.ts#L703)
- Common roles (shared Pan X / Pan Y / Zoom / Rotation / Opacity across effects; a MIDI control on one moves all of that role) — [src/engine/common.ts:20-38](D:/Code/KaleidoSage/src/engine/common.ts#L20)
- Every frame value is smoothed: single values glide to slider values with `GLIDE_SECONDS = 0.03`; MIDI-driven values follow a critically damped spring `MIDI_SMOOTH_SECONDS = 0.1` — [engine.ts:14-49, 655-703](D:/Code/KaleidoSage/src/engine/engine.ts#L14)

### Inferences
- "Cheap vs expensive to change abruptly" (from the render code): almost all continuous params are shader uniforms and cost nothing to change per frame. Visual abruptness is the real issue: positions/zoom/rotation jumps read as cuts; feedback params (trailZoom, trailTurn, trailHue, trailAmount) and speeds (warpFlow, mapSpeed, driverSpeed, cameraSpeed) act cumulatively, so they are best scripted as rates or smooth curves. GPU-heavy ones: `particleCount` (up to ~1M points), Pixel sort being on at all, `mapSteps` (Julia loop), `warpDetail` (octaves), large `blurAmount` (first time grow-only realloc), `smearDelay` (memory fixed, cheap to change). Integer-only params (`warpDetail`, `mapSteps`, `segments` at rest, `contourLines`) step visibly unless crossfaded; `segments` and `drosteSpirals` already blend between integers when moving.
- Good beat/impact targets (instant and legible): exposure, bloomAmount, raysAmount, zoom/mobiusZoom/mapScale, warpAmount, particleBoost/particleSpeed, overlayOpacity, contourOpacity, trailAmount. Good slow/phrase-level targets: rotation-family spins, hue (contourHue, trailHue), mapAngle, cameraTurn, drosteSize, juliaShape, segments.

### Gaps
- No measured GPU timings per parameter are in the repo (there is a GPU timer and stats overlay, `src/engine/gpuTimer.ts`, `StatsOverlay.tsx`, but no stored numbers).

## Q6. Discrete settings (modes, toggles, order, colors) and the cost of switching them

### Takeaway
The look also depends on non-numeric `PlayState` fields: which effects are on and their order (`groups`, `fxOrder`), submodes (`foldMode`, `warpType`, `mapMode`, `blurMask`, `smearShape`), blend modes, colors and gradient stops. These are not rangeable, not audio-linkable and not MIDI-mappable today. Changing them is a hard cut; turning stateful effects on resets their state.

### Cited Findings
- `PlayState` fields: `groups`, `locks`, `blendMode` (0 crossfade, 1 dissolve), `tiling` (0 auto, 1 mirror, 2 repeat), `warpMode`, `warpType` (0 noise, 1 ripple, 2 waves, 3 swirl, 4 bulge/pinch, 5 cells), `mapMode` (1 power, 2 Möbius, 3 Julia, 4 log spiral, 5 sine, 6 tunnel, 7 seamless spiral, 8 Droste; default 8), `foldMode` (0 radial, 1 triangle, 2 hexagon; default 2), `fxOrder`, `layerBlend` per shape step (0 normal, 1 screen, 2 multiply, 3 overlay, 4 difference, 5 lighten, 6 darken, 7 add), `audioLinks`, `audioRelease`, `blurMask` 0–5, `trailMode` (0 off, 1 mix, 2 lighten), `overlayColor`, `colorBlend` 0–7, `trailColor`, `smearShape` 0–4, `contourTone`, `contourBlend`, `cameraBlend`, `skyColor`, `cameraRepeat` 0–2, `sortOrder` 0/1, `particleBlend` 0/1, `particleStops` (2–8 stops), `driverSource` 0–5, `driverMode` 0–2, accumulators `warpTime`, `mapTravel`, `cameraX/Y`, `driverTime`, `videoCrossfade`, `paused`, `time`, `clock` — [params.ts:256-342, 779-785](D:/Code/KaleidoSage/src/engine/params.ts#L256); enums — [renderer.ts:5-59](D:/Code/KaleidoSage/src/engine/renderer.ts#L5)
- Effects (17 steps): shape steps warp, map, kaleidoscope; picture steps blur, trails, smear, contours, relief, driver, camera, sort, particles, rays, bloom, sharpen, color, levels. User-ordered; adjacent shape steps join into one pass; sharpen/color/levels join into one finish pass — [renderer.ts:16-36, 768-830](D:/Code/KaleidoSage/src/engine/renderer.ts#L16); names — [submodes.ts:5-8](D:/Code/KaleidoSage/src/engine/submodes.ts#L5)
- Which sliders matter under each submode (`KALEIDOSCOPE_KEYS`, `BLUR_KEYS`, `WARP_KEYS`, `MAP_KEYS`, `SMEAR_KEYS`, `isShown`) — [submodes.ts:19-100](D:/Code/KaleidoSage/src/engine/submodes.ts#L19)
- Stateful effects reset when they turn on: the renderer tracks `trailsWereOn`, `contoursWereOn`, `smearWasOn`, `particlesWereOn` and restarts them (particles get `u_reset`, smear history clears) — [renderer.ts:459-501, 912-915, 1325-1329](D:/Code/KaleidoSage/src/engine/renderer.ts#L459)
- A step with zero strength is skipped (no GPU pass), e.g. `particles: v.particles > 0`, `sort: v.sort > 0` — [renderer.ts:782-803](D:/Code/KaleidoSage/src/engine/renderer.ts#L782)
- Randomize/Nudge/Reset/group Randomize exist as one-shot look generators with per-effect probabilities (`EFFECT_CHANCE`) and per-param random rules — [params.ts:943-1356](D:/Code/KaleidoSage/src/engine/params.ts#L943)

### Inferences
- A script can switch discrete settings only at strong musical boundaries (downbeats, section starts) and should hide the cut with the existing scene crossfade (`Engine.fadeOut`) or by ramping the effect's opacity/strength to zero first, since a strength of zero removes the pass entirely and the turn-on resets state.
- Randomize's rules (sensible value ranges and spreads per param) are a ready-made "safe range" table for an automatic script generator.

### Gaps
- `renderer.ts:9` comment lists map modes 0–6 only; modes 7 (Seamless spiral) and 8 (Droste) are defined in `submodes.ts:62`. Minor doc drift.

## Q7. Existing presets, scenes, playlists, timelines, automation

### Takeaway
There is no timeline, keyframe or automation track. The containers are: the scene (`.ksage`: all params with range/ease/custom timing, play state, images/videos, audio links) and the playlist (`.ksplaylist`: ZIP of `playlist.json` + scenes in tab order + audio tracks). The only "time structure" is scene order + Length + track boundaries. Undo history and fingerprints already cover audio links.

### Cited Findings
- Scene file: JSON with `app`, `version` 3, `params` (value, low, high, on, ease, custom, seconds, startTime per key), `state` (all modes, colors, times, `effects`, `layerBlend`, `audioLinks`, `audioRelease`), `image`, `image2`, optional driver video; tolerant reader clamps and skips unknowns — [scene.ts:26-63, 137-276](D:/Code/KaleidoSage/src/engine/scene.ts#L26)
- Playlist file: ZIP64 with `playlist.json` (`audio` {kind, device, gainDb, thresholdDb}, `activeScene`, `layout.filesWidth`, `trackSeconds`), `scenes/<n>/<name>.ksage`, `tracks/<n>/<name>`; unpacked to a temp folder on open — [src/lib/playlistFile.ts:26-104](D:/Code/KaleidoSage/src/lib/playlistFile.ts#L26); [docs/AUDIO.md:280-310](D:/Code/KaleidoSage/docs/AUDIO.md#L280); Rust `src-tauri/src/playlist_archive.rs`
- Scenes and tracks are independent lists; there is no per-track scene assignment and no per-track data — [playlistFile.ts:29-37](D:/Code/KaleidoSage/src/lib/playlistFile.ts#L29)
- MIDI pads/one-shot "Shots" were designed but not built (no note handling in `midi.ts`) — [docs/MODULATION.md:163-192](D:/Code/KaleidoSage/docs/MODULATION.md#L163); grep of `midi.ts` finds no pad/shot code

### Inferences
- The natural home for a precomputed instruction track is per track (song), stored in the playlist ZIP next to each track (e.g. `tracks/<n>/<name>.kscript.json`), referencing scenes by index and `ParamKey`s by name; scenes become the "palette" the script animates. `readManifest`/`writeManifest` are tolerant of unknown fields, so a new entry is backward-compatible.
- Scene `params` already store a value plus a `low→high` span per key; a script can express targets as normalized 0–1 positions inside each scene's handles (as audio links and MIDI playheads do), keeping scripts reusable across scenes.

### Gaps
- No existing format for time-stamped events anywhere in the code.

## Q8. Frame-loop architecture and how a time-indexed control track would be sampled

### Takeaway
One `Engine` owns params, state and a `requestAnimationFrame` loop. Each frame: compute real `elapsed` (capped 0.1 s) → `step()` advances clock, animation time and accumulators → `glide()` (slider/MIDI smoothing) → `followAudio()` → sync videos → `frameValues()` calls `live(key)` for every param → `needsDraw()` → `renderer.render()` → crossfade overlay → frame listeners. A control track would be sampled once per frame at song time and injected in `live()`.

### Cited Findings
- Loop: `frame(now)` — [engine.ts:868-900](D:/Code/KaleidoSage/src/engine/engine.ts#L868)
- `step(elapsed)`: `clock += elapsed` and `time += elapsed × speed` unless paused; accumulators integrate `live()` values — [engine.ts:842-858](D:/Code/KaleidoSage/src/engine/engine.ts#L842)
- `live(key)`: bypass → `liveValue` → glide/hold → audio push — [engine.ts:627-643](D:/Code/KaleidoSage/src/engine/engine.ts#L627)
- `frameValues`: builds the full `FrameValues` (≈150 fields) from `live()` and state; groups off give neutral values — [engine.ts:908-1108](D:/Code/KaleidoSage/src/engine/engine.ts#L908)
- While paused, unchanged frames are skipped after `SETTLE_MS` (1 s; 6 s with smear) — [engine.ts:764-790](D:/Code/KaleidoSage/src/engine/engine.ts#L764)
- External writers notify rows through `onParamChange`/`paramChanged`; the control panel's live readouts read the engine per frame, not React state — [engine.ts:816-831](D:/Code/KaleidoSage/src/engine/engine.ts#L816); [CLAUDE.md](D:/Code/KaleidoSage/CLAUDE.md)
- Export uses an off-screen engine copy (`forExport`) stepped deterministically with substeps, then `draw()` — [engine.ts:152-186](D:/Code/KaleidoSage/src/engine/engine.ts#L152); [videoExport.ts:334-470](D:/Code/KaleidoSage/src/lib/videoExport.ts#L334)
- Engine keeps the audio pointer as `engine.audio: AudioSignal | null`, set by the app — [engine.ts:426-431](D:/Code/KaleidoSage/src/engine/engine.ts#L426)

### Inferences
- Minimal integration: add `engine.script: { sample(key, t): number | undefined; events(t0, t1) } | null` and `engine.songTime` set each frame from `tracks.position`; in `live(key)`, when the script defines `key`, return its value (after optional glide) instead of `liveValue`; process discrete events between last and current song time in `frame()` before `frameValues`. Keep MIDI holds as a live override on top if desired.
- Song-time sampling may need to smooth the audio clock (extrapolate `currentTime` with `performance.now()` between updates, and correct for output latency); nothing in the code does this today. The update granularity of `currentTime` in WebView2 was not checked (see Gaps).

### Gaps
- No measurement in the repo of `HTMLAudioElement.currentTime` jitter or WebView2 audio output latency.

## Q9. Audio file formats and offline analysis on the Rust side; crates in use

### Takeaway
Accepted audio files: mp3, wav, flac, ogg, opus, m4a, aac (both in Rust and the Open dialog). Rust can read the file bytes (it opens and streams them) but has no audio decoder crate; decoding happens only in the webview's media stack during playback. Offline analysis could be done in the webview (`decodeAudioData`/`OfflineAudioContext` on the streamed file, then run analysis in a worker) or in Rust by adding a decoder crate (e.g. symphonia) or via the Windows media APIs the app already links for video transcoding.

### Cited Findings
- Rust audio extensions `["mp3","wav","flac","ogg","opus","m4a","aac"]` — [src-tauri/src/files.rs:26-31](D:/Code/KaleidoSage/src-tauri/src/files.rs#L26); MIME mapping mp3→audio/mpeg, wav→audio/wav, flac→audio/flac, ogg/opus→audio/ogg, m4a/aac→audio/mp4 — [video_stream.rs:46-50](D:/Code/KaleidoSage/src-tauri/src/video_stream.rs#L46); UI hint — [src/components/OpenDialog.tsx:157](D:/Code/KaleidoSage/src/components/OpenDialog.tsx#L157)
- Rust crates: tauri 2, tauri-plugin-dialog, tauri-plugin-window-state, serde/serde_json, anyhow, futures-util, zip 9 (no default features), tempfile, tokio (fs, io-util), reqwest 0.12 (rustls), tauri-plugin-single-instance, `windows` 0.61.3 with features incl. `Win32_Media_Audio`, `Media_MediaProperties`, `Media_Transcoding`, `Storage`, `Storage_Streams`, `Win32_System_WinRT` — [src-tauri/Cargo.toml](D:/Code/KaleidoSage/src-tauri/Cargo.toml)
- `Media_Transcoding` is used by `video_import.rs` (`MediaTranscoder`, `MediaEncodingProfile::CreateMp4`) to convert unsupported videos — [src-tauri/src/video_import.rs:84-127](D:/Code/KaleidoSage/src-tauri/src/video_import.rs#L84)
- JS deps: react 19, @tauri-apps/api 2, plugin-dialog, plugin-window-state, `mp4-muxer` 5.2.2 (export); no audio/DSP library — [package.json](D:/Code/KaleidoSage/package.json)
- Track lengths are read from file headers via a metadata-only `<audio>` element and cached in the playlist (`trackSeconds`) — [tracks.ts:75-100](D:/Code/KaleidoSage/src/lib/tracks.ts#L75)
- Large media never crosses IPC (bounded 2 MB chunk reads via the `video://` protocol) — [video_stream.rs:1, 15](D:/Code/KaleidoSage/src-tauri/src/video_stream.rs#L1)

### Inferences
- Webview path needs no new dependency: fetch the `video://` URL, `decodeAudioData`, then analyze in a Web Worker (reusing `AudioAnalyzer` for band envelopes plus new beat/section code). Rust path (symphonia + own DSP, or Windows MediaFoundation decode) gives faster, off-main-thread analysis and works with large files; either way results can be cached per file (hash) in the app cache dir, like `video-import`.
- Per global rule 5 in the user's CLAUDE.md, any new external service key must not be embedded in plaintext; an offline analysis that is local avoids that issue.

### Gaps
- Whether WebView2's `decodeAudioData` handles all seven formats (especially Opus-in-OGG and raw AAC) was not tested here.

## Q10. MIDI integration (Launchkey) and reusable mapping layers

### Takeaway
MIDI uses Web MIDI in the webview (no Rust). A control maps to one or more `ParamKey`s (macro), per controller name, stored in `localStorage`. Knob moves are relative with value scaling; on a ranged param the knob moves a held "playhead" between the handles; values follow a damped spring. These pieces — normalized position inside a param's span, `holdRange`/`resumeRange` with a smooth curve back into the range, `follow` spring, submode awareness (`isShown`), common-role macros, `onParamChange` — are reusable for a script driver.

### Cited Findings
- Map type `MidiMap = Record<device, Record<"channel:cc", ParamKey[]>>`, key `kaleidosage.midi-map`; `cycle` not mappable — [midi.ts:14-37](D:/Code/KaleidoSage/src/lib/midi.ts#L14)
- Learn, macro add, turn logic, ranged playhead hold, Ctrl stretch, `isShown` skip — [midi.ts:480-560](D:/Code/KaleidoSage/src/lib/midi.ts#L480)
- Engine side: `holdRange`, `heldValue`, `resumeRange` with `RESUME_SECONDS = 2` cubic Hermite arriving at the range's own speed, `stretchRange`, `follow` spring, `releaseHolds`, `settle` — [engine.ts:500-620](D:/Code/KaleidoSage/src/engine/engine.ts#L500)
- 14-bit pairs and relative encoders auto-detected; Launchkey knobs CC 21–28 on channel 1 shown as Knob 1–8 — [docs/MODULATION.md:85-152, 159-161](D:/Code/KaleidoSage/docs/MODULATION.md#L85)
- Common settings macro: one control moves the same role in every effect — [src/engine/common.ts:1-38](D:/Code/KaleidoSage/src/engine/common.ts#L1)
- Memory note: stop the dev app before Novation Components runs (MIDI port conflict) — user memory index `MEMORY.md`.

### Inferences
- `playheadValue(param, position)` / `playheadPosition` (normalized 0–1 within handles, log-aware) is exactly the mapping a script needs to turn "intensity 0–1" into a param value inside each scene's chosen span; `planResume` is a ready "hand control back to the range/script smoothly" mechanism, useful when a live MIDI move should temporarily override the script.

### Gaps
- None found beyond the unbuilt pads/shots.
