# Make the song the master clock

Kaleido Sage should stop looping and start following the song. The recommended design has five stages. First, a **local Rust analyzer** reads the music file once and finds the beat grid, the sections, a loudness-based intensity curve, and hit envelopes per frequency band. Second, a **planner** gives each section an intent, an energy tier and a motion budget. The planner is rule-based by default, and an LLM can replace it as an option. Third, a **deterministic compiler** turns that plan into one **song-time animation script**: continuous curves with easing, beat-timed events with envelopes, look changes on downbeats, and ramps that start before each drop. Fourth, the **engine** samples that script at the song's playback position every frame. The script replaces today's per-setting ranges, the shared Length cycle and the Length-based scene switching. Fifth, **export** renders the same script frame by frame with the music in the file. The split of work is firm: **analysis owns all timing, and the AI only chooses style per section.** The best audio LLMs place a musical change within ±3 seconds only about 55–72% of the time ([MusTBench](https://arxiv.org/html/2605.29300v2)). A visible hit must land within about 45 ms of the sound ([TV Technology](https://www.tvtechnology.com/opinions/av-synchronization-how-bad-is-bad)). The analysis stack is permissive and small: Beat This! (MIT, pure-Rust crate, ~4.6 s per song on a CPU), LinkSeg (1.5 MB ONNX model, CC-BY 4.0) and an EBU R128 loudness crate. So the full feature runs on the user's PC with no upload and no key. The user's OpenAI key improves taste for about a cent per song, but nothing depends on it.

## The pipeline: analyze once, plan per section, play by song time

The table below is the whole system. Each row is one stage, and each stage writes a file that the next stage reads. A section edit or a re-roll of the plan therefore never re-runs the slow analysis.

| Stage | What it does | Tool | License | Runs where | Cost per 4-min song |
|---|---|---|---|---|---|
| 1. Decode | File to mono float samples at a fixed rate | Rust decoder (or Windows Media Foundation, already linked) | check (see risks) | Rust, background thread | < 1 s |
| 2. Beat grid | Beats, downbeats (first beat of each bar), tempo | `beat-this` crate 1.0.0, small model, rten backend ([docs.rs](https://docs.rs/crate/beat-this/1.0.0)) | MIT | Rust, no DLL | ~4.6 s on an M4 CPU |
| 3. Sections | Section boundaries and labels (intro, verse, chorus, bridge, inst, outro, silence) | LinkSeg 7-class ONNX ([Hugging Face](https://huggingface.co/elicwhite/linkseg-7c-onnx)) | CC-BY 4.0 weights, MIT glue | Rust via ONNX, or `linkseg-web` in a worker | seconds |
| 4. Feature curves | Short-term loudness, band energies, brightness (spectral centroid), onsets (starts of notes and hits), build and drop scores | `ebur128` crate ([docs.rs](https://docs.rs/crate/ebur128/latest)) plus own FFT code | own code; crate license to check | Rust | < 1 s |
| 5. Plan | Intent, tier, look and motion families per section | Rule planner; optional text LLM | own code | TypeScript | free, or ~$0.01 |
| 6. Compile | Plan + analysis into the executable script | Own code | own code | TypeScript or Rust | milliseconds |
| 7. Play | Sample the script at song time each frame | `Engine` changes | own code | webview | per frame |
| 8. Export | Render the script at frame times; add the music track | `forExport` engine + `mp4-muxer` | MIT (muxer, existing) | webview | real time or faster |

Three facts drive this shape. First, the app already has the right clock. The Files input plays the song through an `<audio>` element, which exposes `currentTime`, `duration` and `seek()` ([tracks.ts:200-208](D:/Code/KaleidoSage/src/lib/tracks.ts#L200)). Second, every one of the 147 settings flows through one function, `Engine.live(key)`, before it reaches the renderer ([engine.ts:627-643](D:/Code/KaleidoSage/src/engine/engine.ts#L627)). One insertion point therefore reaches the whole picture. Third, the best automatic light-show systems split the work in the same way. rekordbox and SoundSwitch classify a track into phrases on the beat grid offline, and then play a different pre-built look per phrase type. Live signals only modulate within the phrase ([Deep Symmetry ANLZ](https://djl-analysis.deepsymmetry.org/rekordbox-export-analysis/anlz.html); [SoundSwitch 2.2](https://community.enginedj.com/t/soundswitch-v2-2-now-available/20655)). rekordbox states it plainly: "Without phrase analysis, you cannot perform lighting in sync" ([rekordbox FAQ](https://rekordbox.com/en/support/faq/lighting-6/)).

The script replaces the app's present weak point. Today each setting gets one link to one band, with four coupled knobs, set again per scene and tuned by ear. The link only reacts and never anticipates. No link can switch a mode, a color or a scene ([audio.ts:21-58](D:/Code/KaleidoSage/src/engine/audio.ts#L21); [engine.ts:456-476](D:/Code/KaleidoSage/src/engine/engine.ts#L456)). Offline analysis adds the two things a live meter cannot have. It can **see the future**, so a ramp can start 8 bars before a drop. It can **see the whole song**, so the loudest chorus gets the biggest look and a crescendo becomes a visual crescendo, not a meter that sits at full scale on a loud master.

## Local models give a beat-accurate song map in under 15 seconds

### Beats and bars come from Beat This!, already ported to Rust

Beat This! (CPJKU, ISMIR 2024) is the current state of the art for beats and downbeats. Its full model scores **89.1 beat F1 and 78.3 downbeat F1 on GTZAN**, and the 2M-parameter small model scores 88.8 and 77.2 ([arXiv 2407.21658](https://arxiv.org/html/2407.21658)). Code and weights are MIT ([GitHub](https://github.com/CPJKU/beat_this)). The `beat-this` crate 1.0.0 (May 2026) is a pure-Rust port. Its default rten backend needs no system library, the small model is 10 MB, and it analyzed a 4:32 track in **4.6 s on an M4 CPU** ([docs.rs](https://docs.rs/crate/beat-this/1.0.0)). This fits `src-tauri` directly. One caution: docs.rs lists only Linux x86-64 as a build target, so the first task is a Windows build and timing test.

The analyzer builds the phrase grid itself, because no tool outputs one. It groups downbeats into 4-bar units, then snaps section boundaries to the nearest 4-, 8- or 16-bar multiple. This matches real music: in 1,423 expert-annotated EDM tracks, boundaries fall on multiples of 4 or 8 measures, and **16 measures is the most common section length** ([Raveform, TISMIR 2026](https://transactions.ismir.net/articles/10.5334/tismir.288)).

### Sections come from LinkSeg, the most deployable good model

SongFormer (2025) is the accuracy leader on pop structure. On a 200-song HarmonixSet benchmark it scores 0.807 label accuracy, LinkSeg scores 0.780, and All-In-One scores 0.740 ([SongFormer paper](https://arxiv.org/html/2510.02797v2)). But SongFormer needs two large self-supervised models, Python 3.10, a GPU, and Ubuntu for testing. Its repository states no license for the weights ([GitHub](https://github.com/ASLP-lab/SongFormer)). All-In-One has known install failures on Windows (NATTEN). It also depends on madmom, whose model files are **CC BY-NC-SA, non-commercial** ([PyPI madmom](https://pypi.org/project/madmom/)). A question about commercial use of its weights has no reply from the maintainer ([issue #40](https://github.com/mir-aidj/all-in-one/issues/40)). LinkSeg loses only about 3 points of accuracy against SongFormer, and it ships as a **1.5 MB ONNX file**. It needs only beat times and a log-mel spectrogram, and it works on the full mix. Its port is "validated byte-exact" against the original, under CC-BY 4.0 weights and MIT glue code ([Hugging Face](https://huggingface.co/elicwhite/linkseg-7c-onnx)). CC-BY needs only an attribution line in the About box.

LinkSeg has one gap that matters a lot for this app: its labels have **no build-up and no drop**. The only model with those labels is All-In-One retrained on Raveform (boundary HR.5F 0.835 on EDM), and its release is still "v2 coming soon", with no license stated ([TISMIR](https://transactions.ismir.net/articles/10.5334/tismir.288); [Raveform page](https://mir-aidj.github.io/raveform/)). Until that model is out, the analyzer finds builds and drops with a heuristic on top of LinkSeg. Research supports the core cue: a drop is defined by the build-up before it ([ISMIR 2014](https://archives.ismir.net/ismir2014/paper/000297.pdf)). FastLED ships similar detectors that combine energy flux and a bass surge ([FastLED drop.h](https://fastled.io/docs/db/d79/drop_8h_source.html)). The heuristic works as follows. A **build** is a phrase-aligned stretch where brightness, onset rate and loudness rise steadily, often while the bass falls (a filter sweep). A **drop score** at a candidate downbeat is the bass energy after the downbeat minus the bass energy in the 2–4 bars before it, times the loudness jump, times the rise that came before. Only 8- and 16-bar phrase starts are candidates. A LinkSeg "chorus" or "inst" section that starts right after a build is the payoff section.

### Intensity is loudness plus density, normalized per track

The standard perceptual energy curve is EBU R128 loudness: momentary loudness over 400 ms and short-term loudness over 3 s ([EBU R 128](https://en.wikipedia.org/wiki/EBU_R_128)). The `ebur128` Rust crate passes the EBU test suites and gives momentary, short-term and loudness-range values ([docs.rs](https://docs.rs/crate/ebur128/latest)). The analyzer combines short-term loudness, low-band energy, onset density and brightness into one **intensity** channel. It maps that channel to 0–1 with the track's own 5th and 95th percentiles, so quiet and loud masters both use the full visual range. This idea matches MilkDrop's self-normalizing bands, where "1 is normal" ([MilkDrop guide](https://www.geisswerks.com/milkdrop/milkdrop_preset_authoring.html)). The analyzer keeps two versions of intensity. The **global** version keeps the crescendo: the last chorus really is bigger than the first verse. A **local** version, normalized over a rolling 8–16 bars, keeps quiet passages alive. Dedicated emotion models add little here. Arousal is predicted from audio at r = 0.81 in a 2025 meta-analysis ([Eerola, C4DM](https://c4dm.eecs.qmul.ac.uk/news/2025-06-06.C4DM-Seminar_Tuomas_Eerola/)), and this composite measures nearly the same thing. The packaged arousal and valence models are also non-commercial ([Essentia models](https://essentia.upf.edu/models.html)).

The analyzer also writes short **hit envelopes** per band: kick (sub-bass onsets), snare (2–5 kHz plus noise) and hats (above 8 kHz). Each envelope rises fast and falls slowly. This follows the shared practice of live VJ tools, which keep a separate "Hits" channel next to the smooth "Level" channel, and a slow "Presence" channel that does not react to each sound ([Synesthesia audio uniforms](https://app.synesthesia.live/docs/ssf/audio_uniforms.html)). TouchDesigner's Lag CHOP makes the same point with separate rise and fall times ([Lag CHOP](https://docs.derivative.ca/Lag_CHOP)). No vendor publishes its time constants. The defaults below are therefore engineering starting points, not sourced values: hits rise in 5–30 ms and fall in 150–400 ms, levels rise in 50–150 ms and fall in 0.5–2 s, and presence falls over 2–8 s. Triggers use a higher on-level than off-level (0.6 and 0.4) and a dead time of at least a quarter beat. Onsets within 30–50 ms of a grid line snap to it.

Stem separation (separate drum, bass, vocal and other tracks) is a later option, not a first step. HTDemucs is the deployable default. An ONNX export runs at about **21 s of CPU time per minute of audio**, so roughly 1.5 minutes for a 4-minute song, and much faster on a GPU through DirectML ([Mixxx GSoC 2025](https://mixxx.org/news/2025-10-27-gsoc2025-demucs-to-onnx-dhunstack/); [adowu export](https://huggingface.co/adowu/htdemucs-onnx)). The weight license is unclear: the Demucs README states MIT only, but a third-party export claims CC BY-NC 4.0 ([Demucs README](https://raw.githubusercontent.com/facebookresearch/demucs/main/README.md); [HRSadeghi export](https://huggingface.co/HRSadeghi/demucs-onnx)). Band-limited onsets give 80% of the value at about 0% of the cost. Stems should wait until the core works and the license is settled.

Three things are deliberately left out. **Essentia** and essentia.js are AGPL-3.0 with non-commercial models ([Essentia licensing](https://essentia.upf.edu/licensing_information.html)). **aubio-rs** is GPL-3.0 ([docs.rs](https://docs.rs/crate/aubio-rs/latest)). **Hosted analysis APIs** are not an option either. Spotify closed Audio Analysis to new apps on 27 November 2024 ([Spotify blog](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api)). Cyanite works in 15-second segments, which is too coarse for beats, and costs a monthly fee ([Cyanite](https://cyanite.ai/blog/music-analysis-api/)).

## Analysis owns time; the LLM only picks style per section

The timing evidence is clear. MusTBench (2026) asked audio LLMs to give the timestamp of a musical change in a full track. It counted a hit if the answer was within ±3 s. **Gemini 2.5 Flash scored 60.0% on change starts and 71.5% on change ends. GPT Audio scored 21.5% and 1.5%.** Ends collapsed to round numbers such as 120 s and 180 s, and some timestamps were past the end of the song ([MusTBench Table 3](https://arxiv.org/html/2605.29300v2)). Developers also report timestamps that drift further and further: Gemini 3.1 Pro was about 16 s off by the end of a 12-minute file ([Google forum](https://discuss.ai.google.dev/t/bug-gemini-3-flash-and-3-1-pro-progressive-timestamp-drift-in-audio-transcription/129501)). Compare that with what the picture needs. One beat at 120 BPM lasts 0.5 s. Broadcast research finds sound that arrives before the picture noticeable at about 45 ms. The ATSC limit is 15 ms of sound lead and 45 ms of sound lag ([TV Technology](https://www.tvtechnology.com/opinions/av-synchronization-how-bad-is-bad)). A ±3 s window that is right two times in three is about 60 times too loose. It is right too rarely to place a drop. Beat This!, by contrast, scores 89 beat F1 on a standard benchmark, which means it places nearly 9 in 10 beats correctly. **So no LLM output in this design contains a time.** The LLM refers only to section ids that the analyzer created, and the compiler turns those ids into exact downbeats.

The style role has good prior art. A 2026 TU Wien system is the closest match to this app. An offline back end extracts stems, rhythm, melody, timbre and section structure. Multi-stage LLM prompts then pick shader layers and map features to shader uniforms per section. At run time, plain code applies those mappings from time-synced feature streams ([TU Wien](https://erzherzog.cg.tuwien.ac.at/node/10564)). Research on lighting and dance points the same way. In Skip-BART, a learned music-to-light model, the authors needed an extra skip connection because, without it, light changes "do not always align with the music". They also name beat tracking and section detection as the missing inputs ([Skip-BART](https://arxiv.org/html/2506.01482v2)). Lodge generates long dances coarse to fine: global structure first, beat-level detail second ([Lodge, CVPR 2024](https://mlanthology.org/cvpr/2024/li2024cvpr-lodge/)). Dolby frames AI light design as an "editable preliminary design" that a person then refines ([Dolby](https://arxiv.org/abs/2602.08838)).

Skip-BART also carries a warning that shapes the rule planner. Viewers rated a simple rule-based light show **2.67 out of 7, against 4.35 for the learned model** (n = 38, p < 0.001), because the rules "tend to produce slow, smooth transitions" ([Skip-BART](https://arxiv.org/html/2506.01482v2)). A rule planner that only makes smooth motion will look dull. The planner below therefore puts most of its effort into **contrast between sections, beat-level hits and the moment of the drop**.

### Which AI, for what, and at what cost

The user's OpenAI key is best used on a **text model that reads the analysis summary**, not on audio. GPT Audio scored lowest on music timing, and its audio input costs $32 per million tokens. A text plan from about 15k input tokens and 4k output tokens costs about **$0.012 with gpt-5-mini** and about $0.10 with gpt-5.4, at the listed prices ([OpenAI pricing](https://developers.openai.com/api/docs/pricing)). OpenAI Structured Outputs in strict mode guarantee that the reply matches the JSON schema. They do not guarantee that the values are sensible, so the app still validates them ([OpenAI docs](https://developers.openai.com/api/docs/guides/structured-outputs)). An optional, opt-in second pass can send the audio to **Gemini Flash** to describe sections that the analyzer has already marked ("section 3 is 01:12–01:41: give mood, instruments and energy character"). This costs under a cent: 32 tokens per second of audio at $0.30–$1.00 per million ([Gemini audio](https://ai.google.dev/gemini-api/docs/audio); [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)). Use a paid-tier Gemini key only, because free-tier content is "used to improve products". Gemini also silently ignores some JSON Schema rules, such as `minLength`, so the app must check values ([Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)). Claude can serve as the text planner, but the Claude API had no raw audio input as of this research ([SDK issue](https://github.com/anthropics/anthropic-sdk-python/actions/runs/22354407550)). Music Flamingo, the strongest open music captioner, is for non-commercial research only ([model card](https://huggingface.co/nvidia/music-flamingo-hf)).

The key handling follows the user's own rules. The user types the key into Settings, and the app stores it locally. **No key is ever compiled into the binary.** Audio upload stays off by default, because a features-only prompt sends no copyrighted audio to anyone. Plans are cached by audio hash and seed. A "re-roll" button turns LLM randomness into a feature ("another interpretation"). If the LLM call fails, or its output fails validation, the rule planner fills in the missing sections. **The AI is an enhancement, never a dependency.** One open question remains here: no published study shows that LLM-chosen mappings beat a well-tuned rule system for viewers. Phase 5 includes a small A/B test for that.

## One script format serves both planners

The design uses two schemas. The **plan** is small. Both planners write it, and it holds only choices from fixed lists. The **script** is large. Only the compiler writes it, and only the engine reads it. Because the LLM and the rule planner write the same plan, they are interchangeable, and they can be mixed section by section.

### The plan: choices per section id, no times

```json
{
  "plan": 1,
  "planner": "rules-1",
  "seed": 7,
  "track": { "palette": "warm-vivid", "baseScene": 2 },
  "sections": [
    { "id": "s1", "intent": "drift", "tier": 0, "scene": 0,
      "families": ["spin", "color"], "depth": 0.2, "curve": "organic",
      "driver": "intensity", "enter": "none" },
    { "id": "s3", "intent": "build", "tier": 2, "scene": 1,
      "families": ["scale", "complexity", "glow", "spin"], "depth": 0.7, "curve": "expoIn",
      "driver": "onsets", "enter": "crossfade-2b",
      "anticipate": { "bars": 4, "suckOut": true } },
    { "id": "s4", "intent": "drop", "tier": 3, "scene": 2,
      "families": ["scale", "glow", "sparkle", "spin", "flow"], "depth": 1.0, "curve": "out",
      "driver": "kick", "enter": "cut", "impact": "max",
      "fx": { "particles": true, "bloom": true } }
  ]
}
```

Every field is an enum or a bounded number. `intent` is one of drift, steady, build, drop, sustain, breakdown or outro. `families` names groups of settings (see the planner section), not single keys, so the LLM cannot pick a setting that has no effect under the scene's current mode. `scene` is an index into the playlist's scenes. **The scenes become the palette of looks** that the script animates. `enter` is one of none, cut, or crossfade-1b/2b/4b/8b, where "b" means beats. The LLM's prompt holds this schema, the analysis summary per section (id, label, length in bars, mean and peak intensity, rank in the track, slope, bass and high-band share, onset density) and a short text description of each scene. That prompt comes to a few thousand tokens.

### The script: what the engine executes

```json
{
  "format": "kaleidosage-script",
  "version": 1,
  "track": { "file": "tracks/2/Night Drive.flac", "sha256": "9f2c41d0", "durationSec": 241.6,
             "analyzer": "ks-analyze 1 (beat-this small, linkseg-7c, ebur128)" },
  "sync": { "leadMs": 15 },
  "grid": { "bpm": 126.0, "beatsPerBar": 4, "phraseBars": 8, "firstDownbeat": 0,
            "beats": [0.476, 0.952, 1.429, 1.905, 2.381] },
  "channels": { "rateHz": 60, "encoding": "f16-base64",
                "intensity": "AAA8ADwA", "intensityLocal": "AAA8ADwA",
                "bass": "AAA8ADwA", "highs": "AAA8ADwA", "kick": "AAA8ADwA", "onsets": "AAA8ADwA" },
  "sections": [
    { "id": "s1", "label": "intro", "from": 0, "to": 32, "tier": 0, "intent": "drift",
      "look": { "scene": 0 }, "enter": { "type": "none" } },
    { "id": "s3", "label": "build", "from": 96, "to": 128, "tier": 2, "intent": "build",
      "look": { "scene": 1, "groups": { "blur": true, "rays": true } },
      "enter": { "type": "crossfade", "beats": 2 } },
    { "id": "s4", "label": "drop", "from": 128, "to": 192, "tier": 3, "intent": "drop",
      "look": { "scene": 2, "groups": { "particles": true, "bloom": true },
                "state": { "foldMode": 0 } },
      "enter": { "type": "cut" } }
  ],
  "lanes": {
    "zoom": { "space": "pos", "interp": "log",
      "keys": [ { "b": 0, "v": 0.2 }, { "b": 96, "v": 0.25, "ease": "organic" },
                { "b": 127, "v": 0.9, "ease": "in" }, { "b": 128, "v": 0.45, "ease": "step" } ],
      "mod": { "src": "kick", "depth": [ { "b": 0, "v": 0 }, { "b": 128, "v": 0.15, "ease": "step" } ] } },
    "rotation": { "space": "rate", "unit": "turnsPerBar",
      "keys": [ { "b": 0, "v": 0.01 }, { "b": 96, "v": 0.02 },
                { "b": 127, "v": 0.12, "ease": "in" }, { "b": 128, "v": 0.08, "ease": "step" } ],
      "mod": { "src": "intensityLocal", "depth": [ { "b": 0, "v": 0.3 } ] } },
    "segments": { "space": "value",
      "keys": [ { "b": 96, "v": 6 }, { "b": 124, "v": 12, "ease": "in" }, { "b": 128, "v": 8, "ease": "step" } ] },
    "warpFlow": { "space": "value",
      "keys": [ { "b": 0, "v": 0.05 }, { "b": 128, "v": 0.4, "ease": "step" } ],
      "mod": { "src": "onsets", "depth": [ { "b": 0, "v": 0.2 } ] } },
    "bloomAmount": { "space": "value",
      "keys": [ { "b": 0, "v": 0.2 }, { "b": 128, "v": 0.6, "ease": "step" } ],
      "mod": { "src": "kick", "depth": [ { "b": 0, "v": 0 }, { "b": 128, "v": 0.5, "ease": "step" } ] } },
    "trailHue": { "space": "value", "keys": [ { "b": 0, "v": 0.5 }, { "b": 128, "v": 2.0, "ease": "step" } ] }
  },
  "events": [
    { "b": 112, "kind": "riser", "add": { "blurAmount": 35, "raysAmount": 1.6, "warpAmount": 0.3 },
      "env": { "attack": "16b", "release": "0b", "curve": "expoIn" } },
    { "b": 127, "kind": "suckOut", "add": { "exposure": -2.0 }, "rateScale": 0,
      "env": { "attack": "1b", "release": "0b", "curve": "out" } },
    { "b": 128, "kind": "impact", "add": { "exposure": 1.2, "bloomAmount": 1.5 }, "mul": { "zoom": 0.8 },
      "env": { "attack": "8ms", "release": "4b", "curve": "exp" } },
    { "b": 160, "kind": "state", "state": { "trailColor": "#ff6a00" }, "fade": "1b" }
  ]
}
```

The beats array and the data channels are cut short here. The rules that make this script executable are few, and each one copies a proven format.

**Time is in beats.** The field `b` is a fractional index into `grid.beats`, and the engine turns it into seconds by interpolating between beat times. rekordbox stores phrases by beat number, Beat Saber times its light events in beats, and Parseq accepts beat units ([Deep Symmetry](https://djl-analysis.deepsymmetry.org/rekordbox-export-analysis/anlz.html); [bsmg.wiki](https://bsmg.wiki/mapping/map-format/lightshow.html); [Parseq](https://github.com/rewbs/sd-parseq)). Curves stay locked to the music even when the tempo drifts. A section edit also moves every key inside it.

**Lanes are keyframe curves per real `ParamKey`.** Each key has a value and an ease. The ease names are the app's own 12 eases plus `step`, `expoIn` and a cubic-bezier form, as in Parseq's `bez()` ([params.ts:93-100](D:/Code/KaleidoSage/src/engine/params.ts#L93); [Parseq](https://github.com/rewbs/sd-parseq)). A lane has one of three value spaces. `pos` is a 0–1 position between the current scene's low and high handles. It reuses the log-aware `playheadValue` mapping that MIDI already uses, so one script works across scenes ([midi.ts:480-560](D:/Code/KaleidoSage/src/lib/midi.ts#L480)). `value` is the setting's native unit. `rate` is a speed that the engine integrates into an angle or position. Zoom-type lanes interpolate in log space, which is Parseq's lesson for multiplicative settings.

**Modulation adds live-feeling detail.** A lane's `mod` multiplies a data channel (kick, intensity, onsets) by a depth. The depth is itself a curve, so the section's motion budget sets how hard the beat hits.

**Events are envelopes.** Each event adds (`add`) or multiplies (`mul`) a shape with an attack, hold and release, in beats or milliseconds. A riser is a long attack that ends exactly when the impact starts. A suck-out darkens the picture and stops all spinning (`rateScale: 0`) for the last beat. A `state` event changes a discrete setting such as a color, with a short fade.

**Sections own the discrete look.** At its first beat a section applies its scene, its effect groups and its mode overrides, through its `enter` transition.

The engine composes each frame with one formula. For every key, the value is the lane value, plus the modulation, plus the sum of active event envelopes. The result is clamped to the setting's `min` and `max` and passed through a per-frame jump limit. Skip-BART used the same kind of cap to stop flicker ([Skip-BART](https://arxiv.org/html/2506.01482v2)). A setting with no lane keeps its scene value.

## The planner turns energy tiers into motion budgets

### Four tiers set how much moves

The rule planner first gives each section a tier. It ranks the section's mean global intensity within the track, then adjusts by label. An intro or outro is at most tier 1. A section with a rising build score is tier 2. A chorus, or a section that wins the drop score, is at least tier 2, and the strongest of these is tier 3. On a heavily compressed master with a small loudness range, labels and local intensity carry more weight, so sections still differ. Each tier gets a **motion budget**. rekordbox's High/Mid/Low mood classes and its Intro/Up/Down/Chorus phrase types follow the same idea ([rekordbox FAQ](https://rekordbox.com/en/support/faq/lighting-5/); [Digital DJ Tips](https://www.digitaldjtips.com/reviews/rbdmx1/)). No primary source gives numbers for these budgets, so the values below are starting points to tune by eye.

| Tier | Typical sections | Lanes moving | Max depth (share of the handle span) | Beat pulses | Spin and flow speed | Entry |
|---|---|---|---|---|---|---|
| 0 Calm | intro, outro, ambient break | 1–2 | 0.25 | none | about 1 turn per 32 bars | crossfade 4–8 beats, organic ease |
| 1 Steady | verse, "down" | 2–4 | 0.45 | kick at 25% depth | base speed | crossfade 2–4 beats |
| 2 Rising | pre-chorus, build | 3–5, rising | ramps from 0.4 to 0.9 | on and growing | rises with onset density | riser; optional suck-out |
| 3 Peak | chorus, drop | 5–8 | 1.0 | full depth | high | cut on the downbeat plus impact |

Soft passages get soft motion from three rules. They have few lanes, slow eases with long releases, and no hits. Their motion follows the **local** intensity, so a quiet verse still breathes. MaestroDMX describes the same behavior: it detects calm passages and reduces output ([Gear4music](https://gear4music.ie/PA-DJ-and-Lighting/MaestroDMX-Automated-AI-DMX-Lighting-Controller/6PN2)). A crescendo makes a visual crescendo because each lane's depth scales with the **global** intensity. As the song grows, the same lanes travel further, glow brighter and spin faster.

### Each musical signal drives one family of settings

The planner never moves all settings at once. Each musical signal drives one family, and each tier turns on a subset of families. The pairings follow the best-replicated research on how people match sounds to sights.

| Musical signal | Family | Real keys | Evidence |
|---|---|---|---|
| Loudness / intensity | **glow** (brightness) and **scale** (size) | `exposure`, `bloomAmount`, `overlayOpacity`; `zoom`, `mobiusZoom`, `mapScale`, `juliaZoom`, `tileSize` | Louder sounds match brighter objects ([Marks 1978, via KTH](https://www.kth.se/social/files/57e3af9af27654603413acbc/Lecture8_Multisensory_perception-Sensory_substitution_2016.pdf)); loudness and brightness share magnitude coding ([Spence 2011](https://www.psy.ox.ac.uk/publications/115721/modal)) |
| Kick and bass hits | **scale** pulse, **glow** pulse | `zoom` (mul), `bloomAmount`, `exposure` | Fast/slow band ratio as hit detector ([MilkDrop](https://www.geisswerks.com/milkdrop/milkdrop_preset_authoring.html)); kick as clean trigger ([TouchDesigner](https://derivative.ca/UserGuide/Palette:audioAnalysis)) |
| Brightness of sound, high band | **sparkle** and fine detail | `particleBoost`, `particleSpeed`, `raysAmount`, `sharpen`; more `segments`, smaller `tileSize` | High pitch matches small, bright, high objects ([Spence 2011](https://www.psy.ox.ac.uk/publications/115721/modal)) |
| Tempo and onset density | **spin** and **flow** speeds | `rotation`, `mapAngle`, `mobiusTurn`, `drosteRotation` (as rates); `warpFlow`, `mapSpeed`, `driverSpeed`, `cameraSpeed` | Audio drives speed and the clock integrates it, so motion never jumps back ([Synesthesia `Time`](https://app.synesthesia.live/docs/ssf/audio_uniforms.html)) |
| Build slope, noise, flux | **complexity** | `segments`, `drosteSpirals`, `mapArms`, `twirl`, `warpAmount`, `warpMarble`, `blurAmount`, `contourLines` | Rising tension reads as more detail (inference from rekordbox "Up" phrases) |
| Mood (fast/major vs slow/minor), arousal | **color**, changed only at section starts | `overlayColor`, `trailColor`, `particleStops`, `contourHue`, `trailHue`, `imageBlend` | Faster, major music matches lighter, more saturated, yellower colors; r = 0.89–0.99 via emotion ([Palmer et al. 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3670360)) |

Two limits apply to the color row. Palmer's study used Western classical music and two cultures. Skip-BART's authors also warn against fixed emotion-to-color rules, because their system showed green with angry groove metal ([Skip-BART](https://arxiv.org/html/2506.01482v2)). Color is therefore a **style choice per section**, the best job for the LLM. In the rule planner it is a palette picked per track and changed only at tier changes. The app also has no key or mode detector yet. The LLM's optional Gemini labels, or a later chroma feature, fill that gap.

### Anticipation is what makes a drop feel like a drop

The analysis knows where each drop is, so the compiler writes a three-part shape before it. This is the payoff of offline analysis. The **riser** starts at the start of the build, or 4–16 bars before the drop, to match the length found by analysis. It eases in exponentially. The picture zooms in, `segments` climbs, blur and rays grow, spin speeds up, and `exposure` sinks a little. If the audio thins out or goes silent in the last beat or bar, a **suck-out** follows: the picture darkens and all spinning freezes. Then comes the **impact**, exactly on the drop's downbeat. It holds the biggest change of the whole song: a cut to the peak scene, a new effect set, a new palette, an exposure flash, a bloom spike and a zoom punch. The impact has an 8 ms attack and a release of 1–4 bars. rekordbox has a dedicated "fill" slot at the end of each phrase for this kind of transition effect, and Parseq has `info_match_next()` so that a curve can aim at the next labeled event ([Deep Symmetry](https://djl-analysis.deepsymmetry.org/rekordbox-export-analysis/anlz.html); [Parseq](https://github.com/rewbs/sd-parseq)).

Four more rules prevent the "slow and smooth" failure. **Save the biggest change** for the highest-energy section start, and give smaller boundaries only one or two changes. **Make neighbors differ** on at least one big axis: scene, palette, fold mode or effect set. **Reuse a chorus's look** when the chorus returns, because repetition shows structure. **Change one minor setting at each 4- or 8-bar phrase start** inside long sections. These rules come from the shared design of VJ and lighting tools, not from a validated study.

### Discrete changes and GPU cost need care

Discrete settings (`foldMode`, `mapMode`, `warpType`, effect on/off, `fxOrder`, colors) are hard cuts. Turning on trails, smear, contours or particles also resets their state ([renderer.ts:459-501](D:/Code/KaleidoSage/src/engine/renderer.ts#L459)). The compiler therefore changes them only at section starts or at phrase downbeats. It hides each change in a cut on the beat, or ramps the effect's strength to zero first, since a strength of zero removes the GPU pass ([renderer.ts:782-803](D:/Code/KaleidoSage/src/engine/renderer.ts#L782)). Because the script knows the future, it can switch a stateful effect on **one bar early at zero opacity**, so its trails or particles are already full when the effect fades in. Integer settings such as `warpDetail` and `mapSteps` jump visibly, so they change only at cuts. `segments` and `drosteSpirals` already blend between whole numbers. `mapArms` must stay inside its range, or the copy count jumps ([engine.ts:398-404](D:/Code/KaleidoSage/src/engine/engine.ts#L398)). Some settings cost a lot of GPU time: `particleCount` up to about 1M points, any `sortAmount` above zero (a full sort every frame), and `mapSteps`. The planner caps these per tier, and allows pixel sort only in short tier-3 bursts. The repository has a GPU timer but no stored timings ([gpuTimer.ts](D:/Code/KaleidoSage/src/engine/gpuTimer.ts)). A cost table measured with it should feed the planner.

### How the two planners share the work

The rule planner is a pure function of the analysis plus the scene descriptions. It assigns tiers, picks families by tier, takes depth from the tier budget and curves from the intent, and picks a scene for each section. It cycles through the playlist's scenes and saves the "busiest" scene for the peak tier. The busiest scene is the one with the most effects on and the most ranged settings. The LLM planner gets the same inputs as text and returns the same plan. The compiler then validates both the same way. It rejects unknown enums and unknown section ids, clamps depths and tiers, enforces the GPU caps, and uses the rule plan for any section that fails. Everything after the plan is deterministic. **A plan plus an analysis always compiles to the same script.**

## The engine must follow song time, not its own loop

Today, all motion is periodic by design. A shared cycle (Length, 5–90 s) sets global speed. Every range goes start to end in one cycle and back in the next. Speeds build up into ever-growing totals. In Files mode, scenes crossfade to the next tab at the end of each Length ([params.ts:795-851](D:/Code/KaleidoSage/src/engine/params.ts#L795); [App.tsx:1055-1148](D:/Code/KaleidoSage/src/App.tsx#L1055)). The script needs seven changes.

**1. Song time becomes the master clock.** A new `SongClock` reads `audio.currentTime` each frame. It smooths the value by extrapolating with `performance.now()` between updates. It subtracts the output latency (`AudioContext.outputLatency` or `getOutputTimestamp()`, since the track player already owns an `AudioContext` ([tracks.ts:22-57](D:/Code/KaleidoSage/src/lib/tracks.ts#L22))). Then it adds the script's `leadMs`, so pictures arrive 0–20 ms **before** the sound, never after. In `Engine.frame()`, script mode sets `state.clock` to this song time and does not add frame deltas ([engine.ts:868-900](D:/Code/KaleidoSage/src/engine/engine.ts#L868)). The repository has no measurement of `currentTime` jitter or WebView2 output latency. Phase 1 must measure both. One more offset needs a check: MP3 decoders can add 20–40 ms of offset ([All-In-One README](https://github.com/mir-aidj/all-in-one)). The Rust decoder and WebView2's playback decoder must agree on time zero. A wrong zero uses up the whole 45 ms budget.

**2. The script is injected in `Engine.live()`.** The new order is: bypass, then **script sample**, then MIDI hold, then glide. When the script defines a key, `live()` returns the script value instead of `liveValue()`. `frameValues()` and the renderer do not change, because they already read every setting through `live()` ([engine.ts:908-1108](D:/Code/KaleidoSage/src/engine/engine.ts#L908)). MIDI stays a live override on top. When the user lets go of a knob, the existing `resumeRange` curve hands control back smoothly ([engine.ts:500-620](D:/Code/KaleidoSage/src/engine/engine.ts#L500)). The audio-push path is skipped in script mode, because the script already contains the music. Discrete events between the previous and the current song time run in `frame()` before `frameValues()`.

**3. Running totals become functions of song time.** Today `step()` adds speed × frame time into `warpTime`, `mapTravel`, `driverTime` and `cameraX/Y` ([engine.ts:842-858](D:/Code/KaleidoSage/src/engine/engine.ts#L842)). On script load, the engine instead builds a **running-sum table** at 60 Hz for each speed lane and each `rate` lane. Each entry is the total distance travelled up to that moment. The camera table holds the heading too, since `cameraTurn` steers the flight. Each frame then looks the value up at song time. This one change makes seeking cheap and makes export exactly repeatable. It also keeps Synesthesia's rule that audio changes speed, never position, so spin never jumps back.

**4. Seeking costs one table lookup.** The work-in-progress `seekTo()` steps from zero at 1/120 s. That is about 28,800 steps for a 4-minute song ([engine.ts:731-747](D:/Code/KaleidoSage/src/engine/engine.ts#L731)). With the script, a seek is "evaluate at t". The discrete look at t is rebuilt from the section that contains t plus the state events before it. Stateful GPU effects (trails, smear, particles, contour smoothing) cannot be rebuilt exactly. They restart and fade in over about half a second. Optionally, the engine can render about one second of frames without showing them before it fades in.

**5. Pause uses one transport.** The scene transport and the music transport split on 2026-10-21 ([docs/AUDIO.md:228-247](D:/Code/KaleidoSage/docs/AUDIO.md#L228)). Script mode joins them again. The song's play, pause and seek drive the picture. A paused song gives a still picture at t, because the script is a pure function of t. MIDI springs and slider glides keep running on real time, so a knob still moves the picture while the song is paused. The `SceneTransport` scrub bar becomes a song scrub bar with section markers.

**6. Scene changes come from the script, without a rewind.** Today a scene change calls `switchToDoc()`, which calls `rewind()` and zeroes all clocks ([App.tsx:789-806](D:/Code/KaleidoSage/src/App.tsx#L789); [engine.ts:717-729](D:/Code/KaleidoSage/src/engine/engine.ts#L717)). A new `applyLook(scene, transition)` loads the scene's settings and state but keeps song time and the running-sum tables. For a crossfade it reuses `fadeOut()`, which captures the last frame and fades it over the new scene with a smoothstep ([engine.ts:193-227](D:/Code/KaleidoSage/src/engine/engine.ts#L193)). The fade length comes from the script instead of the fixed 1.5 s. A captured frame is a still frame, so long crossfades (4–8 beats in calm sections) look frozen. A true live crossfade would render two scenes, which doubles GPU cost. This is an open question. Until it is answered, calm sections should use crossfades of 2 beats or less, plus slow motion inside the section.

**7. Export renders the song and includes the music.** The export engine copy already steps time in a fixed way ([videoExport.ts:456-458](D:/Code/KaleidoSage/src/lib/videoExport.ts#L456)). In script mode it evaluates the script at t = n / fps, with no clock smoothing and no lead, for the length of the song. The muxer is set up for video only today ([videoExport.ts:400-401](D:/Code/KaleidoSage/src/lib/videoExport.ts#L400)). It needs an audio track. That means either the source audio copied in when it is already AAC, or a new audio encode. Encoder support in WebView2 has not been checked. Because export follows the same script, the exported video matches what the user saw.

Scripts and plans are stored per track, inside the playlist ZIP next to the audio (`tracks/<n>/<name>.kscript.json` and `.ksplan.json`). The manifest reader already ignores unknown fields, so older versions of the app can still open the file ([playlistFile.ts:26-104](D:/Code/KaleidoSage/src/lib/playlistFile.ts#L26)). The analysis is cached in the app's cache folder by SHA-256 of the audio, like the existing video imports.

| Retire in script mode | Keep and reuse |
|---|---|
| `cycle` / `REFERENCE_CYCLE` speed scaling; `custom` periods; `startTime`; `scenePosition` | `easeCurve` and its 12 eases (lane interpolation) |
| Triangle-wave range playback, plus wander and one-way trip logic in `liveValue()` | `playheadValue` / `playheadPosition` (the `pos` space) |
| Length-based and track-change scene switching; Hold; the next-scene countdown | `fadeOut()` crossfade; `resumeRange` for MIDI handback |
| Per-setting `audioLinks` and the scene `audioRelease` | `AudioAnalyzer` (tests, live inputs) |
| `seekTo()` stepping from zero; `rewind()` on scene change | Randomize rules as the planner's safe ranges ([params.ts:943-1356](D:/Code/KaleidoSage/src/engine/params.ts#L943)) |
| `videoLoopPlan` inside the Length; seamless-loop export math in `loop.ts` | `isShown` / submode tables, so lanes only target visible settings |

Two live inputs remain: PC sound and the microphone. They have no file to analyze and no song clock, so a script cannot drive them. The user must decide whether they keep today's link system as a separate "Live" mode, or run the rule planner on live features with no anticipation. The second choice still retires looping, but it loses the drop shape.

## Build it in six phases, beat grid first

The smallest useful step proves the core claim, that the picture follows the music. It does not need sections or AI. Each later phase adds one capability that the user can see.

| Phase | What ships | What it proves | Main work |
|---|---|---|---|
| 1. Beat-locked look | Rust analyzer (decode, `beat-this`, `ebur128`, band hits, onsets); `SongClock`; script v1 with lanes, `mod` and kick pulses for the current scene; `live()` injection | A crescendo becomes a visual crescendo; hits land on the beat; measured sync offset | Windows build of `beat-this`; clock jitter and latency test; decoder zero-offset check |
| 2. Sections and drops | LinkSeg; phrase grid; build and drop scores; tiers; rule planner; look changes on downbeats; riser, suck-out and impact | A drop feels like a drop; soft parts stay soft | LinkSeg runtime choice; tune tier budgets by eye |
| 3. Full replacement | Running-sum tables; one-lookup seek; one transport; `applyLook` without rewind; state events; early warm-up of stateful effects; retire the looping code | Seek and pause just work; no loops remain | Remove the left column of the retire table |
| 4. Export with music | Script-driven export over the song length, with an audio track | Shareable synced videos | Audio encode or AAC pass-through |
| 5. AI style planner | Plan schema through OpenAI strict outputs; opt-in Gemini section labels; re-roll; section editor; A/B test against rules | The AI adds taste worth its cost | Prompt, validator, key settings |
| 6. Stems and polish | Optional HTDemucs through DirectML; GPU cost table; Raveform labels when released | Cleaner per-instrument hits; EDM labels | Settle license questions first |

### License risks to settle before shipping

| Component | Status | Risk |
|---|---|---|
| Beat This! / `beat-this` crate | MIT code and weights ([GitHub](https://github.com/CPJKU/beat_this); [docs.rs](https://docs.rs/crate/beat-this/1.0.0)) | Low. Windows build not yet confirmed |
| LinkSeg ONNX | CC-BY 4.0 weights, MIT glue ([HF](https://huggingface.co/elicwhite/linkseg-7c-onnx)) | Low. Needs attribution in the About box |
| `ebur128` crate | License not checked in this research | Check |
| Rust audio decoder (e.g. symphonia) and ONNX runtime | Not covered by this research | Check; Windows Media Foundation avoids a new decoder |
| HTDemucs weights | MIT per README; CC BY-NC per one export ([README](https://raw.githubusercontent.com/facebookresearch/demucs/main/README.md); [export](https://huggingface.co/HRSadeghi/demucs-onnx)) | **Unclear.** Phase 6 only |
| All-In-One, madmom models | madmom models CC BY-NC-SA; All-In-One weights unresolved ([PyPI](https://pypi.org/project/madmom/); [#40](https://github.com/mir-aidj/all-in-one/issues/40)) | **Avoid** |
| SongFormer, Raveform models | No weight license stated ([GitHub](https://github.com/ASLP-lab/SongFormer); [Raveform](https://mir-aidj.github.io/raveform/)) | **Avoid until stated** |
| Essentia, essentia.js, Essentia mood models | AGPL-3.0; models CC BY-NC ([licensing](https://essentia.upf.edu/licensing_information.html)) | **Avoid** |
| aubio-rs | GPL-3.0 ([docs.rs](https://docs.rs/crate/aubio-rs/latest)) | **Avoid** |
| Music Flamingo | Non-commercial ([model card](https://huggingface.co/nvidia/music-flamingo-hf)) | **Avoid** |
| OpenAI / Gemini | Paid APIs; user-supplied keys; audio upload opt-in only ([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)) | Low with these rules. OpenAI data terms not checked here |

### Open questions

Several questions are still open, and each one blocks a specific phase. Phase 1 needs three measurements: how smooth WebView2's `currentTime` is, how large the output latency is, and whether the analysis decoder and the playback decoder agree on time zero. Phase 2 needs a choice of runtime for LinkSeg. It can run in Rust through ONNX Runtime, which ships a DLL, or in rten, if rten supports its operations, or in the webview through `linkseg-web`. Phase 2 also needs tests of the drop heuristic on real songs. No modern open drop detector exists to compare it against, and LinkSeg's labels were trained on pop, not EDM. Phase 3 needs a decision on how long a crossfade may be before the frozen frame shows, and on whether a dual-scene live crossfade is worth twice the GPU cost. It also needs a decision on what the PC-sound and microphone inputs do once looping is gone. Odd time signatures need a test: no non-4/4 accuracy was found for any tool, and the phrase grid assumes 4/4. Key and mode detection, which the color choice would use, was not researched in depth. Finally, every motion budget, envelope time and tier threshold in this report is an engineering default. They should be tuned with the evaluation design from Graf, Opara and Barthet: compare the script against today's links and against a non-reactive baseline, and rate "fits the music", "drop impact" and "smooth in soft parts" ([Graf et al. 2021](https://arxiv.org/pdf/2106.10134)).

## Conclusion

The main point is that "intelligent" animation comes mainly from **knowing the song's shape ahead of time**, not from a smarter reaction to each sound. A live meter, however well tuned, cannot ramp toward a drop it has not heard yet. It also cannot know that this chorus is the biggest moment of the song. Cheap, permissive local models now give exactly that map in seconds. The hard part therefore moves from audio science to choreography: the tier budgets, the family pairings and the anticipation shapes. Those are rules the app owns and can tune, and an LLM can improve them without ever being trusted with a timestamp.

The engine change is also simpler than it looks. Every setting already passes through `live()`, and every unbounded motion is already a running total. Replace the frame clock with song time, and replace the running totals with precomputed tables, and the whole picture becomes a pure function of the song position. Seeking, pausing, repeatable export and MIDI override then follow almost for free. The looping system was the right design for a picture with no music. With a song-time script, the looping code can be removed.
