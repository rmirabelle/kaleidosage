# AI Musical Interpretation for Music-Driven Kaleidoscope Animation (as of 2026-10-21)

## Q1. Audio-native LLMs: what they accept, what they cost, how well they hear music (especially timing)

### Takeaway
Gemini (2.5 / 3.x) and OpenAI gpt-audio / gpt-realtime accept whole-song audio, and Gemini is far cheaper and better at music timing. But no audio LLM gives beat-accurate or even reliably second-accurate timestamps: the best models hit only about 55-70% of section-change onsets within a 3-second tolerance. Claude still has no raw-audio input in the API. Audio LLMs fit "what is this song / section like" questions, not "when exactly does X happen" questions.

### Cited Findings
**Google Gemini**
- Audio costs 32 tokens per second (1 minute = 1,920 tokens). The limit is 9.5 hours of audio per prompt. Prompts can reference sections in `MM:SS` format. Inline requests are capped at 20 MB, and the Files API takes larger files. Formats: WAV, MP3, AIFF, AAC, OGG, FLAC, M4A, Opus, WebM and others. The docs list "Emotion detection in speech and music" as a use case. The audio examples use `gemini-3.8-flash`. — [Gemini audio docs](https://ai.google.dev/gemini-api/docs/audio)
- Paid-tier price per 1M audio input tokens: Gemini 3 Flash Preview $1.00 (labelled "Our legacy Flash model"), Gemini 2.5 Flash $1.00, 2.5 Flash-Lite $0.30, 3.1 Flash-Lite $0.50, 3.5 Flash-Lite $0.30. Gemini 3.1 Pro Preview has no separate audio rate (text input $2.00/M up to 200k tokens; output $12.00/M). Gemini 2.5 Pro: $1.25 in / $10 out. Data use: free-tier content is "used to improve products"; paid-tier content is not. Deprecations on the page: Gemini Omni Flash Preview shuts down 2026-10-22, and 2.5 Flash Image shut down 2026-10-02. — [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) (fetched 2026-10-21)
- Developers report steadily growing **timestamp drift** in Gemini 3 Flash and 3.1 Pro on an 11:49 audio file (3.1 Pro reached about -16 s by the end). Many earlier threads report timestamp hallucinations or regressions in 2.0 and 2.5, and one says prompt start/end times were ignored. These are user reports, not official confirmations. — [Gemini forum: drift in 3 Flash / 3.1 Pro](https://discuss.ai.google.dev/t/bug-gemini-3-flash-and-3-1-pro-progressive-timestamp-drift-in-audio-transcription/129501); [2.5 regression](https://discuss.ai.google.dev/t/refer-to-timestamps-performance-severely-degraded-2-5-flash-2-5-pro-gemini-and-vertex-api/109501); [2.0 Flash-Lite hallucinations](https://discuss.ai.google.dev/t/gemini-2-0-flash-lite-timestamp-hallucinations-for-audio-but-not-video-since-going-into-ga/69370); [2.5 start/end ignored](https://discuss.ai.google.dev/t/gemini-2-5-timestamp-references-for-start-and-end-in-the-prompt-are-being-ignored/82375)

**OpenAI**
- Audio-input models and prices per 1M audio input tokens: gpt-audio and gpt-audio-1.5 $32 (text $2.50 in / $10 out); gpt-audio-mini $10; gpt-realtime, -1.5, -2, -2.1 $32; gpt-realtime-mini and -2.1-mini $10. gpt-4o-transcribe is about $0.006/min. **gpt-4o-audio-preview is no longer on the pricing page**, so treat it as retired or legacy. No GPT-5-family model is listed with audio input. — [OpenAI pricing](https://developers.openai.com/api/docs/pricing) (fetched 2026-10-21)
- OpenAI does not publish a per-minute audio token rate for gpt-audio. A third-party analysis assumes about 1,200 tokens per minute. — [Forasoft (third party)](https://www.forasoft.com/article/openai-realtime-api-pricing); [OpenRouter gpt-audio listing via search](https://openrouter.helicone.ai/openai/gpt-audio/uptime)
- GPT-5 family text prices per 1M (in/out): gpt-5-nano $0.05/$0.40, gpt-5-mini $0.25/$2.00, gpt-5.4-mini $0.75/$4.50, gpt-5.4 $2.50/$15, gpt-5.5 $5/$30, gpt-5.6-luna $0.20/$1.20, gpt-5.6-terra $2/$12, gpt-5.6-sol $4/$20. — [OpenAI pricing](https://developers.openai.com/api/docs/pricing)

**Anthropic Claude**
- I found no official evidence that the Claude API accepts raw audio as of mid/late 2026. A Feb 2026 SDK issue requests "Audio input support in Messages API". A July 2026 feature request says Claude cannot process audio. Anthropic's privacy help says voice-mode speech is converted to text before it reaches Claude. Some SEO sites claim audio support, but they are unreliable. — [anthropic-sdk-python run/issue](https://github.com/anthropics/anthropic-sdk-python/actions/runs/22354407550); [feature request](https://claudeissues.com/issue/73566-feature-allow-claude-to-hear-and-process-audio); [Anthropic privacy article](https://privacy.anthropic.com/zh-CN/articles/10067984-在claude移动应用程序上使用语音输入功能时会收集哪些个人数据)

**Temporal-grounding benchmark: MusTBench (arXiv 2605.29300, 2026)** — the most directly relevant evidence
- Protocol: zero-shot, full track, temperature 0. TSG = timestamp of a musical change, scored Hit@3s (correct within ±3 s). MTR = interval IoU/F1. LTR/GTO = multiple choice. — [MusTBench paper](https://arxiv.org/html/2605.29300v2)
- Results (TSG onset Hit@3s / offset Hit@3s / MTR IoU / total avg):
  - Gemini 2.5 Flash 60.0 / 71.5 / 24.8 / 41.8
  - Gemini 2.5 Pro 57.5 / 57.0 / 22.4 / 40.3
  - Gemini 3 Flash 55.0 / 42.5 / 25.7 / 38.1
  - Gemini 3 Pro 60.0 / 44.5 / 29.2 / 36.6
  - **GPT Audio 21.5 / 1.5 / 13.8 / 22.6**; GPT Audio 1.5 14.0 / 3.5 / 13.7 / 23.5
  - Qwen3-Omni-30B-A3B 62.5 / 9.5 / 8.8 / 30.2; Qwen2.5-Omni-7B 39.0 / 3.5 / 6.4 / 24.3
  - Music Flamingo 8B 53.0 / 24.0 / 10.1 / 31.1; AF-Next 8B 17.0 / 3.0 / 2.2 / 18.8
  - Phi-4-mm 14.6 / 0.0
  - MusT-7B (fine-tuned by the authors) 55.5 / 62.5 / 22.6 / 44.1
  — [MusTBench Table 3](https://arxiv.org/html/2605.29300v2)
- Failure modes the authors document: models "recognize" changes but cannot place boundaries; offsets are much harder than onsets; offset predictions collapse to round anchors such as 120 s and 180 s (temporal priors); some timestamps fall beyond the audio's duration; Flash beats Pro and Gemini 2.5 beats Gemini 3. The authors read this as evidence that temporal grounding is a specialized skill, not a by-product of reasoning. — [MusTBench](https://arxiv.org/html/2605.29300v2); [abstract](https://arxiv.org/abs/2605.29300)
- TAG-Bench (2026, general audio): the best model reaches 31.2 mIoU and only 21.5% recall at IoU ≥ 0.7. No model exceeds 13.2% count accuracy on "how many times does X occur" queries; all of them under-count. — [search summary of TAG-Bench / alphaxiv](https://www.alphaxiv.org/abs/2609.01542) (abstract-level only)
- TimeAudio (2025) says LALMs "struggle to accurately understand timestamps" and are limited to short audio. It traces the cause to timestamp representation, architecture and data. — [TimeAudio README](https://huggingface.co/lysanderism/TimeAudio/blob/main/README.md); [papers.cool 2511.11039](https://papers.cool/arxiv/2511.11039)

**Music-understanding benchmarks (non-temporal)**
- MMAU-Pro: Gemini 2.5 Flash 59.2% overall. Best fully open model Audio Flamingo 3 51.7%. Qwen2.5-Omni-7B 52.2%. The AAAI version reports different numbers (57.33% / 45.9%). — [MMAU-Pro arXiv](https://arxiv.org/abs/2508.13992); [AAAI](https://ojs.aaai.org/index.php/AAAI/article/view/39430)
- MMAU-Pro music subset: Music Flamingo 65.60 vs prior best Gemini 2.5 Flash 64.90. MuChoMusic: Music Flamingo 74.58 vs Qwen3-Omni 52.10. — [Music Flamingo project page](https://research.nvidia.com/labs/adlr/MF)
- Music Flamingo (NVIDIA + UMD, arXiv 2511.10289): 7B, about 15 min audio context, theory-aware captions (harmony, structure, timbre, lyrics), trained on MF-Skills (~2M songs) plus chain-of-thought and GRPO RL. **License: non-commercial research only.** — [HF model card](https://huggingface.co/nvidia/music-flamingo-hf); [arXiv](https://arxiv.org/html/2511.10289v1)

### Inferences
- With ±3 s tolerance and success rates of only about 55-70% on onsets, audio LLMs are unusable as the timing source for a drop or a beat. One beat at 120 BPM is 0.5 s, and a visible cut must land within about 50 ms. Use them only for labels and descriptions per section, with times supplied by DSP.
- On music timing, Gemini Flash (2.5 or 3.x) is the best value cloud audio model. OpenAI gpt-audio scores poorly on music timestamps (offset Hit@3s 1.5-3.5%) and costs more per token. The OpenAI key is better used for a text LLM on extracted features (Q2).
- Claude can only take part through text (features JSON), and it is fully suitable for that role.
- A practical way to use audio LLMs is to anchor them: give Gemini the DSP section boundaries ("section 3 = 01:12-01:41") and ask it to describe or label each one. Do not ask it to find the boundaries. This avoids the boundary failure mode that MusTBench documents.

### Gaps
- I found no official OpenAI tokens-per-minute figure for gpt-audio, and no official maximum audio duration or file size for gpt-audio in Chat Completions (the guide page did not state them).
- I could not confirm whether Gemini 3.x Pro has a separate audio price.
- I did not find Kimi-Audio, Step-Audio, SALMONN, LLark, MU-LLaMA, MusiLingo or Audio Flamingo 3 scores on a music temporal benchmark. Most are 2023-2025 research models, and MusTBench evaluated their successors (AF-Next, Music Flamingo, Qwen Omni).
- I did not verify CMI-Bench, MMAR or "SongEval" numbers.

## Q2. Hybrid: DSP/MIR features -> text LLM -> choreography plan (prior work)

### Takeaway
The closest prior work (TU Wien, 2026) uses exactly the hybrid: an offline separation, transcription and feature backend feeds multi-stage LLM prompts. The LLM selects shader layers and maps features to uniforms, and deterministic runtime code then drives the shaders from time-synced feature streams. No source shows an LLM producing frame-accurate timing itself.

### Cited Findings
- "Song-Adaptive Music Visualization with LLMs" (S. Antes, TU Wien, talk 2026-05-22): an offline backend with source separation, MIDI transcription, rhythmic, melodic and timbral descriptors, and segment structure. "Multi-stage" cascading LLM prompts produce a section-aware configuration. The LLM selects shader layers for a WebGPU engine and defines mappings from calibrated audio features to shader uniforms. At runtime these mappings run deterministically, with time-synchronized feature streams, normalization ranges and smoothing functions. The evaluation combines user studies and quantitative audio-visual temporal correspondence. The page does not name the LLM or give results. — [TU Wien talk page](https://erzherzog.cg.tuwien.ac.at/node/10564)
- LaunchpadGPT (2023): a language model trained to emit (R, G, B, X) tuples from audio features serialized as text, for Launchpad light shows. It is a trained sequence model, not a general LLM used as a planner. — [arXiv 2307.04827](https://arxiv.org/html/2307.04827v3)
- MBM's Music Visualizer (ComfyUI) loads prompt keyframes from JSON and blends between them with per-frame audio modifiers, so loud passages speed up transitions. — [ComfyUI node docs](https://comfy.icu/node/mbmPromptSequenceInterpolator)
- Neural Frames separates stems so parameters can react to the kick, vocals and so on, with frame-level control. I found no evidence that it uses an LLM to write keyframes. — [Neural Frames audio visualizer](https://www.neuralframes.com/audio-visualizer)

### Inferences
- The TU Wien design validates the split the user is considering. The LLM is a "VJ / lighting designer" that writes a per-section mapping spec (which parameters, target ranges, curve shapes, which stem or feature drives what). The engine applies that spec frame by frame from DSP feature curves.
- A compact feature summary (sections with start/end, loudness stats, per-stem activity, tempo, onset density, trend slope) is a few thousand tokens. A text LLM reasons over it well because the numbers are given, not perceived.

### Gaps
- I found no published evaluation (with numbers) of an LLM-authored music visualization plan against hand-made or rule-based mappings. The TU Wien results were not online.
- I found no practitioner blog posts that measured GPT or Claude timing output on music features.

## Q3. Lessons from music-to-motion and music-to-lighting ML

### Takeaway
Learned lighting and dance systems need explicit alignment and structure awareness. Pure frame-level models flicker or lose long-term coherence, so the best systems are coarse-to-fine: global structure first, local detail second. That is the same split as "LLM plans sections, DSP executes beats".

### Cited Findings
- Skip-BART (ICLR 2026 poster, arXiv 2506.01482): input is OpenL3 512-d embeddings in 1 s windows with a 0.1 s hop (10 fps), up to 102.4 s. Output is per-frame light hue and value (intensity). A skip connection from music frame i-1 to light frame i was needed because without it "the light frequency and pattern changes do not always align with the music". Sampling blocks hue or value jumps above set thresholds. — [Skip-BART](https://arxiv.org/html/2506.01482v2); [ICLR](https://iclr.cc/virtual/2026/poster/10008746)
- Skip-BART human ratings (7-point, n=38): ground truth 4.51, Skip-BART 4.35 (n.s. vs GT, p=0.724), rule-based 2.67 (p<0.001). The rule-based baseline "tends to produce slow, smooth transitions". Skip-BART sometimes "fails to maintain the long-term rhythmic stability". The authors propose beat tracking and section (verse/chorus) detection as future inputs. They also caution against direct emotion-to-color mapping (green appeared with angry groove metal). — [Skip-BART](https://arxiv.org/html/2506.01482v2)
- SeqLight (NeurIPS 2026): hierarchical multi-light HSV control from music via imitation learning. — [NeurIPS poster](https://neurips.cc/virtual/2026/poster/150106)
- Dolby (arXiv 2602.08838): AI-assisted ambient-light design that extracts salient audio and video features to generate an **editable preliminary design**, which a human then refines. — [arXiv 2602.08838](https://arxiv.org/abs/2602.08838)
- EDGE (CVPR 2023) conditions dance diffusion on Jukebox embeddings. Lodge (CVPR 2024) is coarse-to-fine: a global diffusion stage makes "characteristic dance primitives" from coarse music-dance correlation, and a local stage fills in detail guided by them and by choreographic rules. Lodge++ extends this to ultra-long dances given genre. — [EDGE](https://openaccess.thecvf.com/content/CVPR2023/html/Tseng_EDGE_Editable_Dance_Generation_From_Music_CVPR_2023_paper.html); [Lodge](https://mlanthology.org/cvpr/2024/li2024cvpr-lodge/); [Lodge++](https://hyper.ai/en/papers/2410.20389)

### Inferences
- Lessons for KaleidoSage: (1) drive intensity from a smoothed loudness/energy curve but cap per-frame jumps, as Skip-BART's sampling does; (2) take beat and section boundaries from DSP, which even the lighting authors list as missing inputs; (3) a two-level plan (section-level "primitives" or styles plus beat-level modulation) matches Lodge; (4) do not hard-code emotion-to-palette rules, and treat color choice as a style decision.
- Training a custom Skip-BART-style model is not justified for this app: it needs paired data, and the gain over a good rule system plus LLM style choice is not shown.

### Gaps
- I did not find a 2025-2026 paper on music-to-*abstract-visual-parameter* generation (as opposed to lights or dance) with a user study.

## Q4. Dynamic emotion and embeddings for per-section mood or palette

### Takeaway
Arousal (energy) is predictable from audio fairly well, about as well as loudness and onset density already capture it. Valence is weaker. Embeddings (CLAP, MERT, MuQ) are a reasonable way to pick a mood or palette per section, but I found no head-to-head valence/arousal benchmark for them.

### Cited Findings
- Eerola's 2025 meta-analysis (34 studies, 204 models): valence r = 0.67, arousal r = 0.81. Linear and tree-based methods often beat neural networks in regression. — [C4DM seminar summary](https://c4dm.eecs.qmul.ac.uk/news/2025-06-06.C4DM-Seminar_Tuomas_Eerola/)
- DEAM: 1,802 songs with valence/arousal at 2 Hz resolution (dynamic). EmoMusic: 744 clips of 45 s. — [EmoMusic overview](https://www.emergentmind.com/topics/emomusic)
- MusAV gives relative arousal-valence annotations to validate audio models. — [MusAV ISMIR 2022](https://ismir2022program.ismir.net/poster_286.html)

### Inferences
- For KaleidoSage, "arousal over time" is close to a smoothed loudness + onset-density + spectral-brightness composite, which DSP computes exactly and at no cost. Valence (happy/sad, major/minor) could inform palette warmth. A text LLM given key/mode, tempo and an audio-LLM caption per section can make that choice as well as a regression model.
- A local CLAP model (text-audio similarity) could score each section against prompts such as "dreamy ambient" or "aggressive drop" to pick a visual preset offline, with no cloud upload. This is plausible but not verified here.

### Gaps
- I found no benchmark comparing MuQ, MERT and CLAP on DEAM or EmoMusic, and no LP-MusicCaps quality numbers.

## Q5. Cost, latency, privacy for a 4-minute song

### Takeaway
All options cost cents or fractions of a cent per song. Gemini Flash audio costs about $0.01-0.02, OpenAI gpt-audio about $0.05-0.20 (estimate), and a text LLM on features about $0.01-0.15. Cost is not the deciding factor. Privacy and accuracy are.

### Cited Findings
- Gemini: 240 s × 32 tokens/s = 7,680 audio tokens. — [Gemini audio docs](https://ai.google.dev/gemini-api/docs/audio). At $1.00/M (2.5 Flash / 3 Flash) that is about $0.008 input; at $0.30/M (Flash-Lite) about $0.002. — [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- OpenAI gpt-audio is $32/M audio input and gpt-audio-mini $10/M. — [OpenAI pricing](https://developers.openai.com/api/docs/pricing). At the third-party assumption of about 1,200 tokens/min, 4 min ≈ 4,800 tokens ≈ $0.15 (gpt-audio) or $0.05 (mini). — [Forasoft](https://www.forasoft.com/article/openai-realtime-api-pricing) (unofficial rate)
- Gemini paid tier: prompts are not "used to improve products". Free tier: they are. — [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)

### Inferences
- Text-LLM-on-features estimate (my arithmetic): about 15k input + 4k output tokens. gpt-5-mini ≈ $0.004 + $0.008 ≈ $0.012; gpt-5.4 ≈ $0.04 + $0.06 ≈ $0.10; gpt-5.6-luna ≈ $0.008.
- Latency: offline pre-analysis per song (seconds to about a minute for upload + reasoning) is fine if the plan is cached by file hash. Real-time LLM control is unnecessary.
- Privacy: uploading a user's music to a cloud model sends copyrighted audio to a third party. A features-only text prompt sends no audio. That favors the hybrid design as the default, with audio upload as opt-in. If Gemini is used, require a paid-tier key so the data is not used for training.

### Gaps
- I did not fetch OpenAI's API data-use or retention terms or Anthropic's API terms in this session.
- I found no measured end-to-end latency for whole-song Gemini or gpt-audio analysis.

## Q6. Reliability: structured output, determinism, validation

### Takeaway
OpenAI Structured Outputs (strict) and Gemini structured output enforce JSON *shape*. Neither promises correct *values*, and both docs tell you to validate. Make the LLM choose from enums and bounded ranges at section level. Let code clamp, snap and interpolate.

### Cited Findings
- OpenAI: Structured Outputs "ensures the model will always generate responses that adhere to your supplied JSON Schema". Exceptions: refusals, and truncation at max tokens. The guarantee covers format, not correctness. The docs recommend `gpt-6-astra` for new projects. Note the conflict: that model was not in the pricing page fetch. — [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- Gemini: supports a subset of JSON Schema. `minLength`, `maxLength`, `uniqueItems`, `min/maxProperties` and similar are **not enforced** and are silently stripped; `minItems` and `maxItems` are enforced. Very large or deeply nested schemas may fail with 400. The docs say: "always validate values in your application" and "Implement robust error handling for schema-compliant but semantically incorrect outputs." — [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- Even at temperature 0, audio models produce out-of-range and prior-anchored timestamps (120 s, 180 s, beyond track end). — [MusTBench](https://arxiv.org/html/2605.29300v2)

### Inferences
- Schema design: the LLM outputs, per section id (given by DSP), these fields: `intent` (enum: build, drop, release, sustain, breakdown...), `intensity` 0-1, `targetParams` (enum list of known engine parameters with range fraction), `curve` (enum: linear, easeIn, easeOut, exp, step, sine), `driver` (enum: loudness, kick, bass, vocals, onsetDensity, none), `palette/mood` tag, and `transitionIn` (enum: cut-on-downbeat, crossfade-bars:N). It never outputs a free-form time. Code maps section ids to exact times, snaps to downbeats, clamps ranges and rejects unknown enums.
- Determinism: cache the plan per audio hash, store it with the playlist, and let the user re-roll. Then nondeterminism becomes a feature ("another interpretation") rather than a bug.
- Fallback: if the LLM fails or there is no key, a rule-based mapper from the same DSP features produces a plan with the same schema. The AI is therefore an enhancement, never a dependency.

### Gaps
- I did not verify OpenAI's schema-subset limits (max properties or nesting), because that part of the page was cut off.

## Q7. Recommended division of labor (DSP vs AI)

### Takeaway
DSP owns all time: beats, downbeats, sections, onsets, energy and stem curves. AI owns taste: per-section intent, which parameters move, how far, with what curve and palette, all through a validated schema keyed to DSP section ids. An audio LLM (Gemini Flash) is optional and only labels or describes DSP-given sections. It never locates events.

### Cited Findings
- Best audio-LLM timestamp accuracy is only about 55-72% within ±3 s, and boundary offsets are much worse. — [MusTBench](https://arxiv.org/html/2605.29300v2)
- The prior system closest to this app splits work the same way: the LLM picks layers and feature-to-uniform mappings, and deterministic runtime code drives them from time-synced feature streams. — [TU Wien](https://erzherzog.cg.tuwien.ac.at/node/10564)
- Lighting ML authors name beat tracking and section detection as the missing inputs for temporal coherence. — [Skip-BART](https://arxiv.org/html/2506.01482v2)
- Commercial lighting/visual AI is framed as an "editable preliminary design" for a human to refine. — [Dolby 2602.08838](https://arxiv.org/abs/2602.08838)

### Inferences
- Recommended pipeline:
  1. Local DSP/MIR (Rust or a bundled model): tempo and beat/downbeat grid, section boundaries, per-frame loudness (LUFS-ish), spectral centroid and flux, onset density, optional stem activity, key/mode. Summarize per section (mean, peak, slope, relative rank) into compact JSON.
  2. Optional Gemini Flash audio pass (opt-in upload): "For each of these N sections [given MM:SS ranges], give genre/mood/instrumentation/energy-character tags." It returns structured JSON. The LLM only reads the ranges it is given.
  3. Text LLM (gpt-5-mini / gpt-5.4 / Claude / Gemini) with the engine's parameter catalog (names, safe ranges, visual meaning) plus the features JSON (+ tags) returns a section plan via strict JSON schema.
  4. Deterministic compiler: validate, clamp and snap plan transitions to downbeats; build curves; modulate within each section by live feature curves (loudness → intensity, kick → pulse), with jump limits.
  5. Rule-based fallback planner with the same schema. Cache by file hash. Let the user edit or re-roll.
- Why: it keeps all time-critical decisions in code with ~10 ms accuracy, uses AI only where its documented strength lies (semantic judgment and description), costs about a cent per song, works without uploading audio, and degrades gracefully with no key.

### Gaps
- There is no empirical evidence yet that LLM-chosen mappings beat a well-tuned rule system for viewers. A small A/B test inside the app would be needed.
