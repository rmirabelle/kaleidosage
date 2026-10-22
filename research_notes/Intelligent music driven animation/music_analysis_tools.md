# Music Analysis Tools for Music-Driven Animation (state of the art, late 2026)

Scope: offline analysis of a static audio file into time-indexed structure and expressive signals, for a Tauri 2 (Rust + React/TS + WebGL 2) Windows app. Research date: 2026-10-21.

## 1. Structure / segmentation (section boundaries and labels)

### Takeaway
SongFormer (ASLP-lab, Sept/Oct 2025) is the current open-source accuracy leader on pop structure. All-In-One (allin1) is the practical baseline, and its authors' Raveform work (TISMIR, April 2026) adds EDM labels (buildup, drop, breakdown). For a Rust/ONNX app, the most deployable option today is LinkSeg (ISMIR 2024), which has a 1.5 MB ONNX port that needs only beat times plus a log-mel input. Classic MSAF and librosa novelty methods are older and stale but license-clean fallbacks.

### Cited Findings
**SongFormer (2025)**
- arXiv 2510.02797. It fuses MuQ and MusicFM self-supervised features (30 s and 420 s windows), downsampled to ~8.33 Hz, then runs a 4-layer Transformer (hidden size 512). It is trained on SongFormDB (10k+ songs; another listing says 14k+) — [arXiv HTML](https://arxiv.org/html/2510.02797v2); [awesomepapers listing](https://awesomepapers.io/speech-audio/papers/hao2025songformer)
- SongFormBench-HarmonixSet (200 songs), ACC / HR.5F / HR3F: SongFormer 0.807 / 0.696 / 0.780 (best data mix), or 0.795 / 0.703 / 0.784 (HX only). All-In-One scores 0.740 / 0.596 / 0.730, LinkSeg-7Labels 0.780 / 0.630 / 0.762, and Gemini 2.5 Pro 0.748 / 0.423 / 0.813 — [arXiv HTML Table 2](https://arxiv.org/html/2510.02797v2)
- On SongFormBench-CN (100 Chinese pop songs), SongFormer scores 0.891 / 0.688 / 0.851 and All-In-One 0.834 / 0.563 / 0.771 — [arXiv HTML](https://arxiv.org/html/2510.02797v2)
- The label set evaluates 7 classes and outputs 8: intro, verse, chorus, bridge, inst, outro, silence, pre-chorus. Pre-chorus maps to verse in evaluation. There are no build-up or drop labels — [GitHub ASLP-lab/SongFormer](https://github.com/ASLP-lab/SongFormer)
- The code is CC-BY-4.0, and the repo states no model-weight license. It needs Python 3.10 with conda, MuQ and MusicFM submodules, and checkpoints downloaded from Hugging Face. It is tested only on Ubuntu 22.04, with a single GPU — [GitHub](https://github.com/ASLP-lab/SongFormer)
- Claimed speed is 2–4 s per song on an NVIDIA L40, against LinkSeg 3–5 s, All-In-One 9–12 s, and Gemini 2.5 Pro 30–90 s — [GitHub](https://github.com/ASLP-lab/SongFormer)
- No SALAMI results were reported in the material reviewed — [arXiv HTML](https://arxiv.org/html/2510.02797v2)

**All-In-One (allin1, mir-aidj / Taejun Kim, 2023)**
- Outputs bpm, beats, downbeats, beat_positions (1,2,3,4…) and segments (start, end, label). Labels are start, end, intro, outro, break, bridge, inst, solo, verse, chorus. It can also emit frame activations and embeddings at 100 FPS — [GitHub mir-aidj/all-in-one](https://github.com/mir-aidj/all-in-one)
- The license is MIT. Dependencies are PyTorch, NATTEN (downloaded on Linux, built from source on Windows), madmom from GitHub, Demucs (it separates stems internally), and optional FFmpeg — [GitHub](https://github.com/mir-aidj/all-in-one)
- On an RTX 4090 with an i9-10940X, 10 songs (33 min) took 73 s with harmonix-all. The README warns that MP3 decoders add 20–40 ms offsets, and recommends WAV — [GitHub](https://github.com/mir-aidj/all-in-one)
- Install-pain issues: #30 "Incompatibility issues with NATTEN v0.17.5" (May 2025), #28 macOS "No module named 'torch'", #11 natten install failure, #17 MPS alternatives to NATTEN. The tracker shows 15 open issues. Issue #40 (Oct 3, 2026) asks about commercial use of the pretrained models and has no maintainer reply — [issues](https://github.com/mir-aidj/all-in-one/issues); [issue #40](https://github.com/mir-aidj/all-in-one/issues/40)
- Its madmom dependency matters for licensing: madmom code is BSD, but its model and data files are CC BY-NC-SA 4.0, and commercial use requires contacting Gerhard Widmer — [PyPI madmom](https://pypi.org/project/madmom/)

**Raveform (EDM structure; mir-aidj; TISMIR vol. 9, published April 20, 2026)**
- The data covers 4,902 DJ mixes and 56,873 track links. 1,423 tracks have expert structural annotations — [TISMIR](https://transactions.ismir.net/articles/10.5334/tismir.288)
- The EDM vocabulary is Intro, Buildup, Breakdown, Drop, Cooldown, Bridge, Outro, Ambient-intro and Ambient-outro — [TISMIR](https://transactions.ismir.net/articles/10.5334/tismir.288)
- The All-In-One baseline trained on Raveform scores boundary HR.5F 0.835, beat F1 0.991 and downbeat F1 0.965, with label PWF 0.847 and Sf 0.890. Trained on Harmonix and tested on Raveform, HR.5F drops to 0.635. madmom on Raveform scores beat F1 0.947 and downbeat F1 0.669 — [TISMIR](https://transactions.ismir.net/articles/10.5334/tismir.288)
- Phrasing: boundaries tend to fall on multiples of 4 or 8 measures. The most common segment length is 16 measures (~30 s at 128 BPM) — [TISMIR](https://transactions.ismir.net/articles/10.5334/tismir.288)
- The project page links the structure model to the all-in-one repo and says "v2 will be released soon". The dataset is on Hugging Face, with YouTube IDs. No license is stated — [Raveform page](https://mir-aidj.github.io/raveform/)

**LinkSeg (Buisson, McFee, Essid, ISMIR 2024) + ONNX browser port**
- The ONNX model is ~1.5 MB (opset 17). Inputs are per-beat log-mel windows (N,1,64,64) at 22,050 Hz, n_fft 1024, hop 256, 64 mels. It needs beat times from any tracker and at least 4 beats, and works on the full mix with no separation — [HF elicwhite/linkseg-7c-onnx](https://huggingface.co/elicwhite/linkseg-7c-onnx)
- Outputs are labels (silence, verse, chorus, intro, outro, inst, bridge) and per-beat boundary activations. Decoding is peak-picking plus majority vote, done in JS — [HF](https://huggingface.co/elicwhite/linkseg-7c-onnx)
- Model and weights are CC-BY 4.0, and the linkseg-web glue code is MIT. The port is "validated byte-exact" against the PyTorch/DGL original. The npm package `linkseg-web` uses WebGPU with a WASM fallback — [HF](https://huggingface.co/elicwhite/linkseg-7c-onnx)
- Accuracy is HX ACC 0.780 and HR.5F 0.630 (see the SongFormer table) — [arXiv](https://arxiv.org/html/2510.02797v2)

**Other 2025–2026 work**
- "Temporal Adaptation of Pre-trained Foundation Models for MSA" (arXiv 2507.13572, the "TA" row: HX ACC 0.787, HR3F 0.801) — [arXiv](https://arxiv.org/pdf/2507.13572); [SongFormer table](https://arxiv.org/html/2510.02797v2)
- Other papers found: "BASS: Benchmarking Audio LMs for Musical Structure" (arXiv 2602.04085), "Unsupervised Evaluation of Deep Audio Embeddings for MSA" (arXiv 2603.27218), and the ISMIR 2025 poster "Lose the Frames: Event-Based Metrics for MSA" — [BASS](https://arxiv.org/pdf/2602.04085); [2603.27218](https://arxiv.org/pdf/2603.27218); [ISMIR 2025](https://ismir2025program.ismir.net/poster_167.html)

**MSAF / librosa (classic)**
- MSAF bundles librosa features with algorithms such as Checkerboard Kernel (Foote novelty), Laplacian Segmentation and Constrained Clustering. Its latest PyPI release is v0.1.80 (June 25, 2023) — [pyup](https://pyup.io/packages/pypi/msaf/); [ISMIR 2015 LBD](https://www.ismir2015.uma.es/LBD/LBD30.pdf); [readthedocs](https://msaf.readthedocs.io/)

### Inferences
- For pop/rock, SongFormer > LinkSeg ≈ TA > All-In-One on functional labels and boundaries. None of them labels build-ups or drops except a Raveform-trained All-In-One.
- For an EDM-heavy kaleidoscope app, a Raveform-style label set is the closest match to "visual crescendo/drop". Watch for the all-in-one v2 release.
- The cheapest deployable path is Beat This (Rust crate, below) for beats, then LinkSeg ONNX for sections, both running in `ort` or the browser. SongFormer needs two large SSL backbones (MuQ, MusicFM) and is GPU/Linux-oriented, so it is a poor fit for a Windows desktop bundle without ONNX export work.
- Licensing caveat: allin1 (MIT code) relies on madmom's DBN, whose model and data files are NC-licensed. Weight licensing for allin1 is unresolved (issue #40).

### Gaps
- SALAMI scores for SongFormer, LinkSeg and allin1 were not found in the sources read.
- No model sizes or CPU timings for SongFormer. No ONNX export of SongFormer or allin1 was found.
- No license was found for the Raveform models or for the allin1 model weights.
- Essentia's own segmentation algorithms (e.g., SBic) were not evaluated in the sources.

## 2. Beat, downbeat, tempo, meter, bar/phrase grid

### Takeaway
Beat This! (CPJKU, ISMIR 2024, MIT) is state of the art for beats and downbeats without DBN post-processing. It already has a pure-Rust port (`beat-this` crate 1.0.0, May 2026) that analyzes a 4.5-min song in ~4.6 s on CPU. Phrase-level (4/8/16-bar) grids are not output by any tool. Derive them from downbeats plus section boundaries, since EDM phrases are typically 16 bars.

### Cited Findings
- Beat This! drops the DBN and alternates convolutions with transformers. The authors say it "surpasses the current state of the art in F1 score despite using no DBN" but is worse on continuity metrics — [arXiv 2407.21658](https://arxiv.org/abs/2407.21658)
- GTZAN beat / downbeat F1: full model (~20M params) 89.1 / 78.3, small (~2M params) 88.8 / 77.2, full + DBN 88.1 / 77.4. Hung et al. (SpecTNT + DBN, ~4M) scores 88.7 / 75.6 — [arXiv HTML](https://arxiv.org/html/2407.21658)
- Code and weights are MIT. The final models are ~78 MB and the small models ~8.1 MB. It needs PyTorch 2+, and madmom only for optional DBN — [GitHub CPJKU/beat_this](https://github.com/CPJKU/beat_this)
- Rust port `beat-this` 1.0.0 (2026-05-30, MIT, "Ported with Claude", credits beat_this_cpp). The default backend is rten (pure Rust, no system libraries), with an optional `ort` backend. On an M4 CPU, a 4:32 track took 5.1 s in Python, 4.6 s in Rust rten and 4.6 s in Rust ort. Model sizes are 270 KB for the mel front end, 10 MB small and 83 MB full. Outputs are JSON, .beats and click WAV. Only linux-x86_64 is listed as a docs.rs platform — [docs.rs beat-this 1.0.0](https://docs.rs/crate/beat-this/1.0.0); [repo danigb/beat-this-rs](https://github.com/danigb/beat-this-rs)
- Other exports exist: ONNX with WebGPU (musetric/beat-this-onnx) and Core ML — [HF musetric](https://huggingface.co/musetric/beat-this-onnx); [HF schism-audio](https://huggingface.co/schism-audio/beat-this-coreml)
- allin1 also outputs beats, downbeats, beat positions and BPM. On EDM (Raveform), All-In-One beats madmom on downbeats: 0.965 against 0.669 F1 — [GitHub](https://github.com/mir-aidj/all-in-one); [TISMIR](https://transactions.ismir.net/articles/10.5334/tismir.288)
- madmom model files are CC BY-NC-SA 4.0 — [PyPI](https://pypi.org/project/madmom/)
- EDM phrase practice: segment boundaries fall on multiples of 4 or 8 measures, and 16 measures is the mode — [TISMIR](https://transactions.ismir.net/articles/10.5334/tismir.288). Producer guides describe 8- and 16-bar buildups as most popular — [soundbridge](https://soundbridge.io/8-bar-edm-buildup)

### Inferences
- The `beat-this` crate fits the Rust backend directly (rten = no DLL to ship). Windows should be verified, since only Linux is listed as a docs.rs build target.
- Phrase grid: group downbeats into 4-bar units, then snap section boundaries (LinkSeg or novelty) to the nearest 4/8/16-bar multiple.

### Gaps
- No direct BeatNet or Essentia RhythmExtractor2013 accuracy numbers were collected in this pass.
- No Windows timing for the `beat-this` crate. No published meter/time-signature accuracy for non-4/4 music.

## 3. Build-up and drop detection (EDM/pop)

### Takeaway
Dedicated drop-detection research is sparse and old (ISMIR 2014, MediaEval 2014). The modern route is structure models trained with EDM labels (Raveform's Buildup / Drop / Breakdown vocabulary on All-In-One, 2026). Otherwise, use heuristics: rising onset density, rising noise and brightness (riser sweeps), loss of low-frequency energy during the build, then a sudden bass and kick return at a downbeat.

### Cited Findings
- The ISMIR 2014 paper "Detecting Drops in Electronic Dance Music" (TU Delft) uses two stages. It models the sound characteristics of drops, then zeroes in on a "watershed moment" using temporal structure, with SoundCloud timed comments as weak labels. It notes that a unique feature of a drop is that it is preceded by a buildup — [ISMIR 2014 PDF](https://archives.ismir.net/ismir2014/paper/000297.pdf); [summary](https://scrapbox.io/DancePedia/Detecting%20Drops%20in%20Electronic%20Dance%20Music:%20Content%20based%20approaches%20to%20a%20socially%20significant%20music%20event)
- MediaEval 2014 (Aljanaki et al.) combined crowdsourced labels, SoundCloud comments and audio. Combining them gave the best results, though not significantly better — [record](https://utrecht-main-test.atmire.com/items/2cf889a9-7be7-4a8f-9896-f972ad5e4667)
- Raveform labels Buildup, Drop, Breakdown and Cooldown at expert level. All-In-One trained on it reaches HR.5F 0.835 on EDM — [TISMIR](https://transactions.ismir.net/articles/10.5334/tismir.288)
- Music theory: a 2025 "narrative grammar of EDM" paper argues the drop is often the transition from a buildup section to a core section — [SAGE](https://journals.sagepub.com/doi/10.1177/10298649251321709)
- Engineering reference: FastLED 3.9.15 ships buildup and drop detectors that combine indicators such as energy flux and bass surge (source code, not a paper) — [FastLED drop.h](https://fastled.io/docs/db/d79/drop_8h_source.html); [buildup.cpp](https://fastled.io/docs/d0/d86/buildup_8cpp_8hpp_source.html)
- Other newer paper found: "Acoustic Overspecification in EDM Taxonomy" (arXiv 2509.11474) — [arXiv](https://arxiv.org/pdf/2509.11474)

### Inferences
- Heuristic drop score at a candidate downbeat t: (low-band energy after t − low-band energy in the last 2–4 bars before t) × (short-term loudness jump) × (preceding rise in spectral centroid, spectral flatness or noise, and in onset density, e.g. snare rolls). Restrict t to 8- or 16-bar phrase boundaries.
- A build-up is a phrase-aligned interval with a monotonic rise in centroid, onset rate and loudness, often with falling bass energy (high-pass sweep).
- Combine heuristics with section labels: a "chorus" or "drop" right after a high-slope interval is the payoff.

### Gaps
- No modern (2022–2026) dedicated drop-detection benchmark or open model was found apart from Raveform-trained structure models.
- No published riser-detection model was found.

## 4. Energy / intensity / tension curves

### Takeaway
Loudness per EBU R128 (momentary 400 ms, short-term 3 s) is the standard perceptual energy curve. A pure-Rust implementation exists (`ebur128` crate). Add spectral centroid or brightness, spectral flux or onset density, and low-band energy from a simple STFT. Normalize per track, for example using the track's own loudness range or percentiles.

### Cited Findings
- EBU R128 momentary loudness uses a 400 ms sliding window and short-term uses 3 s. Short-term meters must update at ≥10 Hz — [Wikipedia EBU R 128](https://en.wikipedia.org/wiki/EBU_R_128); [docs.rs ebur128](https://docs.rs/ebur128)
- The Rust `ebur128` crate (v0.1.10) ports libebur128 with the same results and comparable performance. It passes EBU Tech 3341/3342 tests and provides momentary, short-term, integrated and loudness range (LRA) — [docs.rs ebur128](https://docs.rs/crate/ebur128/latest)
- Essentia has LoudnessEBUR128 (Essentia is AGPL, see §8) — [Essentia reference](https://essentia.upf.edu/reference/std_LoudnessEBUR128.html)
- Rust feature crates: `aus` 0.1.7 lists spectral flux, spectral difference and spectral entropy. Later versions list centroid, entropy and slope. `aubio` crate gives safe bindings to aubio (onset detection, spectral descriptors, MFCC), but aubio-rs 0.2.0 is GPL-3.0 and last updated 2021. `spafe` is a Rust port of spectrogram and cepstral extractors — [docs.rs aus](https://docs.rs/crate/aus/0.1.7); [docs.rs aubio](https://docs.rs/aubio); [aubio-rs](https://docs.rs/crate/aubio-rs/latest); [spafe](https://docs.rs/spafe)
- Essentia also offers learned "engagement" and "approachability" regressors (discogs-effnet) and danceability classifiers, under CC BY-NC-SA 4.0 — [Essentia models](https://essentia.upf.edu/models.html)

### Inferences
- A practical "intensity" curve is a weighted, z-scored sum of short-term LUFS, low-band energy, onset density and centroid. Map it per track to [0,1] with 5th/95th percentiles, so quiet masters and loud masters both use the full visual range. Use LRA to decide how much dynamic range to expose.
- Smooth with a beat-synchronous window (e.g., per-beat median), and keep a separate fast transient channel for hits.

### Gaps
- No validated open "tension" or roughness model suitable for production was found. No numeric comparison of loudness against perceived intensity was collected.

## 5. Emotion / mood over time (valence/arousal)

### Takeaway
Essentia's arousal/valence regressors (DEAM, emoMusic and MuSe heads on MusiCNN or VGGish embeddings) are the most accessible models. They are clip-level, so a time curve needs sliding windows, and the weights are non-commercial. Dynamic MER research exists (DEAM 2 Hz annotations), but no strong, packaged 2025–2026 per-second model was found. For animation, loudness and novelty curves are likely more reliable than emotion models.

### Cited Findings
- The Essentia models are deam-msd-musicnn, deam-audioset-vggish, emomusic-msd-musicnn, emomusic-audioset-vggish, muse-msd-musicnn and muse-audioset-vggish. They output arousal and valence on a [1,9] scale — [Essentia models](https://essentia.upf.edu/models.html)
- The MTG model license is CC BY-NC-SA 4.0 per the models page, with a proprietary license on request. The Essentia licensing page instead says CC BY-NC-ND 4.0, so the two pages conflict. MAEST on Hugging Face is CC BY-NC-SA 4.0 — [models page](https://essentia.upf.edu/models.html); [licensing page](https://essentia.upf.edu/licensing_information.html); [MAEST HF](https://huggingface.co/mtg-upf/discogs-maest-30s-pw-73e-ts/blob/main/README.md)
- A hosted demo runs on Replicate (mtg/music-arousal-valence) — [Replicate](https://replicate.com/mtg/music-arousal-valence)
- The DEAM dataset has dynamic valence/arousal for 1,802 songs at 2 Hz. In MediaEval, RNNs with large feature sets worked best for dynamic MER — [PMC5345802](https://pmc.ncbi.nlm.nih.gov/articles/PMC5345802)
- A Dec 2024 arXiv preprint presents personalized dynamic MER with dual-scale attention and meta-learning — [arXiv 2412.19200](https://arxiv.org/pdf/2412.19200)
- Cyanite markets a "second-by-second emotion profile" and tags for every 15-second segment (see §9) — [Cyanite API docs](https://api-docs.cyanite.ai/); [Cyanite blog](https://cyanite.ai/blog/music-analysis-api/)

### Inferences
- Run Essentia arousal and valence on windows of a few seconds with a beat-aligned hop, to get a coarse mood curve for palette or saturation choice. Arousal largely duplicates loudness and density.
- The NC license blocks commercial distribution without an MTG license.

### Gaps
- No ONNX exports or Rust usage of the Essentia AV heads were verified. No accuracy numbers (R², CCC) for the shipped heads were collected.
- No 2025–2026 packaged per-second emotion model was found.

## 6. Source separation for per-stem reactivity

### Takeaway
HTDemucs (Demucs v4, MIT) remains the deployable default. It has clean ONNX exports with STFT inside the graph (Mixxx GSoC 2025; a 316 MB single file) and a native Rust/Burn port (demucs-rs, Apache-2.0, Vulkan on Windows). On CPU, a 4-min song takes ~1.5–8 min depending on hardware, versus seconds on a GPU. RoFormer models (BS- and Mel-RoFormer) have higher SDR, but their weight licensing is murky. Spleeter is outdated.

### Cited Findings
- Demucs code is MIT. The original repo is "not maintained anymore", and the fork adefossez/demucs gets only important bug fixes. HT Demucs scores 9.0 dB SDR on MUSDB HQ (9.20 with an unreleased sparse model) — [Demucs README](https://raw.githubusercontent.com/facebookresearch/demucs/main/README.md)
- README CPU guidance is processing time ≈ 1.5× track duration. GPU needs ≥3 GB VRAM. The default arguments use ~7 GB RAM. The maximum segment for HT models is 7.8 s — [Demucs README](https://raw.githubusercontent.com/facebookresearch/demucs/main/README.md)
- Mixxx GSoC 2025 produced a self-contained HTDemucs ONNX with STFT and ISTFT rewritten as real-valued ops inside the graph (MSE < 1e-4). On CPU, PyTorch ran at 25.89 s per minute of audio and C++ ONNX at 21.24 s per minute (17.9% faster). On GPU, PyTorch ran at 1.70 s/min and ONNX Runtime at 1.86 s/min. SI-SDR is 7.44 for PyTorch and 7.43 for ONNX — [Mixxx news](https://mixxx.org/news/2025-10-27-gsoc2025-demucs-to-onnx-dhunstack/)
- adowu/htdemucs-onnx: fp32 is 316 MB and the fp16-weights version 166 MB. On an M4 Pro CPU, RTF is 0.20 per 7.8 s segment with ~1.1 GB RAM. The FT bag is 1.26 GB with RTF 0.49. It works with the DirectML, CUDA and CoreML providers, and the license is MIT — [HF adowu](https://huggingface.co/adowu/htdemucs-onnx)
- HRSadeghi/demucs-onnx keeps STFT, ISTFT and overlap-add in host code. Per a search summary, its README claims the v3/v4 checkpoints are CC BY-NC 4.0. This conflicts with the Demucs README, which states only MIT and gives no separate weight license — [HF HRSadeghi](https://huggingface.co/HRSadeghi/demucs-onnx); [Demucs README](https://raw.githubusercontent.com/facebookresearch/demucs/main/README.md)
- demucs-rs (Apache-2.0) is a native Rust HTDemucs on Burn/wgpu: Vulkan on Windows and Linux, Metal on macOS, WebGPU in the browser. Models are htdemucs (84 MB, 4 stems), htdemucs_6s (84 MB, adds guitar and piano) and htdemucs_ft (333 MB). No CPU backend or benchmarks are listed — [GitHub demucs-rs](https://github.com/nikhilunni/demucs-rs)
- Vendor (StemSplit) CPU timings for a 4-min song conflict: ~90 s with htdemucs on a Ryzen 9 5950X in one guide, ~8 min on an Intel i7 in another — [StemSplit guide](https://stemsplit.io/blog/demucs-local-setup-guide.md); [StemSplit (pt-BR)](https://stemsplit.io/pt-BR/blog/demucs-local-setup-guide)
- BS-RoFormer (Lu et al. 2023) reaches 9.80 dB average SDR on MUSDB18HQ without extra data (smaller version) — [ar5iv 2309.02612](https://ar5iv.labs.arxiv.org/html/2309.02612)
- Mel-RoFormer improves vocals over BS-RoFormer by ~0.43–0.58 dB and is better on drums and other, but weaker on bass — [arXiv 2310.01809](https://arxiv.org/pdf/2310.01809)
- RoFormer weights: community checkpoints (ZFTurbo / MVSep, anvuew) report up to 12.45 SDR. One ONNX export says the architecture comes from lucidrains/BS-RoFormer (MIT) and treats the weights as MIT, but notes they were trained on research-only MUSDB18-HQ — [HF silverdaw](https://huggingface.co/silverdaw/bs-roformer-rhythm-onnx); [ZFTurbo summary](https://context7.com/zfturbo/music-source-separation-training)

### Inferences
- For per-stem reactivity (kick/snare from the drums stem, bass presence, vocals present or absent), HTDemucs 4-stem through `ort` + DirectML on Windows is the most pragmatic choice. Cache the stems or the derived envelopes per file, since separation dominates analysis time.
- Cheaper alternative: skip separation and use band-limited onset detection (sub-bass for kick, 2–5 kHz plus noise for snare, >8 kHz for hats). This loses accuracy on dense mixes but runs in milliseconds.

### Gaps
- No independent, same-hardware CPU benchmark of HTDemucs against RoFormer models was found. The definitive weight license for the Demucs v4 checkpoints is unclear (MIT in the README against a CC BY-NC claim in a third-party export). Spleeter's current status was not checked.

## 7. Instrument/vocal activity, key/chord/harmonic change, transient vs sustained

### Takeaway
Little targeted 2024–2026 evidence was gathered here. Vocal activity is easiest to get from the separated vocals stem (energy gate). Harmonic novelty can come from chroma self-similarity, and transient vs sustained character from onset strength against spectral flatness and sustained energy. All-In-One and SongFormer already use rich learned features (allin1 can export 100 FPS embeddings) that could feed novelty curves.

### Cited Findings
- allin1 exposes frame-level activations and embeddings at 100 FPS (`--activ`, `--embed`) — [GitHub](https://github.com/mir-aidj/all-in-one)
- htdemucs_6s adds guitar and piano stems for instrument-presence envelopes — [demucs-rs](https://github.com/nikhilunni/demucs-rs)
- An open-source chord and beat tool (ChordMini) exists, and uses the music.ai API for lyric transcription — [DEV post](https://dev.to/ngha_phantrng_ccdda2bf/open-source-chord-beat-detection-application-39f5)

### Inferences
- Vocals present = short-term RMS of the vocals stem above a per-track adaptive threshold. The same works for bass and drums.
- Harmonic change: chroma (or CQT) self-similarity with a Foote checkerboard kernel gives a harmonic novelty curve, which can trigger hue shifts on chord or key changes.

### Gaps
- No current SOTA numbers for chord recognition, key detection or instrument activity detection were collected (out of tool-call budget). The report writer should treat this section as thin.

## 8. Deployment: browser/WASM, Python-only, ONNX/Rust, pure Rust; speed, sizes, licenses

### Takeaway
A fully Rust/ONNX pipeline is now feasible with permissive licenses: Beat This (pure-Rust crate, MIT), LinkSeg (ONNX 1.5 MB, CC-BY 4.0), HTDemucs (ONNX or Burn; code MIT/Apache, weight license ambiguous) and `ebur128` (MIT-style port). Essentia and essentia.js are AGPL-3.0 with NC models. allin1 and SongFormer are Python+PyTorch stacks (NATTEN pain on Windows, Linux-tested). They are best used as an optional sidecar or for offline pre-analysis, not bundled.

### Cited Findings
| Tool | Runtime | License | Size | Speed (≈4-min song) |
|---|---|---|---|---|
| Beat This (Rust `beat-this` 1.0.0) | pure Rust (rten) or ort | MIT | 10 MB small / 83 MB full | ~4.6 s on an M4 CPU for 4:32 — [docs.rs](https://docs.rs/crate/beat-this/1.0.0) |
| Beat This (Python) | PyTorch | MIT | 8.1 MB / 78 MB | 5.1 s on an M4 CPU — [docs.rs](https://docs.rs/crate/beat-this/1.0.0); [GitHub](https://github.com/CPJKU/beat_this) |
| LinkSeg ONNX | onnxruntime-web (WebGPU/WASM), ort usable | CC-BY 4.0 weights, MIT glue | 1.5 MB | 3–5 s per song on an L40 GPU (original) — [HF](https://huggingface.co/elicwhite/linkseg-7c-onnx); [SongFormer README](https://github.com/ASLP-lab/SongFormer) |
| All-In-One | Python, PyTorch, NATTEN, madmom, Demucs | MIT code; madmom models NC | n/a | 73 s for 33 min of audio on an RTX 4090; 9–12 s per song on an L40 — [GitHub](https://github.com/mir-aidj/all-in-one); [SongFormer README](https://github.com/ASLP-lab/SongFormer) |
| SongFormer | Python 3.10, PyTorch, MuQ, MusicFM | CC-BY-4.0 code | n/a | 2–4 s per song on an L40 — [GitHub](https://github.com/ASLP-lab/SongFormer) |
| HTDemucs ONNX | ort (CPU/DirectML/CUDA) | MIT (per export) | 316 / 166 MB | 21 s per minute of audio on CPU, C++ ONNX — [Mixxx](https://mixxx.org/news/2025-10-27-gsoc2025-demucs-to-onnx-dhunstack/); [HF](https://huggingface.co/adowu/htdemucs-onnx) |
| demucs-rs | Rust, Burn, Vulkan | Apache-2.0 | 84 MB | not published — [GitHub](https://github.com/nikhilunni/demucs-rs) |
| Essentia / essentia.js | C++, Python, WASM, TF.js | AGPL-3.0 (commercial license from MTG); models CC BY-NC-SA/ND | n/a | n/a — [essentia.js](https://github.com/MTG/essentia.js); [licensing](https://essentia.upf.edu/licensing_information.html) |
| ebur128 crate | pure Rust | port of libebur128 (license not verified in this pass) | — | real-time capable — [docs.rs](https://docs.rs/crate/ebur128/latest) |
| aubio-rs | Rust bindings to C | GPL-3.0 | — | — [docs.rs](https://docs.rs/crate/aubio-rs/latest) |

- Essentia is "available under an open licence, Affero GPLv3, for non-commercial applications". Commercial use requires a license from MTG-UPF — [Essentia licensing](https://essentia.upf.edu/licensing_information.html)
- essentia.js is AGPL-3.0, offers feature extractors plus TensorFlow.js models, and notes that some algorithms are "not yet manually tested on the JavaScript front" — [GitHub essentia.js](https://github.com/MTG/essentia.js)

### Inferences
- Recommended in-app stack (all Rust, no Python): decode audio with symphonia → beat-this (beats, downbeats, BPM) → LinkSeg via ort (sections) → ebur128 plus custom STFT features (intensity, centroid, flux, band energies) → optional HTDemucs via ort/DirectML (stems) → heuristic build/drop detector → JSON timeline cached next to the file.
- Excluding stems, expect well under ~10–15 s of analysis per 4-min song on a modern CPU. With CPU HTDemucs, expect ~1.5 min (21 s per audio minute, per Mixxx), and much less on GPU through DirectML.
- Avoid Essentia, essentia.js, aubio and madmom models in a distributed app unless AGPL/GPL/NC terms are acceptable or a commercial license is obtained.

### Gaps
- Windows-specific timings for any of these were not found. Meyda (JS feature extraction) was not researched in this pass. No ONNX export of SongFormer, allin1 or the Essentia AV heads was verified.

## 9. Hosted APIs returning structure/energy analysis

### Takeaway
Spotify's Audio Analysis (and Audio Features) endpoints have been closed to new apps since November 27, 2024. Cyanite is the main remaining commercial API with time-segmented mood and energy (15-s segments, "second-by-second" emotion), priced by subscription plus usage. No other vendor clearly documents a structure/energy timeline for uploaded files.

### Cited Findings
- Spotify's Nov 27, 2024 blog lists Audio Analysis, Audio Features, Recommendations and Related Artists as unavailable to new Web API use cases. Apps with existing extended-mode access are unaffected — [Spotify developer blog](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api); [TechCrunch](https://techcrunch.com/2024/11/27/spotify-cuts-developer-access-to-several-of-its-recommendation-features/)
- A Spotify staff reply on the forum says the endpoint is deprecated and there is no way for new apps to access it — [Spotify community](https://community.spotify.com/t5/Spotify-for-Developers/Web-API-Get-Track-s-Audio-Features-403-error/m-p/6916386/highlight/true)
- The Spotify audio analysis broke tracks into structure and rhythm, including BPM — [Digital Music News](https://www.digitalmusicnews.com/?p=308667)
- Cyanite returns tags for the full track and for every 15-second segment (energy, mood, instrumentation), plus a "second-by-second emotion profile". The API is GraphQL — [Cyanite blog (updated May 6, 2026)](https://cyanite.ai/blog/music-analysis-api/); [Cyanite API docs](https://api-docs.cyanite.ai/)
- Cyanite pricing is a monthly access fee plus a usage fee, via a calculator. One displayed configuration showed €290/month. Tiers are Web App, Web App + API and CSV Export, with one-time onboarding fees. "Segmentation" is listed as a feature — [Cyanite pricing](https://pricing.cyanite.app/)
- A third-party guide says 5 free analyses per month (unverified) — [aimusicpreneur](https://www.aimusicpreneur.com/ai-tools/cyanite/)
- The Music.AI docs describe modules (stem isolation, transcription, enhancement) chained into workflows over one API. No beat, chord or section module was confirmed in the docs fetched — [Music.ai docs](https://music.ai/docs/); [Music.ai FAQ](https://music.ai/docs/faq/)
- ACRCloud's API is fingerprint and recognition oriented. Soundcharts' Audio Features API serves catalog BPM, key and energy lookups, not analysis of uploaded audio — [ACRCloud npm](https://www.npmjs.com/package/acrcloud); [Soundcharts](https://soundcharts.com/audio-features-api)
- Echo Nest Remix (2009, the predecessor of Spotify analysis) organized beats, bars, tatums, sections and segments, the hierarchy the app wants — [musicmachinery](https://musicmachinery.com/2009/03/19/overview-of-the-echo-nest-remix-api/)

### Inferences
- A desktop app analyzing local files should not depend on hosted APIs. Spotify is closed, and Cyanite's 15-s granularity is too coarse for beat-level animation and costs a subscription.
- Local models now match or exceed what Spotify's analysis offered (beats, bars, sections, loudness).

### Gaps
- AudioShake, Musiio (acquired by SoundCloud) and Tunebat were not covered; no structure or energy endpoints were found for them. Music.ai pricing and any section or beat modules were not confirmed (the modules page returned 404).
