# Visual Mapping Practice: Turning Music Analysis into Good-Looking Animation

Scope: how professional and research music-visualization systems map musical features to visual parameters (the mapping layer, the curves, the timeline/instruction formats). Research date: 2026-10-21. About 20 tool calls; several vendor docs give no numeric constants, which is noted in Gaps.

## 1. How leading tools handle audio reactivity and automation (incl. SoundSwitch / rekordbox phrase-based prior art)

### Takeaway
Live VJ tools converge on the same small vocabulary of pre-conditioned signals: per-band *level* (smoothed, normalized 0-1 or "1.0 = normal"), per-band *hits/transients* (spike and decay), slow *presence/intensity* trackers, *audio-driven clocks* (time that runs faster when loud), and *beat-phase oscillators* locked to BPM. The lighting world (rekordbox Phrase Analysis, SoundSwitch AutoScripting) adds the key missing layer: offline classification of the track into labeled phrases on the beat grid, with a different pre-built look per phrase type. That two-layer split (section label picks the scene; conditioned signals modulate within it) is the strongest prior art for an offline auto-instruction generator.

### Cited Findings

**Synesthesia (synesthesia.live) audio uniforms** — all from [Synesthesia SSF audio uniforms docs](https://app.synesthesia.live/docs/ssf/audio_uniforms.html):
- Five bands: overall, Bass, Mid, MidHigh, High. For each band there are four signal families: `Level`, `Hits`, `Time`, `Presence` (e.g. `syn_BassLevel`, `syn_BassHits`, `syn_BassTime`, `syn_BassPresence`).
- `Level`: loudness per band, normalized 0.0-1.0 "with some added smoothing to reduce jitter."
- `Hits`: 0.0-1.0, spike "during the isolated transients" (onset/transient channel separate from level).
- `Time`: accumulating clocks "that move forward when the volume of a specific frequency band is high" — i.e. audio drives *speed*, integrated into *position*, so motion never jumps backward. `syn_CurvedTime` "responds to volume increases with much higher acceleration."
- `Presence`: tracks rising/falling sustained activity "without reacting to each individual sound" (a slow, meso-scale envelope).
- Beat family: `syn_OnBeat` (1.0 at beat, falls quickly to 0), `syn_ToggleOnBeat` (alternates 0/1 per beat, transitions "smoothed using a logistic curve"), `syn_RandomOnBeat` (new random value per beat, logistic transition), `syn_BeatTime` (+1 per beat).
- BPM family: `syn_BPM` (50-220), `syn_BPMConfidence` (near 1 when tempo stable), `syn_BPMTwitcher` (increments each beat and "exponentially 'jumps'" to the next beat; use `floor()` for a clock, `fract()` for per-beat motion), `syn_BPMSin/Tri` and `/2`, `/4`, `/8` subdivisions (waves at 1, 1/2, 1/4, 1/8 of beat rate = beat, half-bar, bar, 2-bar phase).
- Song-scale: `syn_FadeInOut` (slowly rises to 1 as music starts, falls at end), `syn_Intensity` (slowly accumulates toward 1 based on song intensity).
- FFT texture `syn_Spectrum` has Raw, "Juiced" (bin smoothing + temporal smoothing + log frequency scaling + high-end boost; recommended default), and Smooth channels; `syn_LevelTrail` gives level history.
- No time constants are published.

**MilkDrop / projectM** — [MilkDrop preset authoring guide (geisswerks)](https://www.geisswerks.com/milkdrop/milkdrop_preset_authoring.html):
- `bass`, `mid`, `treb` are "immediate info about audio levels"; "1 is normal; below ~0.7 is quiet; above ~1.3 is loud" — i.e. values are relative (self-normalizing), not absolute dB.
- `bass_att`, `mid_att`, `treb_att` are "damped in time and doesn't change so rapidly" — the slow twin of each band.
- Guide suggests comparing `bass` vs `bass_att` (ratio > 1 = bass is spiking): a cheap transient detector (fast/slow envelope ratio).

**TouchDesigner** — [Lag CHOP docs](https://docs.derivative.ca/Lag_CHOP); [Audio Analysis palette component](https://derivative.ca/UserGuide/Palette:audioAnalysis):
- Lag CHOP has separate *lag up* and *lag down* times (asymmetric attack/release); the value is approximately the time the output takes to follow 90% of an input change. Filter CHOP is the gentler alternative.
- Audio Analysis component outputs Low/Mid/High level, Kick and Snare detection, Rhythm, Spectral Centroid; each band has threshold, smooth, gain, add parameters.
- Community practice: kick/snare outputs are clean 0/1 triggers good for events; mids/highs give smoother signals for continuous motion — [Edinburgh DMSP blog](https://blogs.ed.ac.uk/dmsp-process25/?p=369) (one author's example: Lag Up 1.2 s, Lag Down 3.0 s on a mic level — illustrative only, not a standard).

**Parseq (Deforum / ComfyUI keyframing)** — [Parseq README](https://github.com/rewbs/sd-parseq):
- Keyframe grid: each row a keyframe; each parameter has a value column and an interpolation-formula column; formula persists until the next keyframe that sets one. Optional "info" label per keyframe; keyframes can be locked to beats or seconds.
- Interpolators: `L` linear (default), `S` step, `C` cubic spline, `P` polynomial, `bez(x1,y1,x2,y2, from, to, in, os, c="easeOut")` (default control points `bez(0.5,0,0.5,1)`), `slide(to, from, in, os)`.
- Oscillators `sin/sq/tri/saw/pulse(p=4b, a, ps, c, li, pw)` with unit suffixes `f`, `s`, `b` (frames, seconds, beats) and converters `f2b`, `b2f`, `f2s`, `s2f`. Context vars include `k` (frames since active keyframe), `b`, `s`, `active_keyframe_value`, `next_keyframe_value`, `prev_computed_value`.
- Label logic: `info_match()`, `info_match_count()`, `info_match_last()`, `info_match_next()` (frame of next matching label → lets curves *anticipate* the next labeled event).
- Audio: AubioJS event (onset) detection with optional biquad filter, threshold and silence level; detected events become labeled keyframes. Pitch and amplitude are extracted as time series (abs, clamp, normalize; decimated to ≤2000 points) and referenced by alias in formulas. CSV `timestamp,value` import. Global ms offset for audio events ([Parseq change log](https://github.com/rewbs/sd-parseq/wiki/Parseq-change-log)).
- Output to Deforum is per-frame *deltas* (difference to previous frame), but *ratios* for multiplicative params like zoom — a useful detail for zoom in a kaleidoscope (zoom should be animated in log space).

**rekordbox Lighting mode / Phrase Analysis**:
- Workflow: assign fixtures, analyze phrases, then play phrase-analyzed tracks; "Without phrase analysis, you cannot perform lighting in sync" — [rekordbox lighting FAQ](https://rekordbox.com/en/support/faq/lighting-6/).
- Mood is "a classification of music based on audio information including tempo, rhythm, kick drum and sound density", classified HIGH/MID/LOW — [rekordbox lighting FAQ](https://rekordbox.com/en/support/faq/lighting-5/).
- Phrase labels: intro/outro; "up" = buildups and brighter, higher-frequency passages; "down" = quieter stretches like breakdowns; "chorus" = big drops and refrains — [Digital DJ Tips RB-DMX1 review](https://www.digitaldjtips.com/reviews/rbdmx1/).
- Stored format (reverse-engineered, PSSI tag): header has Mood (1 High, 2 Mid, 3 Low), entry count, end beat, Bank (0 Default/Cool, 1 Cool, 2 Natural, 3 Hot, 4 Subtle, 5 Warm, 6 Vivid, 7 Club 1, 8 Club 2). Each 24-byte entry: index, start *beat number*, kind, variant flags k1/k2/k3, extra beats, fill flag and fill-start beat. Kinds by mood — High: Intro, Up (1-3), Down, Chorus (1-2), Outro; Mid: Intro, Verse 1-6, Bridge, Chorus, Outro; Low: Intro, Verse 1-2, Bridge, Chorus, Outro — [Deep Symmetry rekordbox ANLZ analysis](https://djl-analysis.deepsymmetry.org/rekordbox-export-analysis/anlz.html). Note: phrases are addressed by beat index on the beat grid, not seconds; the "fill" field marks the transition beats at the phrase end (the place for a pre-change fill/anticipation effect); "Bank" is a global style/palette for the track.

**SoundSwitch (inMusic)**:
- v2.2 added phrase detection: detects intros/outros, "main one and two" sections, middle and bridge sections, and identifies drops, breakdowns and build-ups within sections; AutoScripting then "builds light shows specific for each Phrase and Section type" — [Engine DJ community announcement](https://community.enginedj.com/t/soundswitch-v2-2-now-available/20655).
- v2.8: categories Intro, Main 1 (higher-energy, chorus-like), Main 2 (verse-like), Middle (e.g. pre-chorus), Bridge, Outro; users can lengthen/shorten phrases, turn individual ones on/off, and apply different AutoScript results to verses vs choruses; improved batch scripting and new styles — [Bonedo review (German)](https://www.bonedo.de/artikel/soundswitch-2-8-lighting-software-bringt-phrasenbearbeitung-verbessertes-batch-scripting-und-neue-styles/).
- Autoloops (for unscripted tracks) are 32 prebuilt beat-synced scene loops; they do not analyze structure — [rekkerd.org](https://rekkerd.org/?p=154760).

**MaestroDMX**: retailer copy says it interprets tempo, intensity and dynamic shifts; detects calm passages / spoken breaks and reduces lighting; users can define static non-reactive looks for quiet moments and curated palettes — [Gear4music](https://gear4music.ie/PA-DJ-and-Lighting/MaestroDMX-Automated-AI-DMX-Lighting-Controller/6PN2), [Simply Sound and Lighting](https://www.simplysoundandlighting.co.uk/products/maestro-dmx-lighting-designer-in-a-box). No technical detail published.

**Theatre.js**: `sheet.sequence.attachAudio({ source })` fetches/decodes audio and plays it in sync with the sequence; can pass your own `audioContext`, `AudioBuffer`, `destinationNode` — [Theatre.js audio manual](https://www.theatrejs.com/docs/latest/manual/audio). Studio exports project state as JSON, reloaded via `getProject(..., { state })` — [Codrops Theatre.js tutorial](https://tympanus.net/codrops/2023/03/30/mastering-theatre-js-animations-learn-to-create-dynamic-visuals/).

**Beat Saber lightshow format**: v3 maps hold lighting as beat-timed event arrays; `colorBoostBeatmapEvents` entries are `{beat, on/off}` and swap environment colors to a secondary pair (a whole-palette "boost" switch); v3 light color event boxes have brightness distribution modes Wave/Step across fixture IDs and per-event easing — [bsmg.wiki lightshow format](https://bsmg.wiki/mapping/map-format/lightshow.html), [kvl/bsmap v3 docs](https://jsr.io/@kvl/bsmap/doc/~/v3).

### Inferences
- The common design is: *section label → scene/preset/palette* (macro), *slow envelope (presence/intensity/_att) → continuous parameters* (meso), *hits/onsets/beat phase → short decaying pulses* (micro). The kaleidoscope's current "level detection with manual routing" lacks the macro layer and the separate hit vs. presence channels.
- Synesthesia's `*Time` clocks are directly applicable to kaleidoscope rotation: drive rotation *speed* from level and integrate, instead of driving *angle* from level (which jitters and reverses).
- rekordbox/SoundSwitch store phrases in *beats*, not seconds. The instruction schema should key events to the beat grid with a seconds lookup, so curves stay musically aligned.
- Bank/Mood in rekordbox ≈ a global "style" choice per track; for KaleidoSage this maps to a per-track palette/FX set chosen from mood (energy, valence) features.

### Gaps
- No vendor publishes Synesthesia smoothing/decay constants, MilkDrop `_att` time constant (in the guide), SoundSwitch's detection algorithm or script file format, or MaestroDMX's model. SoundSwitch's script format is proprietary; I found no public spec.
- Resolume, VDMX, Notch, Plane9, NestDrop, Magic Music Visuals, Cavalry, After Effects "Convert Audio to Keyframes", Engine DJ lighting, Kaiber/Neural Frames: not fetched within budget. From general knowledge (unverified here): AE's Convert Audio to Keyframes creates per-frame "Both Channels" amplitude keyframes with no smoothing; Resolume offers FFT bands with gain/fall controls and BPM-synced parameter envelopes. Verify before citing.
- Blender's Graph Editor "Sound to Samples" (bake sound to F-curve) has attack/release/threshold/accumulate/additive/square options; I could not retrieve the docs page with defaults.
- Parseq output JSON key names (e.g. `rendered_frames`) are not documented in the README.

## 2. Signal conditioning best practice

### Takeaway
Good-looking reactivity depends more on conditioning than on features: asymmetric attack/release envelopes (fast up, slow down), self-normalization relative to a running average (MilkDrop "1.0 = normal"), separate fast and slow versions of each band (their ratio = transient), triggers with thresholds, and audio driving *rate* (integrated clocks) rather than *position*. Offline analysis adds what live tools can't do: whole-track percentile normalization and look-ahead (anticipation, pre-drop ramps).

### Cited Findings
- Asymmetric envelopes are a first-class primitive: Lag CHOP lag-up/lag-down, defined as ~time to follow 90% of a change — [Lag CHOP](https://docs.derivative.ca/Lag_CHOP).
- Relative normalization: MilkDrop bands where 1 = normal, <0.7 quiet, >1.3 loud; fast vs attenuated twins; `bass/bass_att > 1` indicates a spike — [MilkDrop authoring guide](https://www.geisswerks.com/milkdrop/milkdrop_preset_authoring.html).
- Perceptual scaling: Synesthesia's recommended FFT uses log frequency scaling, bin + temporal smoothing and high-end boosting (pink-ish tilt compensation) — [Synesthesia docs](https://app.synesthesia.live/docs/ssf/audio_uniforms.html).
- Smoothed triggers: Synesthesia's per-beat toggles/randoms use logistic (S-curve) transitions rather than hard steps; `syn_BPMTwitcher` jumps exponentially to the next beat — [Synesthesia docs](https://app.synesthesia.live/docs/ssf/audio_uniforms.html).
- Beat phase as a control signal: `syn_BPMSin/Tri` at 1, 1/2, 1/4, 1/8 beat rates; `fract(beatTime)` for in-beat phase — [Synesthesia docs](https://app.synesthesia.live/docs/ssf/audio_uniforms.html). Parseq oscillators with periods in beats (`sin(p=4b)`) and phase shift `ps=-active_keyframe` to re-phase at each keyframe — [Parseq README](https://github.com/rewbs/sd-parseq).
- Look-ahead in a keyframe language: Parseq `info_match_next()` returns the frame of the next labeled event, and `next_keyframe_value` is available, so a ramp can begin before an event — [Parseq README](https://github.com/rewbs/sd-parseq).
- Multiplicative params (zoom) handled as ratios, not differences — [Parseq README](https://github.com/rewbs/sd-parseq).
- Quiet-section handling: MaestroDMX detects calm passages and reduces output, with optional static non-reactive looks — [Gear4music](https://gear4music.ie/PA-DJ-and-Lighting/MaestroDMX-Automated-AI-DMX-Lighting-Controller/6PN2).
- Triggers vs continuous: kick/snare as binary triggers; mids/highs smoother for continuous control; per-band threshold/smooth/gain — [TouchDesigner Audio Analysis](https://derivative.ca/UserGuide/Palette:audioAnalysis), [DMSP blog](https://blogs.ed.ac.uk/dmsp-process25/?p=369).

### Inferences (recommended concrete practice for an offline pipeline; numbers are engineering defaults, not sourced)
- Envelope follower per band: attack 5-30 ms for hit channels, 50-150 ms for level; release 150-400 ms for hits, 0.5-2 s for level, 2-8 s for "presence/intensity". One-pole coefficient a = exp(-1/(τ·fps)).
- Normalize offline per track: map band energy in dB to 0-1 using the track's 5th-95th (or 10th-98th) percentile, then apply a soft-knee compressor curve (e.g. smoothstep or tanh) so the loudest 2-5% saturate gracefully. Also compute a *local* rolling percentile (e.g. 8-16 bars) for "relative to the section" reactivity, and blend global (for section contrast) with local (for detail) — global preserves the crescendo, local keeps quiet passages alive.
- Hysteresis for triggers: on-threshold > off-threshold (e.g. 0.6/0.4), plus a refractory period (≥ 1/4 beat) to prevent double hits.
- Rate-not-position: rotation and drift = ∫(base + k·level) dt; zoom and scale animated in log space; hue as a slow integrator, with section-level palette jumps.
- Quantize hit events to the nearest beat subdivision when within ~30-50 ms (snap to grid), otherwise keep the detected onset time.
- Pre-roll for latency: since the file is known, shift visual events earlier by output latency so the visual leads audio by 0-20 ms rather than lagging (see Q6 tolerances).
- Anticipation: before each detected drop (high-energy section start after a low/build section), generate a build curve over the preceding 4-16 bars (exponential or ease-in, rising tension params: zoom-in, segment count up, blur up, saturation down or toward white), optional "suck-out" in the last 1 beat to 1 bar (freeze/darken/pull motion toward 0) if the audio has a silence/gap, then a max-amplitude event exactly on the downbeat with fast attack and 1-4 bar decay.

### Gaps
- No primary source found with published, validated attack/release constants for visual reactivity (all vendors hide them). The Lag CHOP 1.2 s/3.0 s figures are one blogger's settings.

## 3. Cross-modal correspondence research (which audio features match which visual features)

### Takeaway
Robust, replicated correspondences: higher pitch ↔ higher position, smaller size, brighter/lighter; louder ↔ brighter and bigger; faster tempo and major mode ↔ more saturated, lighter, yellower colors (slower/minor ↔ darker, desaturated, bluer), with emotion as the mediator. These give principled defaults for the mapping layer.

### Cited Findings
- Spence (2011), "Crossmodal correspondences: a tutorial review", *Attention, Perception & Psychophysics* 73:971-995: correspondences between unisensory features (e.g. pitch and size) help constrain crossmodal binding; people consistently match high-pitched sounds with small, bright objects located high in space — [Oxford Crossmodal Research Lab listing](https://www.psy.ox.ac.uk/publications/115721/modal); DOI 10.3758/s13414-010-0073-7.
- Correspondences are described as structural (shared magnitude coding, e.g. loudness-brightness) vs statistical (learned co-occurrence, e.g. pitch-size) — secondhand summary in [BI Norwegian Business School paper](https://biopen.bi.no/bi-xmlui/bitstream/handle/11250/3104639/What+are+crossmodal+correspondences_final.pdf?sequence=4).
- Louder sounds are associated with brighter objects (Marks, 1978), cited in [KTH lecture notes on multisensory perception](https://www.kth.se/social/files/57e3af9af27654603413acbc/Lecture8_Multisensory_perception-Sensory_substitution_2016.pdf).
- Congruent crossmodal features speed and improve classification (speeded classification effects) — [Spence 2011 via ProQuest abstract](https://www.proquest.com/docview/920261733).
- Palmer, Schloss, Xu & Prado-León (2013, PNAS): with 18 classical pieces, US and Mexican participants chose colors; faster, major-mode music → more saturated, lighter, yellower colors; slower, minor → desaturated, darker, bluer; correlations between music's and colors' emotional associations 0.89 < r < 0.99 (emotion mediates) — [PMC full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC3670360). Caveat: Western classical music only, two cultures.
- Synesthetes, asked for "emotionally consistent" colors, picked the same colors as non-synesthetes — [Discover Magazine](https://discovermagazine.com/mind/even-people-without-synesthesia-find-colors-in-music).

### Inferences (mapping defaults for the kaleidoscope)
- Loudness/energy → brightness, bloom intensity, zoom/scale magnitude, particle count (structural magnitude correspondences — safest mappings).
- Spectral centroid / pitch height → lightness and "sharpness": higher centroid → lighter colors, finer detail (more segments, smaller features), light rays/sparkle; bass-heavy → larger, darker, heavier shapes, slower radial pulses.
- Tempo / onset density → speed (rotation rate, drift rate) via integrated clocks.
- Mode/valence and arousal (from key/mode estimate and energy) → palette: high arousal + positive valence → saturated warm/yellow; low arousal or minor → desaturated cool/dark. Change palette at section boundaries, not continuously.
- Tension/complexity (harmonic tension, spectral flux, noisiness, build sections) → visual complexity: segment count, Droste recursion depth, pixel-sort amount, reaction-diffusion activity.

### Gaps
- Lipscomb & Kendall (film music-visual congruence) and quantitative studies of timbre → saturation/sharpness were not retrieved; the timbre-sharpness mapping (e.g. "bouba/kiki"-style) is general knowledge, not verified here.

## 4. Hierarchical / time-scale design (macro, meso, micro) and VJ rules

### Takeaway
Every successful automatic system found layers three time scales: section-level scene choice (rekordbox/SoundSwitch phrases, Bank/Mood palette), phrase/bar-level envelopes (presence, intensity, builds), and beat/onset micro events (hits, OnBeat pulses, beat-phase oscillators). The macro layer is what makes a drop "feel" like a drop: contrast between sections, not amplitude of reactions.

### Cited Findings
- Macro: rekordbox classifies tracks into Intro/Up/Down/Chorus/Outro (high mood) or Intro/Verse/Bridge/Chorus/Outro (mid/low) with a per-track Mood (HIGH/MID/LOW) and Bank (style); lights are triggered per phrase — [Deep Symmetry ANLZ](https://djl-analysis.deepsymmetry.org/rekordbox-export-analysis/anlz.html), [rekordbox FAQ](https://rekordbox.com/en/support/faq/lighting-5/), [Digital DJ Tips](https://www.digitaldjtips.com/reviews/rbdmx1/).
- SoundSwitch builds "light shows specific for each Phrase and Section type" and detects drops, breakdowns and build-ups within sections; users apply different AutoScript results to verses vs choruses — [Engine DJ community](https://community.enginedj.com/t/soundswitch-v2-2-now-available/20655), [Bonedo](https://www.bonedo.de/artikel/soundswitch-2-8-lighting-software-bringt-phrasenbearbeitung-verbessertes-batch-scripting-und-neue-styles/).
- Phrase-end fills: rekordbox phrase entries carry a fill flag and fill-start beat — a dedicated slot for transition effects before the next phrase — [Deep Symmetry ANLZ](https://djl-analysis.deepsymmetry.org/rekordbox-export-analysis/anlz.html).
- Meso: Synesthesia `Presence` (sustained activity, not per-sound), `syn_Intensity` (slow song-intensity accumulator), `syn_FadeInOut` — [Synesthesia docs](https://app.synesthesia.live/docs/ssf/audio_uniforms.html).
- Micro: `Hits`, `OnBeat`, beat-subdivision oscillators — [Synesthesia docs](https://app.synesthesia.live/docs/ssf/audio_uniforms.html).
- Palette switch as a macro event: Beat Saber color boost swaps to a secondary color pair at a beat — [bsmg.wiki](https://bsmg.wiki/mapping/map-format/lightshow.html).
- Quiet sections get calmer or static looks — [MaestroDMX via Gear4music](https://gear4music.ie/PA-DJ-and-Lighting/MaestroDMX-Automated-AI-DMX-Lighting-Controller/6PN2).

### Inferences (design rules for the generator)
- Map section types to "energy tiers" (e.g. 0 ambient intro/outro, 1 verse/down, 2 build/up, 3 chorus/drop) and give each tier a *motion budget*: the number of simultaneously reactive parameters and their max depth. Tier 0: 1-2 slow params, no hits; tier 3: all FX on, hits at full depth.
- Reserve the biggest change for the highest-energy section start: palette change + FX set change + max zoom pulse on that downbeat only. Lesser section boundaries get one or two changes.
- Don't move everything at once: assign each band to a distinct parameter family (bass → scale/zoom pulse + bloom; mids → rotation rate; highs → sparkle/particles/light-ray intensity; onsets → segment flips or pixel-sort bursts), and per section enable a subset.
- Contrast: a section's look should differ from its neighbor on at least one macro axis (palette, segment count, FX set); repeated choruses can reuse their first look (consistency signals structure).
- Phrase-length variety: change minor parameters every 4 or 8 bars at phrase starts (beat-grid aligned), to avoid static looks in long sections.

### Gaps
- No primary-source VJ "rulebook" with numeric motion budgets was found; rules above are inferences from tool design. GDC talks (Tetris Effect, Thumper, Audiosurf) were not retrieved.

## 5. Instruction / timeline data formats and a recommended schema

### Takeaway
Reusable patterns: Parseq's keyframes-plus-per-field-interpolator (with beat units and labels), rekordbox's beat-indexed phrase list with a per-track mood/bank, Beat Saber's beat-timed event arrays with easing, and Theatre.js's JSON state with sequence + attached audio. Recommended KaleidoSage schema: tempo map + sections (with scene/palette/energy tier) + continuous curves (keyframes with easing, or sampled arrays) + discrete events with envelopes, all addressable in beats.

### Cited Findings
- Parseq: per-parameter keyframe value + interpolation formula; `bez(x1,y1,x2,y2)` cubic-bezier easing and named curves; units in frames/seconds/beats; labels with `info_match*`; audio events → labeled keyframes; output per-frame values/deltas — [Parseq README](https://github.com/rewbs/sd-parseq).
- rekordbox PSSI: mood, end beat, bank; entries {index, beat, kind, variant flags, fill, fillBeat} — [Deep Symmetry ANLZ](https://djl-analysis.deepsymmetry.org/rekordbox-export-analysis/anlz.html).
- Beat Saber v3: beat-timed events; color boost {beat, on}; light color event boxes with distribution Wave/Step and easing — [bsmg.wiki](https://bsmg.wiki/mapping/map-format/lightshow.html), [kvl/bsmap](https://jsr.io/@kvl/bsmap/doc/~/v3).
- Theatre.js: keyframed sequences with easing curves set in a graph editor; exported JSON state; `sequence.attachAudio` — [Theatre.js audio](https://www.theatrejs.com/docs/latest/manual/audio), [Codrops](https://tympanus.net/codrops/2023/03/30/mastering-theatre-js-animations-learn-to-create-dynamic-visuals/).

### Inferences — recommended schema shape (illustrative)
```json
{
  "version": 1,
  "audio": { "file": "track.flac", "sha256": "...", "durationSec": 245.3, "latencyCompMs": 15 },
  "tempo": { "bpm": 126.0, "beats": [0.512, 0.988, ...], "downbeats": [0.512, 2.417, ...] },
  "global": { "mood": "high", "valence": 0.7, "arousal": 0.8, "palette": "vivid-warm" },
  "sections": [
    { "id": "s1", "label": "intro", "startBeat": 0, "endBeat": 32, "tier": 0,
      "scene": { "segments": 6, "fx": ["bloom"], "palette": "cool-dim" },
      "transitionIn": { "type": "crossfade", "beats": 4, "ease": "easeInOutSine" } },
    { "id": "s3", "label": "build", "startBeat": 96, "endBeat": 128, "tier": 2 },
    { "id": "s4", "label": "drop", "startBeat": 128, "endBeat": 192, "tier": 3,
      "transitionIn": { "type": "cut", "preRollBeats": 0 } }
  ],
  "curves": {
    "rotationRate": { "unit": "rev/s", "keys": [ { "beat": 0, "v": 0.02 },
        { "beat": 96, "v": 0.05, "ease": [0.42, 0, 1, 1] }, { "beat": 128, "v": 0.25, "ease": "step" } ] },
    "zoomLog2":     { "unit": "log2", "keys": [ ... ] },
    "bassEnv":      { "sampleRateHz": 60, "data": "base64-f16..." }
  },
  "events": [
    { "beat": 128, "kind": "impact", "target": ["zoomLog2", "bloom"], "amount": 1.0,
      "env": { "attackMs": 10, "holdMs": 0, "releaseMs": 1200, "curve": "exp" } },
    { "beat": 124, "kind": "riser", "target": ["segments"], "to": 12, "durBeats": 4, "ease": "easeInExpo" },
    { "beat": 160.5, "kind": "hit", "band": "high", "target": ["particles"], "amount": 0.4,
      "env": { "attackMs": 5, "releaseMs": 250 } }
  ]
}
```
- Keep three channel kinds: (a) sparse keyframe curves with cubic-bezier easing (CSS/Penner-compatible `[x1,y1,x2,y2]` or named) for authored-feeling macro/meso motion; (b) dense sampled arrays (frame or 1/16-beat resolution) for conditioned audio envelopes; (c) discrete events with ADSR-like envelopes for micro hits. Renderer composes: value = curve(t) + Σ events(t)·depth + k·envelope(t), then clamps.
- Address time in beats with a tempo map (rekordbox/Beat Saber/Parseq all do), convert to seconds at playback; store multiplicative params (zoom) in log space (Parseq ratio lesson).
- Store section labels and tiers so the user can edit sections (SoundSwitch 2.8 phrase editing) and regenerate curves without re-analysis.

### Gaps
- Lottie, GSAP, QLC+ cue-list, MIDI CC/OSC formats were not fetched this round. Known (unverified here): Lottie keyframes carry `t`, `s`, and bezier in/out tangents `i`/`o`; GSAP timelines use labels and position parameters. Theatre.js keyframe JSON internals not documented on the pages read.

## 6. Academic work on evaluation, automatic VJing, and A/V sync tolerances

### Takeaway
Formal evaluation of music visualization is thin; the best template is Graf, Opara & Barthet (2021), which compared reactive visuals against a no-reactivity baseline. For timing, ITU-R BT.1359 gives detectability at about +45 ms (audio leads) to −125 ms (audio lags); acceptability about +90 ms to −185/−190 ms; ATSC recommends far tighter (+15 / −45 ms). Visual events should therefore never lag audio by more than ~45 ms and should preferably lead slightly or be exact.

### Cited Findings
- Graf, Opara & Barthet (2021), "An Audio-Driven System For Real-Time Music Visualisation" (AES 150): feature extraction → 3D scene via a mapping interface; stage 1 (34 participants) judged visuals better at complementing music than a baseline; stage 2 (9 participants) Creativity Support Index 68.1, SUS 58.6; users valued synchronicity and expressiveness but found audio-feature terminology hard — [arXiv 2106.10134](https://arxiv.org/pdf/2106.10134).
- Olowe (2020, QMUL PhD): FEATUR.UX.AV composes live visuals from features of separate instrumental stems; experiment with 22 AV performers comparing multitrack vs final-mix input — [QMRO](https://qmro.qmul.ac.uk/xmlui/handle/123456789/71073). (Implication: stem separation gives cleaner per-instrument mapping.)
- Schmid (2013, TU Wien): users rated existing media-player visualizers better than a physics-based prototype for music mapping — [TU Wien](https://cg.tuwien.ac.at/research/publications/2013/schmid_andreas_2013-prj).
- ITU-R BT.1359 detectability +45 ms (audio leading) to −125 ms (audio lagging); acceptability about +90 to −185 ms (other sources −190 ms); based on newsreader clips; ATSC IS-191 found BT.1359 inadequate and proposed sound never leading video by more than 15 ms nor lagging by more than 45 ms — [TV Technology "AV synchronization: how bad is bad"](https://www.tvtechnology.com/opinions/av-synchronization-how-bad-is-bad), [Fora Soft BT.1359 explainer](https://www.forasoft.com/learn/audio-for-video/articles-audio/lip-sync-itu-r-bt-1359-tolerance-windows), [arXiv 2212.01686 sports A/V desync study](https://ar5iv.labs.arxiv.org/html/2212.01686). Note: sign conventions differ between sources.

### Inferences
- Tolerance is asymmetric: audio arriving before the visual is noticed sooner (+45 ms) than audio arriving after (−125 ms). For beat-hit visuals, target visual onset at audio onset to ~20 ms *before*; account for display latency (vsync + compositor, often 1-3 frames = 16-50 ms at 60 Hz) and audio output latency by pre-rolling visual events — possible only because the file is analyzed offline.
- Evaluation plan for KaleidoSage: A/B the auto-generated instruction set vs current level routing vs a non-reactive baseline (Graf et al. design), rating "fits the music", "drop impact", "smoothness in soft passages".

### Gaps
- No peer-reviewed "automatic VJ" rule-based system with evaluated rules was found within budget. Studies on audio-visual temporal binding windows for abstract (non-speech) visuals, which likely differ from lip-sync figures, were not retrieved.
