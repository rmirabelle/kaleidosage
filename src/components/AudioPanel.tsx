import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { Broadcast, Equalizer, MusicNote, MusicNotes, Plug, Plus, SpeakerHigh, SpeakerSimpleHigh, Trash, X } from "@phosphor-icons/react";
import type { Engine } from "../engine/engine";
import { formatValue } from "../engine/params";
import { AUDIO_BANDS, AUDIO_RELEASE, AUDIO_SOURCES, BAND_RANGES, FLOOR_DB, LINK_THRESHOLD, RELEASE_FACTOR, audioLinkList, pushRange, pushedValue, type AudioLink, type AudioBand } from "../engine/audio";
import { GAIN_DB, THRESHOLD_DB, audioInput, type DeviceKind, type InputKind } from "../lib/audioInput";
import { tracks } from "../lib/tracks";
import { destinationName } from "./DestinationDialog";
import { Dropdown } from "./Dropdown";
import { Slider, trackPosition } from "./Slider";
import { ConfirmDialog } from "./ConfirmDialog";
import { EmptyState } from "./EmptyState";
import { settingButtons } from "../lib/settingButtons";
import { createPortal } from "react-dom";
import { help } from "../help/topics";
import { HelpButton } from "./HelpButton";

const BAND_LABELS: Record<AudioBand, string> = { level: "Level", bass: "Bass", mids: "Mids", highs: "Highs" };
/** How long the beat light stays on after a beat, in milliseconds. */
const BEAT_LIGHT_MS = 120;

/** Where a loudness sits on a meter, from 0 (FLOOR_DB) to 1 (0 dBFS). */
const meterPosition = (decibels: number) => Math.min(1, Math.max(0, (decibels - FLOOR_DB) / -FLOOR_DB));

const hz = (value: number) => (value >= 1000 ? `${value / 1000} kHz` : `${value} Hz`);

const subscribe = (listener: () => void) => audioInput.subscribe(listener);
const version = () => audioInput.version;

/**
 * The band meters and the beat light. They follow the analyzer in each
 * animation frame through refs, not React state, as the control panel's
 * live readouts do.
 */
function AudioMeters({ thresholdDb }: { thresholdDb: number }) {
  const bars = useRef<Partial<Record<AudioBand, HTMLElement | null>>>({});
  const readouts = useRef<Partial<Record<AudioBand, HTMLElement | null>>>({});
  const beatLight = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let frame = 0;
    let beats = -1;
    let litUntil = 0;
    const draw = (now: number) => {
      const analyzer = audioInput.analyzer;
      for (const band of AUDIO_BANDS) {
        const loudness = analyzer?.decibels[band] ?? FLOOR_DB;
        const bar = bars.current[band];
        if (bar) {
          bar.style.width = `${meterPosition(loudness) * 100}%`;
          bar.classList.toggle("under", loudness < (analyzer?.thresholdDb ?? 0));
        }
        const readout = readouts.current[band];
        const text = loudness <= FLOOR_DB ? `≤ ${FLOOR_DB} dB` : `${loudness.toFixed(0)} dB`;
        if (readout && readout.textContent !== text) readout.textContent = text;
      }
      if (analyzer && analyzer.beats !== beats) {
        if (beats >= 0) litUntil = now + BEAT_LIGHT_MS;
        beats = analyzer.beats;
      }
      beatLight.current?.classList.toggle("lit", now < litUntil);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <ul className="audio-meters">
      {AUDIO_BANDS.map((band) => (
        <li key={band} className="audio-meter">
          <span className="audio-meter-name" data-tip={`${hz(BAND_RANGES[band][0])} to ${hz(BAND_RANGES[band][1])}`}>{BAND_LABELS[band]}</span>
          <span className="audio-meter-well">
            <i ref={(element) => { bars.current[band] = element; }} />
            <b className="audio-meter-threshold" style={{ left: `${meterPosition(thresholdDb) * 100}%` }} data-tip={`Threshold: ${thresholdDb} dB`} />
          </span>
          <span className="audio-meter-db" ref={(element) => { readouts.current[band] = element; }} />
        </li>
      ))}
      <li className="audio-meter">
        <span className="audio-meter-name">Beat</span>
        <span ref={beatLight} className="audio-beat-light" data-tip="Flashes on each beat" />
      </li>
    </ul>
  );
}

/**
 * The scene's audio links, one row each: the setting, what it follows, its
 * range (how far the sound moves it), its release factor, its threshold
 * offset, and an X that removes the link. New links start at a setting's
 * own audio button.
 */
/** The Release slider works in steps of 1 from 0 to RELEASE_STEPS, in equal ratios from AUDIO_RELEASE.min to AUDIO_RELEASE.max. */
const RELEASE_STEPS = 100;
const releaseSeconds = (step: number) => AUDIO_RELEASE.min * (AUDIO_RELEASE.max / AUDIO_RELEASE.min) ** (step / RELEASE_STEPS);
const releaseStep = (seconds: number) => Math.round((Math.log(seconds / AUDIO_RELEASE.min) / Math.log(AUDIO_RELEASE.max / AUDIO_RELEASE.min)) * RELEASE_STEPS);
const seconds = (value: number) => (value < 1 ? `${Math.round(value * 1000)} ms` : `${value.toFixed(2)} s`);
/** A link's factor slider works in quarter steps of log2, from ×0.25 to ×4. */
const factorText = (factor: number) => `×${factor >= 1 ? factor.toFixed(factor % 1 ? 2 : 0) : factor.toFixed(2)}`;

/**
 * The scene's Release: how long a linked setting takes to fall back after
 * a hit or a loud part, the scene's general feel. Each link's factor makes
 * that link faster or slower than it. The slider moves in equal ratios,
 * so short times have as much room as long ones.
 */
function ReleaseSetting({ engine }: { engine: Engine }) {
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  const value = engine.state.audioRelease;
  return (
    <div className="audio-setting audio-release" data-tip="How long a setting takes to fall back after a hit or a loud part. Each link's factor makes it faster or slower than this.">
      <span>Release (this scene) <output>{seconds(value)}</output></span>
      <Slider
        min={0}
        max={RELEASE_STEPS}
        step={1}
        value={releaseStep(value)}
        detent={releaseStep(AUDIO_RELEASE.default)}
        label="Release"
        onChange={(step) => {
          engine.state.audioRelease = releaseSeconds(step);
          redraw();
        }}
      />
    </div>
  );
}

/**
 * A link control's output: the worked-out value (what the slider makes),
 * and for Range the slider's own value after it, smaller. With "same" (the
 * link uses the global value as it is), it keeps its place but shows
 * nothing, so only the links that differ stand out.
 */
function Worked({ value, own, same = false }: { value: string; own?: string; same?: boolean }) {
  return <output className={`audio-link-worked ${same ? "same" : ""}`} aria-hidden={same || undefined}><b>{value}</b>{own && <small>{own}</small>}</output>;
}

/**
 * The scene's audio links, one row each: the setting, what it follows, its
 * threshold offset, its range (how far the sound moves it) and its release
 * factor, and an X that removes the link. Each slider shows what it works
 * out to for this setting: the threshold in dBFS, the farthest value the
 * sound reaches, and the release in seconds. New links start at a
 * setting's own audio button.
 */
function AudioLinks({ engine }: { engine: Engine }) {
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  /* "Show audio buttons" hides itself once the FX panel's audio buttons are on. */
  useSyncExternalStore(settingButtons.subscribe, () => settingButtons.shown("audio"));
  useEffect(() => engine.onParamChange(redraw), [engine]);
  const links = audioLinkList(engine.state.audioLinks);
  /**
   * Live lines on the link sliders, moved in each animation frame (not
   * through React state): on the Threshold slider, the band's peak on the
   * slider's own scale (dB from the Threshold), gray below the link's
   * threshold and blue above it, so the threshold can be set just under
   * the hits; on the Range slider, how far the sound pushes the setting now.
   */
  const thresholdLines = useRef(new Map<string, HTMLDivElement>());
  const rangeLines = useRef(new Map<string, HTMLDivElement>());
  const linksRef = useRef(links);
  linksRef.current = links;
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const analyzer = audioInput.analyzer;
      const masterDb = audioInput.settings.thresholdDb;
      for (const [key, source, amount, , threshold] of linksRef.current) {
        const peak = analyzer?.decibels[source === "kick" ? "bass" : source] ?? FLOOR_DB;
        const line = thresholdLines.current.get(key);
        if (line) {
          const shown = analyzer !== null && peak > FLOOR_DB;
          line.classList.toggle("idle", !shown);
          if (shown) {
            const offset = Math.min(LINK_THRESHOLD[1], Math.max(LINK_THRESHOLD[0], peak - masterDb));
            line.style.left = trackPosition(offset, LINK_THRESHOLD[0], LINK_THRESHOLD[1]);
            line.classList.toggle("under", peak < masterDb + threshold);
          }
        }
        const range = rangeLines.current.get(key);
        if (range) {
          const push = engine.audioPush(key) * amount;
          range.classList.toggle("idle", push < 1e-3);
          if (push >= 1e-3) range.style.left = trackPosition(push, 0, 1);
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [engine]);
  const keep = (lines: typeof thresholdLines, key: string) => (element: HTMLDivElement | null) => {
    if (element) lines.current.set(key, element);
    else lines.current.delete(key);
  };
  if (links.length === 0) {
    return (
      <EmptyState text="Click the speaker beside a setting to make it move with the sound.">
        {/* The speakers show only while the FX panel's audio buttons are on: one click turns them on. */}
        {!settingButtons.shown("audio") && (
          <button className="button secondary small" onClick={() => settingButtons.set("audio", true)}>
            <SpeakerSimpleHigh size={14} /> Show audio buttons
          </button>
        )}
      </EmptyState>
    );
  }
  const masterDb = audioInput.settings.thresholdDb;
  return (
    <ul className="midi-map-list audio-link-list">
      {/* The column headers, in the rows' own grid, so each lines up over its column. */}
      <li className="midi-map-row audio-link-row audio-link-head" aria-hidden="true">
        <span>Setting</span>
        <span>Moves with</span>
        <span data-tip="The loudness above which the setting moves: the Threshold plus this link's offset">Threshold</span>
        <span data-tip="How far the sound can move the setting, and the farthest value it reaches">Range</span>
        <span data-tip="How long the setting takes to fall back: the scene's Release times this link's factor">Release</span>
        <span />
      </li>
      {links.map(([key, source, amount, release, threshold]) => {
        const param = engine.params[key];
        const { rest, end } = pushRange(param);
        const farthest = formatValue(param, pushedValue(param, rest, end, amount));
        const effectiveDb = masterDb + threshold;
        const update = (next: Partial<AudioLink>) => engine.setAudioLink(key, { source, amount, release, threshold, ...next });
        return (
          <li key={key} className="midi-map-row audio-link-row">
            <span className="midi-map-control" data-tip={destinationName(key)}>{destinationName(key)}</span>
            <Dropdown value={source} options={AUDIO_SOURCES} label={`What ${destinationName(key)} follows`} onChange={(next) => update({ source: next })} />
            <span className="audio-link-amount" data-tip={`This setting moves only above ${effectiveDb} dB: the Threshold (${masterDb} dB) ${threshold === 0 ? "as it is" : `${threshold > 0 ? "plus" : "minus"} ${Math.abs(threshold)} dB`}.`}>
              <Slider
                min={LINK_THRESHOLD[0]}
                max={LINK_THRESHOLD[1]}
                step={1}
                value={threshold}
                detent={0}
                label={`${destinationName(key)} threshold offset`}
                markerRef={keep(thresholdLines, key)}
                onChange={(next) => update({ threshold: next })}
              />
              <Worked value={`${effectiveDb} dB`} same={threshold === 0} />
            </span>
            <span className="audio-link-amount" data-tip={`Range: ${Math.round(amount * 100)}% of the way from ${formatValue(param, rest)} to ${formatValue(param, end)}, so the sound moves the setting as far as ${farthest}.`}>
              <Slider min={0} max={1} step={0.01} value={amount} label={`${destinationName(key)} audio range`} markerRef={keep(rangeLines, key)} onChange={(next) => update({ amount: next })} />
              <Worked value={`${Math.round(amount * 100)}%`} />
            </span>
            <span className="audio-link-amount" data-tip={`Release: ${seconds(engine.state.audioRelease * release)}, the scene's Release (${seconds(engine.state.audioRelease)}) ${factorText(release)}. Above ×1 this setting falls back slower, below ×1 faster.`}>
              <Slider
                min={Math.log2(RELEASE_FACTOR[0])}
                max={Math.log2(RELEASE_FACTOR[1])}
                step={0.25}
                value={Math.log2(release)}
                detent={0}
                label={`${destinationName(key)} release factor`}
                onChange={(next) => update({ release: 2 ** next })}
              />
              <Worked value={seconds(engine.state.audioRelease * release)} same={release === 1} />
            </span>
            <button className="midi-map-clear" data-tip="Remove this audio link" aria-label={`Remove the audio link from ${destinationName(key)}`} onClick={() => engine.setAudioLink(key, null)}>
              <X size={12} weight="bold" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** A source in the Sound source menu: the kind, a colon, and the device id (nothing after the colon for the kind's default device). */
const sourceValue = (kind: DeviceKind, device: string | null) => `${kind}:${device ?? ""}`;
const KIND_HEADINGS: Record<DeviceKind, string> = { output: "PC (loopback)", input: "Microphones and line inputs" };
const KIND_DEFAULTS: Record<DeviceKind, string> = { output: "Default output", input: "Default input" };

/** The Input menu's first choice: the app does not listen. */
const NONE = "none:";
/** The Input menu's last choice: the app plays the tracks and listens to them. */
const TRACKS = "tracks:";

const subscribeTracks = (listener: () => void) => tracks.subscribe(listener);
const tracksVersion = () => tracks.version;

/**
 * The tracks, under the Input menu while the tracks are the
 * input: Add files and Clear, then one row per track. A click on a track
 * plays it; the track that plays shows a speaker; X removes a track.
 */
function TrackRows({ onAddTracks }: { onAddTracks: () => void }) {
  useSyncExternalStore(subscribeTracks, tracksVersion);
  const [clearAsked, setClearAsked] = useState(false);
  const count = tracks.list.length;
  return (
    <>
      {/* The column's heading, with its buttons at the right: Add File(s) and a trash can that asks before it clears the list. */}
      <div className="stage-label audio-files-head">
        <MusicNotes size={13} weight="bold" /> Files <HelpButton topic="audio.files" inline />
        <span className="audio-files-head-buttons">
          <button className="button secondary small" onClick={onAddTracks} data-tip="Add audio files at the end of the list">
            <Plus size={13} weight="bold" /> Add File(s)
          </button>
          <button className="button secondary small icon-only" disabled={count === 0} onClick={() => setClearAsked(true)} data-tip="Remove every file from the list" aria-label="Remove every file from the list">
            <Trash size={14} />
          </button>
        </span>
      </div>
      {clearAsked && createPortal(
        <ConfirmDialog
          title="Remove every file?"
          message={`All ${count === 1 ? "1 file goes" : `${count} files go`} out of the list. The files on disk stay as they are.`}
          confirmLabel="Remove all"
          onCancel={() => setClearAsked(false)}
          onConfirm={() => {
            tracks.clear();
            setClearAsked(false);
          }}
        />,
        document.body
      )}
      {/* The column's body: the list of files on the FX panel's dark blue, and it scrolls. */}
      <div className="audio-files-body">
        {tracks.error && <p className="audio-error selectable">{tracks.error}</p>}
        {tracks.list.length === 0 ? (
          <EmptyState text="Add audio files to play them, one after the other.">
            <button className="button secondary small" onClick={onAddTracks}>
              <Plus size={13} weight="bold" /> Add File(s)
            </button>
          </EmptyState>
        ) : (
          <ol className="tracks-tracks">
            {tracks.list.map((track, index) => {
              const current = index === tracks.index;
              return (
                <li key={track.path} className={`tracks-track ${current ? "current" : ""}`} data-tip={track.path}>
                  <button className="tracks-track-name" onClick={() => tracks.playTrack(index)} data-tip={`Play ${track.name}`}>
                    {current && tracks.playing ? <SpeakerHigh size={12} weight="fill" /> : <MusicNote size={12} />}
                    <span>{track.name}</span>
                  </button>
                  <button className="midi-map-clear" onClick={() => tracks.remove(index)} data-tip="Remove this file" aria-label={`Remove ${track.name}`}>
                    <X size={11} weight="bold" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </>
  );
}

/**
 * The Audio tab of the bottom panel, in columns: Source (the input and its
 * settings, then the level meters), the track list while the tracks are
 * the input, then the scene's audio links. The app always listens to the picked
 * input (see audioInput), so the tab has no on and off switch. The left
 * column has the Input menu (Nothing, then the PC sound of each output
 * device, in loopback, then each microphone or line input, then the
 * tracks), an error when listening fails, the track list while
 * the tracks are the input, the gain, the threshold and the beat
 * sensitivity. The meters show each band's loudness in dBFS, with a mark at
 * the threshold. The right
 * column has live meters for the four bands and a light that flashes on
 * each beat, then the scene's audio links. The input belongs to the app,
 * and the links to the scene (see docs/AUDIO.md).
 */
export function AudioPanel({ engine, onAddTracks, sceneName }: { engine: Engine; onAddTracks: () => void; sceneName: string }) {
  useSyncExternalStore(subscribe, version);
  useSyncExternalStore(subscribeTracks, tracksVersion);
  const { status, settings, devices } = audioInput;
  const listening = status.state === "on";
  useEffect(() => { void audioInput.refreshDevices(); }, []);
  const options: [string, string][] = [[NONE, "Nothing (do not listen)"]];
  const headings = new Map<string, string>();
  for (const kind of ["output", "input"] as const) {
    const ofKind = devices.filter((device) => device.kind === kind);
    const defaultName = ofKind.find((device) => device.default)?.name;
    headings.set(sourceValue(kind, null), KIND_HEADINGS[kind]);
    options.push([sourceValue(kind, null), defaultName ? `${KIND_DEFAULTS[kind]} (${defaultName})` : KIND_DEFAULTS[kind]]);
    for (const device of ofKind) options.push([sourceValue(kind, device.id), device.name]);
  }
  headings.set(TRACKS, "Audio files");
  const count = tracks.list.length;
  options.push([TRACKS, count === 0 ? "Files" : `Files (${count === 1 ? "1 file" : `${count} files`})`]);
  const picked = settings.kind === "none" ? NONE : settings.kind === "tracks" ? TRACKS : sourceValue(settings.kind, settings.device);
  if (!options.some(([value]) => value === picked)) options.push([picked, "A device that is not connected"]);
  return (
    <section className="bottom-panel-page" aria-label="Audio">
      <div className="midi-panel-columns">
        <div className="midi-panel-devices audio-source" {...help("audio.input")}>
          <div className="stage-label"><Plug size={13} weight="bold" /> Source <HelpButton topic="audio.input" inline /></div>
          <label className="audio-setting inline">
            <span>Input</span>
            <Dropdown
              value={picked}
              options={options}
              headings={headings}
              noWrap
              label="Input"
              onChange={(value) => {
                const split = value.indexOf(":");
                audioInput.setSource(value.slice(0, split) as InputKind, value.slice(split + 1) || null);
                /* An empty track list asks for its files at once. */
                if (value === TRACKS && tracks.list.length === 0) onAddTracks();
              }}
            />
          </label>
          {/* A failure, for example a microphone that Windows blocks. */}
          {status.state === "error" && <p className="audio-error audio-setting selectable">{status.message}</p>}
          <div className="audio-setting" data-tip="Added to the loudness of the input, before the threshold">
            <span>Global Gain <output>{settings.gainDb > 0 ? "+" : ""}{settings.gainDb} dB</output></span>
            <Slider min={GAIN_DB[0]} max={GAIN_DB[1]} step={1} value={settings.gainDb} detent={0} label="Global Gain" onChange={(value) => audioInput.setGain(value)} />
          </div>
          <div className="audio-setting" data-tip="Sound quieter than this moves nothing and gives no beats. A whisper at -26 dB needs a threshold below -26 dB.">
            <span>Global Threshold <output>{settings.thresholdDb} dB</output></span>
            <Slider min={THRESHOLD_DB[0]} max={THRESHOLD_DB[1]} step={1} value={settings.thresholdDb} label="Global Threshold" onChange={(value) => audioInput.setThreshold(value)} />
          </div>
          {/* The levels, at the bottom of the Source column, under the settings that shape them. */}
          <div className="stage-label audio-source-levels" {...help("audio.levels")}><Equalizer size={13} weight="bold" /> Levels <HelpButton topic="audio.levels" inline /></div>
          {listening ? <AudioMeters thresholdDb={settings.thresholdDb} />
            : settings.kind === "none" ? <EmptyState text="Pick an Input to make settings move with the sound." />
            : <p className="midi-panel-empty">Starting…</p>}
        </div>
        {/* While the tracks are the input, their list has a column of its own, after the Source column. */}
        {settings.kind === "tracks" && (
          <div className="midi-panel-devices audio-tracks-column" {...help("audio.files")}>
            <TrackRows onAddTracks={onAddTracks} />
          </div>
        )}
        {/* With no input, nothing can move the links, so the column is not shown. */}
        {settings.kind !== "none" && (
          <div className="midi-panel-mappings audio-sensors-column" {...help("audio.sensors")}>
            {/* The scene's audio links ("audio sensors"), under the name of the scene they belong to. */}
            <div className="stage-label audio-levels-label audio-sensors-label" data-tip={sceneName}><Broadcast size={13} weight="bold" /> Audio sensors: <span className="audio-sensors-scene">{sceneName}</span> <HelpButton topic="audio.sensors" inline /></div>
            <ReleaseSetting engine={engine} />
            <AudioLinks engine={engine} />
          </div>
        )}
      </div>
    </section>
  );
}
