import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CircleHalfTilt, FlipHorizontal, GridFour, MagicWand, Sun } from "@phosphor-icons/react";
import type { Engine } from "../engine/engine";
import type { BlendMode, Tiling } from "../engine/renderer";
import { ContextMenu } from "./ContextMenu";
import { TilingIcon } from "./TilingIcon";
import { useParamRows } from "./useParamRows";
import { SourceImages, type SourceImagesProps } from "./SourceImages";
import { help } from "../help/topics";
import { HelpButton } from "./HelpButton";
import { MediaIcon } from "./MediaIcon";
import { placeSeek } from "./Slider";
import { scenePosition } from "../engine/loop";
import type { SongScript } from "../engine/songScript";
import { tracks } from "../lib/tracks";
import { songFollow } from "../lib/songFollow";

/** How the picture fades from A to B: an even crossfade, or B appearing by brightness. */
const BLEND_MODES: readonly (readonly [BlendMode, string, ReactNode])[] = [
  [0, "Even crossfade", <CircleHalfTilt size={14} />],
  [1, "Dissolve by brightness", <Sun size={14} />]
];

/** How the images go on past their edges; auto repeats a repeating test pattern and mirrors anything else. */
const TILINGS: readonly (readonly [Tiling, string, ReactNode])[] = [
  [0, "Auto", <MagicWand size={14} />],
  [1, "Mirror", <FlipHorizontal size={14} />],
  [2, "Repeat", <GridFour size={14} />]
];

/**
 * The scene's card, at the top of the left panel, titled with the scene's
 * name: first the scene's Length, which times the sources and every
 * effect; then images A and B side by side, and, once B is loaded, the
 * Crossfade slider between them. The
 * blend only has an effect with a second image, so it shows only then. How
 * it fades (evenly, or by brightness) is in the slider's right-click menu,
 * to save the room a menu row took. A video slot has a Loop check box
 * under it. The tile button in the title bar sets how the images go on
 * past their edges. It is always open. The scene's play toolbar is at the
 * bottom of the column, under the FX card (see SceneTransport).
 */
export function SourcePanel({ engine, sceneName, ...sources }: Omit<SourceImagesProps, "videoLoop" | "onVideoLoop"> & {
  engine: Engine;
  /** The scene's file name (without .ksage), or "Untitled Scene": the card's title. */
  sceneName: string;
}) {
  const row = useParamRows(engine);
  const [blendMode, setBlendMode] = useState<BlendMode>(engine.state.blendMode);
  const [tiling, setTiling] = useState<Tiling>(engine.state.tiling);
  const [videoLoop, setVideoLoop] = useState(engine.state.videoCrossfade);
  const [tilingMenu, setTilingMenu] = useState<{ left: number; top: number } | null>(null);
  const tilingName = TILINGS.find(([mode]) => mode === tiling)?.[1] ?? "Auto";
  return (
    <section className="panel-card source-section" {...help("source")}>
      <div className="panel-header-bar">
        <h2 className="side-panel-title source-title" data-tip={sceneName}><span>{sceneName}</span></h2>
        <HelpButton topic="source" />
        <button
          className={`source-tiling ${tilingMenu ? "open" : ""}`}
          data-tip={`Tiling: ${tilingName}. How the images go on past their edges.`}
          aria-label={`Tiling: ${tilingName}`}
          aria-haspopup="menu"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setTilingMenu(tilingMenu ? null : { left: box.left, top: box.bottom + 4 });
          }}
        >
          <TilingIcon size={18} />
        </button>
        {tilingMenu && createPortal(
          <ContextMenu
            position={tilingMenu}
            onClose={() => setTilingMenu(null)}
            items={TILINGS.map(([mode, label, icon]) => ({
              label,
              icon,
              selected: mode === tiling,
              run: () => {
                engine.state.tiling = mode;
                setTiling(mode);
              }
            }))}
          />,
          document.body
        )}
      </div>
      <div className="panel-root-row source-length">
        {row("cycle")}
      </div>
      <div className="source-well">
        <SourceImages
          {...sources}
          videoLoop={videoLoop}
          onVideoLoop={(on) => {
            engine.state.videoCrossfade = on;
            setVideoLoop(on);
          }}
        />
        {sources.images[1] && row.with("imageBlend", {
          menu: BLEND_MODES.map(([mode, label, icon]) => ({
            label,
            icon,
            selected: mode === blendMode,
            run: () => {
              engine.state.blendMode = mode;
              setBlendMode(mode);
            }
          }))
        })}
      </div>
    </section>
  );
}

/** Seconds as "0:07". */
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/** The steps of the scene's bar: a scrub can land on any of this many places in the Length. */
const SCRUB_STEPS = 1000;

/**
 * The scene's play toolbar, a card of its own at the bottom of the left
 * panel, under the FX card, laid out as the Playlist card's toolbar: first a
 * countdown bar to the next scene (see nextSceneIn), yellow in its last 10
 * seconds and red in its last 5, with HOLD after it (gray while off, red
 * and blinking while on; a click turns it on or off). That row shows only
 * when Hold means something: with more than one scene, or while the picture
 * follows a song. Then
 * Stop (back to the
 * start, `Shift+Space`), Play or Pause (`Space`), a bar to scrub in the
 * scene's Length (see Engine.seekTo), and the time in it. It runs the scene
 * only; the music has its own toolbar in the Playlist card. The bars and
 * the time follow the scene in each animation frame, not through React
 * state.
 *
 * While the picture follows a song (see songFollow.ts), the song's time
 * runs the scene: Pause freezes the whole picture while the music plays
 * on, and Play lets it catch up with the song (see Engine.songStep). The
 * bar is then off (the Playlist card's bar moves in the song), and the
 * countdown runs to the next change of scene (the song plan's next cue).
 *
 * While Song follow is on with music in the Playlist, the Playlist card's
 * controls and the Song Map run the show, so in place of this card the
 * FX card ends in one full-width Scene Hold button, under a divider, below
 * its list (which scrolls on its own). A paused scene plays again as that starts, as
 * no Play button is left to start it.
 */
/** True while Song follow is on with music in the Playlist: the scene's controls are then one Scene Hold button, at the bottom of the FX card (see ControlPanel). */
export function useSceneHoldOnly() {
  const enabled = useSyncExternalStore((listener) => songFollow.subscribe(listener), () => songFollow.enabled);
  const count = useSyncExternalStore((listener) => tracks.subscribe(listener), () => tracks.list.length);
  return enabled && count > 0;
}

export function SceneTransport({ engine, paused, onTogglePause, onStop, show, autoNext, held, onToggleHold }: {
  engine: Engine;
  paused: boolean;
  onTogglePause: () => void;
  /** Pauses and goes back to the start; off while paused. */
  onStop: () => void;
  /** True when the show goes on to the next scene by itself (Files, with more than one scene). */
  autoNext: boolean;
  /** True when Hold means something (more than one scene, or a song to follow): the countdown and HOLD show. */
  show: boolean;
  /** True while Hold keeps the scene (see holdScene in App). */
  held: boolean;
  onToggleHold: () => void;
}) {
  const bar = useRef<HTMLInputElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const cap = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const countdown = useRef<HTMLElement>(null);
  const dragging = useRef(false);
  const autoNextRef = useRef(autoNext);
  autoNextRef.current = autoNext;
  const heldRef = useRef(held);
  heldRef.current = held;
  /** The song the picture follows, or null; only a change renders again (React skips a set to the same value). */
  const [song, setSong] = useState<SongScript | null>(null);
  const spaceRunsSong = useSceneHoldOnly();
  const songRef = useRef(song);
  songRef.current = song;
  /* Only as Song follow starts: a later Pause is the user's own. */
  useEffect(() => {
    if (spaceRunsSong && paused) onTogglePause();
  }, [spaceRunsSong]);
  useEffect(() => engine.onFrame(() => {
    setSong(engine.script?.script ?? null);
    const following = songRef.current;
    const now = engine.songNow;
    /* The place on the bar, the time, and the countdown's time left and span: in the song, or in the scene's Length. */
    let position: number, text: string, left: number, span: number, idle: boolean;
    if (following && now) {
      /* The bar is off, and no time shows after it. */
      position = 0;
      text = "";
      const next = following.plan.cues.find((cue) => cue.time > now.time);
      const before = following.plan.cues.filter((cue) => cue.time <= now.time).pop()?.time ?? 0;
      left = next ? next.time - now.time : following.duration - now.time;
      span = (next?.time ?? following.duration) - before;
      idle = heldRef.current || !autoNextRef.current || !next;
    } else {
      position = scenePosition(engine.state);
      const length = engine.params.cycle.value;
      text = `${time(position * length)} / ${time(length)}`;
      left = nextSceneIn(position, length, autoNextRef.current);
      span = length;
      idle = heldRef.current || !autoNextRef.current;
    }
    if (bar.current && !dragging.current) bar.current.value = String(Math.round(position * SCRUB_STEPS));
    placeSeek(bar.current, fill.current, cap.current, Number(bar.current?.value ?? 0) / SCRUB_STEPS);
    if (clock.current && clock.current.textContent !== text) clock.current.textContent = text;
    /* The countdown: the bar empties as the next scene comes near; gray while no scene comes by itself (or Hold is on), yellow in the last 10 seconds, red in the last 5. */
    if (countdown.current) {
      countdown.current.style.width = `${Math.min(1, left / Math.max(1e-3, span)) * 100}%`;
      countdown.current.classList.toggle("under", idle);
      countdown.current.classList.toggle("soon", !idle && left <= 10 && left > 5);
      countdown.current.classList.toggle("now", !idle && left <= 5);
    }
  }), [engine]);

  if (spaceRunsSong) {
    return (
      <div className="scene-transport scene-hold-bar" aria-label="Scene controls" {...help("play")}>
        <button
          className={`hold-toggle wide ${held ? "on" : ""}`}
          aria-pressed={held}
          onClick={onToggleHold}
          data-tip={held
            ? "Scene Hold is on: this scene stays, and the slice that plays loops in the music. Click to follow the song again."
            : "Scene Hold: keep this scene, and loop the slice that plays. A change you make to the scene turns it on by itself."}
        >
          <span className="hold-badge-label">Scene Hold</span>
        </button>
      </div>
    );
  }
  return (
    <div className="panel-card playlist-transport scene-transport" aria-label="Scene controls" {...help("play")}>
      {show && (
        <div className="scene-countdown-row">
          <span className="audio-meter-well scene-countdown" data-tip={song
            ? "The time to the next scene: the song's next hit or change of level. Yellow: 10 seconds left; red: 5."
            : "The time to the next scene: the end of the Length, or a new track when that comes first. Yellow: 10 seconds left; red: 5."}>
            <i ref={countdown} />
          </span>
          <button
            className={`hold-toggle ${held ? "on" : ""}`}
            aria-pressed={held}
            onClick={onToggleHold}
            data-tip={held
              ? "Scene Hold is on: this scene stays and plays on its own, and the music plays on. Click Scene Hold, or play the music, to go on."
              : "Scene Hold: keep this scene, and let it play on its own. A change you make to the scene turns Scene Hold on by itself."}
          >
            <span className="hold-badge-label">Scene Hold</span>
          </button>
        </div>
      )}
      <div className="playlist-transport-row">
        <div className="panel-buttons">
          {/* With Song follow on, Space runs the song (see App), so these buttons show no key. */}
          <button
            className="panel-button icon"
            onClick={onStop}
            disabled={paused}
            data-tip={song ? "Stop: freeze the picture; the music plays on" : spaceRunsSong ? "Stop: pause the scene, and go back to its start" : "Stop `Shift+Space`: pause the scene, and go back to its start"}
            aria-keyshortcuts={song || spaceRunsSong ? undefined : "Shift+Space"}
            aria-label="Stop"
          >
            <MediaIcon kind="stop" size={16} />
          </button>
          <button
            className="panel-button icon"
            onClick={onTogglePause}
            data-tip={song
              ? (paused ? "Play the scene: the picture catches up with the song" : "Pause the scene: freeze the picture; the music plays on")
              : spaceRunsSong ? (paused ? "Play the scene" : "Pause the scene")
              : (paused ? "Play the scene `Space`" : "Pause the scene `Space`")}
            aria-label={paused ? "Play" : "Pause"}
          >
            {paused ? <MediaIcon kind="play" size={16} /> : <MediaIcon kind="pause" size={16} />}
          </button>
        </div>
        <div className="slider playlist-seek" data-tip={song ? "The song moves the scene: move in the song with the Playlist card's bar" : "Drag to scrub the scene in its Length"}>
          <div className="slider-well">
            <div ref={fill} className="slider-fill" style={{ left: 0 }} />
          </div>
          <div ref={cap} className="seek-cap" />
          <input
            ref={bar}
            type="range"
            min={0}
            max={SCRUB_STEPS}
            step={1}
            disabled={song !== null}
            aria-label="Place in the scene's Length"
            onPointerDown={() => { dragging.current = true; }}
            onPointerUp={() => { dragging.current = false; }}
            onChange={(event) => engine.seekTo((Number(event.target.value) / SCRUB_STEPS) * engine.params.cycle.value)}
          />
        </div>
        <span ref={clock} className="playlist-transport-time" />
      </div>
    </div>
  );
}

/**
 * Seconds to the next scene, from the place in the Length (0 to 1): the
 * end of the Length. With "autoNext" and music playing, a new track comes
 * first when it is sooner, or when the Length would end in the last half
 * Length of the track (the track end then takes precedence, see App).
 */
function nextSceneIn(position: number, length: number, autoNext: boolean) {
  const lengthLeft = (1 - position) * length;
  if (!autoNext || !tracks.playing || tracks.duration <= 0) return lengthLeft;
  const trackLeft = tracks.duration - tracks.position;
  return trackLeft - lengthLeft < length / 2 ? trackLeft : lengthLeft;
}
