import { useEffect, useReducer, useRef, useSyncExternalStore } from "react";
import { Broadcast, Equalizer, Plug, SpeakerSimpleHigh, X } from "@phosphor-icons/react";
import type { Engine } from "../engine/engine";
import { AUDIO_BANDS, BAND_RANGES, FLOOR_DB, audioLinkable, soundList, type AudioBand } from "../engine/audio";
import { PARAM_KEYS } from "../engine/params";
import { FAMILY_LABELS, FAMILY_NAMES, familyOf } from "../engine/songScript";
import { GAIN_DB, THRESHOLD_DB, audioInput } from "../lib/audioInput";
import { songFollow } from "../lib/songFollow";
import { destinationName } from "./DestinationDialog";
import { Slider } from "./Slider";
import { EmptyState } from "./EmptyState";
import { settingButtons } from "../lib/settingButtons";
import { help } from "../help/topics";

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
 * The scene's settings whose audio switch is on, one row each: the setting,
 * what moves it (its family, see familyOf), a bar of how far the sound
 * moves it now, and an X that turns its switch off. A setting's own speaker
 * turns its switch on or off too. Enable All turns on the switch of every
 * setting that has a range; Disable All turns every switch off.
 */
function SoundSettings({ engine }: { engine: Engine }) {
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  /* "Show audio buttons" hides itself once the FX panel's audio buttons are on. */
  useSyncExternalStore(settingButtons.subscribe, () => settingButtons.shown("audio"));
  useEffect(() => engine.onParamChange(redraw), [engine]);
  const keys = soundList(engine.state.sound);
  /* The bars follow the sound in each animation frame, not through React state. */
  const bars = useRef(new Map<string, HTMLElement>());
  const keysRef = useRef(keys);
  keysRef.current = keys;
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      for (const key of keysRef.current) {
        const bar = bars.current.get(key);
        if (bar) bar.style.width = `${Math.round(engine.audioPush(key) * 100)}%`;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [engine]);
  const canTurnOn = PARAM_KEYS.some((key) => engine.params[key].on && audioLinkable(key, engine.params[key]) && !engine.state.sound[key]);
  return (
    <>
      <div className="panel-buttons sound-all">
        <button className="panel-button text-only" disabled={!canTurnOn} onClick={() => engine.setSoundAll(true)} data-tip="Turn on the audio switch of every setting that has a range">Enable All</button>
        <button className="panel-button text-only" disabled={keys.length === 0} onClick={() => engine.setSoundAll(false)} data-tip="Turn off every audio switch of this scene">Disable All</button>
      </div>
      {keys.length === 0 ? (
        <EmptyState text="Click the speaker beside a setting to make it move with the sound, or use Enable All.">
          {/* The speakers show only while the FX panel's audio buttons are on: one click turns them on. */}
          {!settingButtons.shown("audio") && (
            <button className="button secondary small" onClick={() => settingButtons.set("audio", true)}>
              <SpeakerSimpleHigh size={14} /> Show audio buttons
            </button>
          )}
        </EmptyState>
      ) : (
        <ul className="midi-map-list sound-list">
          {keys.map((key) => {
            const family = familyOf(key);
            return (
              <li key={key} className="midi-map-row sound-row">
                <span className="midi-map-control" data-tip={destinationName(key)}>{destinationName(key)}</span>
                <span className="sound-family" data-tip={`Moves with ${FAMILY_NAMES[family]}`}>{FAMILY_LABELS[family]}</span>
                <span className="audio-meter-well sound-push" data-tip="How far the sound moves the setting now">
                  <i ref={(element) => { if (element) bars.current.set(key, element); else bars.current.delete(key); }} />
                </span>
                <button className="midi-map-clear" data-tip="Turn off this setting's audio switch" aria-label={`Turn off the audio switch of ${destinationName(key)}`} onClick={() => engine.setSound(key, false)}>
                  <X size={12} weight="bold" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/**
 * The Audio tab of the bottom panel, in columns: Source (the input's
 * settings, then the level meters), then the scene's audio links. The
 * Input menu is in the scene's play toolbar (see AudioInputMenu), and while
 * the tracks are the input, their list is in the left side (FilesCard).
 * The app always listens to the picked input (see audioInput), so the tab
 * has no on and off switch. The left column has an error when listening
 * fails, the gain and the threshold. The meters show each band's loudness
 * in dBFS, with a mark at the threshold. The right column has live meters
 * for the four bands and a light that flashes on each beat, then the
 * scene's audio links. The input belongs to the app, and the links to the
 * scene (see docs/AUDIO.md).
 */
export function AudioPanel({ engine, sceneName }: {
  engine: Engine;
  sceneName: string;
}) {
  useSyncExternalStore(subscribe, version);
  const { status, settings } = audioInput;
  /* While the picture follows a song, Gain and Threshold do not change the motion (see songFollow.ts): they are grayed out. */
  const following = useSyncExternalStore(songFollow.subscribe.bind(songFollow), () => songFollow.enabled) && settings.kind === "tracks";
  const listening = status.state === "on";
  return (
    <section className="bottom-panel-page" aria-label="Audio">
      <div className="midi-panel-columns">
        <div className="midi-panel-devices audio-source" {...help("audio.input")}>
          <div className="stage-label"><Plug size={13} weight="bold" /> Source</div>
          {/* A failure, for example a microphone that Windows blocks. */}
          {status.state === "error" && <p className="audio-error audio-setting selectable">{status.message}</p>}
          <div className={`audio-setting ${following ? "follow-off" : ""}`} aria-disabled={following || undefined} data-tip={following ? "Song follow is on: the song's own analysis moves the picture, so this does not change the motion." : "Gain applied to the audio signal before threshold detection."}>
            <span>Master Gain <output>{settings.gainDb > 0 ? "+" : ""}{settings.gainDb} dB</output></span>
            <Slider min={GAIN_DB[0]} max={GAIN_DB[1]} step={1} value={settings.gainDb} detent={0} label="Master Gain" onChange={(value) => audioInput.setGain(value)} />
          </div>
          <div className={`audio-setting ${following ? "follow-off" : ""}`} aria-disabled={following || undefined} data-tip={following ? "Song follow is on: the song's own analysis moves the picture, so this does not change the motion." : "The minimum loudness of the audio needed to trigger detection."}>
            <span>Master Threshold <output>{settings.thresholdDb} dB</output></span>
            <Slider min={THRESHOLD_DB[0]} max={THRESHOLD_DB[1]} step={1} value={settings.thresholdDb} label="Master Threshold" onChange={(value) => audioInput.setThreshold(value)} />
          </div>
          {/* The levels, at the bottom of the Source column, under the settings that shape them. */}
          <div className="stage-label audio-source-levels" {...help("audio.levels")}><Equalizer size={13} weight="bold" /> Levels</div>
          {listening ? <AudioMeters thresholdDb={settings.thresholdDb} />
            : settings.kind === "none" ? <EmptyState text="Pick an Input above the play controls to make settings move with the sound." />
            : <p className="midi-panel-empty">Starting…</p>}
        </div>
        {/* With no input, nothing can move the links, so the column is not shown. */}
        {settings.kind !== "none" && (
          <div className="midi-panel-mappings audio-sensors-column" {...help("audio.sensors")}>
            {/* The scene's audio links ("audio sensors"), under the name of the scene they belong to. */}
            <div className="stage-label audio-levels-label audio-sensors-label" data-tip={sceneName}><Broadcast size={13} weight="bold" /> Audio sensors: <span className="audio-sensors-scene">{sceneName}</span></div>
            <SoundSettings engine={engine} />
          </div>
        )}
      </div>
    </section>
  );
}
