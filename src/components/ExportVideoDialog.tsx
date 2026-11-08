import { FilmStrip, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { Engine } from "../engine/engine";
import { STITCH_FADE, TITLE_HOLD, VIDEO_SIZES, atResolution, formatLength, loopSeconds, seamlessChanges, stitchPlan, type VideoFps, type VideoOptions, type VideoQuality, type VideoResolution, type VideoScenes, type VideoSizeId, type VideoStyle } from "../lib/videoExport";
import { help } from "../help/topics";

/** The choices made last time, so the dialog opens with them. */
const STORE_KEY = "kaleidosage.video-export";

const readStored = (): Partial<VideoOptions> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed as Partial<VideoOptions> : {};
  } catch {
    return {};
  }
};

const LOOP_CHOICES = [1, 2, 3];
const RESOLUTION_CHOICES: { value: VideoResolution; label: string; note: string }[] = [
  { value: "4k", label: "4K", note: "Sharpest" },
  { value: "1080p", label: "1080p", note: "Faster, smaller file" }
];
const QUALITY_CHOICES: { value: VideoQuality; label: string; note: string }[] = [
  { value: "standard", label: "Standard", note: "Smallest file" },
  { value: "high", label: "High", note: "Larger file" },
  { value: "best", label: "Best", note: "Largest file" }
];
const FPS_CHOICES: VideoFps[] = [60, 30];

/** A row of choice buttons. */
function ChoiceRow<T extends string>({ label, choices, value, onChange }: { label: string; choices: { value: T; label: string; note: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="video-row">
      <span className="video-label">{label}</span>
      <div className="video-choices" role="radiogroup" aria-label={label}>
        {choices.map((choice) => (
          <button
            key={choice.value}
            role="radio"
            aria-checked={value === choice.value}
            className={`video-choice ${value === choice.value ? "active" : ""}`}
            onClick={() => onChange(choice.value)}
          >
            <strong>{choice.label}</strong>
            <span>{choice.note}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The outline of a video size, its long side 28 px. */
const SHAPE_SIZE = 28;
const shapeStyle = (width: number, height: number) => {
  const scale = SHAPE_SIZE / Math.max(width, height, 1);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
};

interface Props {
  engine: Engine;
  /** The video size for the "Screen" choice: the picture's shape on the screen. */
  screenSize: { width: number; height: number };
  /** One loop of each open scene, in seconds. With two or more, the dialog offers all scenes. */
  sceneSeconds: number[];
  /** The playlist's songs that have a plan: the dialog offers a video of each. */
  songs: { path: string; name: string; seconds: number }[];
  onCancel: () => void;
  onExport: (options: VideoOptions) => void;
}

/**
 * Export Video: the length (one, two or three loops of the scene) and the
 * style. Title shows a title box at the start; Seamless loop makes the last
 * frame lead into the first, so the video can repeat with no jump.
 */
export function ExportVideoDialog({ engine, screenSize, sceneSeconds, songs, onCancel, onExport }: Props) {
  const stored = readStored();
  const sizeChoices = [{ id: "screen" as VideoSizeId, ratio: "Screen", sites: "Same shape", ...screenSize }, ...VIDEO_SIZES];
  const [sizeId, setSizeId] = useState<VideoSizeId>(sizeChoices.some((choice) => choice.id === stored.size) ? stored.size! : "screen");
  const [resolution, setResolution] = useState<VideoResolution>(stored.resolution === "1080p" ? "1080p" : "4k");
  const choice = sizeChoices.find((option) => option.id === sizeId)!;
  const size = { ...choice, ...atResolution(choice.id, choice, resolution) };
  const [loops, setLoops] = useState(() => LOOP_CHOICES.includes(stored.loops ?? 0) ? stored.loops! : 1);
  const [style, setStyle] = useState<VideoStyle>(stored.style === "title" ? "title" : "loop");
  const [quality, setQuality] = useState<VideoQuality>(QUALITY_CHOICES.some((choice) => choice.value === stored.quality) ? stored.quality! : "high");
  const [fps, setFps] = useState<VideoFps>(stored.fps === 30 ? 30 : 60);
  const [motionBlur, setMotionBlur] = useState(stored.motionBlur !== false);
  const [scope, setScope] = useState<"current" | "all" | "song">(stored.scenes === "song" ? "song" : stored.scenes === "separate" || stored.scenes === "stitched" ? "all" : "current");
  const [songPick, setSongPick] = useState(stored.song === "all" && songs.length > 1 || songs.some((song) => song.path === stored.song) ? stored.song! : songs[0]?.path ?? "all");
  const [joining, setJoining] = useState<Exclude<VideoScenes, "current">>(stored.scenes === "stitched" ? "stitched" : "separate");
  const sceneCount = sceneSeconds.length;
  const scenes: VideoScenes = scope === "song" && songs.length > 0 ? "song" : scope === "all" && sceneCount > 1 ? joining : "current";
  const picked = songs.filter((song) => songPick === "all" || song.path === songPick);
  const [title, setTitle] = useState(typeof stored.title === "string" ? stored.title : "");
  /** The fade-out box's text; empty keeps the title for the whole video. */
  const [fadeOut, setFadeOut] = useState(stored.fadeOutMs === null ? "" : String(stored.fadeOutMs ?? 1000));
  const loop = loopSeconds(engine);
  const changes = seamlessChanges(engine, loops);

  /** The length of a choice of loops; for separate files, all the videos together. */
  const lengthOf = (count: number) => {
    if (scenes === "song") return picked.reduce((total, song) => total + song.seconds, 0);
    if (scenes === "current") return loop * count;
    if (scenes === "separate") return sceneSeconds.reduce((total, seconds) => total + seconds * count, 0);
    return stitchPlan(sceneSeconds.map((seconds) => Math.max(1, Math.round(seconds * count * 60))), 60, style === "loop").total / 60;
  };

  const submit = () => {
    const typed = Number(fadeOut);
    const fadeOutMs = fadeOut.trim() && Number.isFinite(typed) ? Math.max(0, Math.round(typed)) : null;
    const options: VideoOptions = { scenes, song: songPick, size: sizeId, resolution, style, title, fadeOutMs, loops, quality, fps, motionBlur };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(options)); } catch { /* Remembering is a convenience only. */ }
    onExport(options);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="about-dialog-overlay video-dialog-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className="about-dialog video-dialog" role="dialog" aria-modal="true" aria-labelledby="video-dialog-title" {...help("export")}>
        <header className="video-dialog-header">
          <div className="open-dialog-title-icon"><FilmStrip size={22} weight="duotone" /></div>
          <div>
            <h2 id="video-dialog-title">Export Video</h2>
            <p>MP4, {size.width} × {size.height}. {scenes === "song" ? "The scenes follow the song as it plays, with its sound." : scenes === "current" ? "The video starts where Stop puts the scene." : "Each scene starts where Stop puts it."}</p>
          </div>
          <button className="about-dialog-close" onClick={onCancel} aria-label="Close" data-tip="Close"><X size={18} /></button>
        </header>
        <div className="video-dialog-body">
          {(sceneCount > 1 || songs.length > 0) && (
            <ChoiceRow
              label="Scenes"
              value={scope}
              onChange={setScope}
              choices={[
                { value: "current" as const, label: "Current Scene", note: "The scene on the screen" },
                ...(sceneCount > 1 ? [{ value: "all" as const, label: "All Scenes", note: `${sceneCount} scenes` }] : []),
                ...(songs.length > 0 ? [{ value: "song" as const, label: "Song", note: "As the song plays it" }] : [])
              ]}
            />
          )}
          {scenes === "song" && (
            <label className="video-row">
              <span className="video-label">Song</span>
              <select className="video-input" value={songPick} onChange={(event) => setSongPick(event.target.value)}>
                {songs.map((song) => <option key={song.path} value={song.path}>{song.name}</option>)}
                {songs.length > 1 && <option value="all">All songs, one file each</option>}
              </select>
            </label>
          )}
          {(scenes === "separate" || scenes === "stitched") && (
            <ChoiceRow
              label="Files"
              value={joining}
              onChange={setJoining}
              choices={[
                { value: "separate", label: "Separate files", note: "One video per scene" },
                { value: "stitched", label: "Stitched", note: `One video, ${STITCH_FADE} s crossfades` }
              ]}
            />
          )}
          <div className="video-row">
            <span className="video-label">Size</span>
            <div className="video-choices video-sizes" role="radiogroup" aria-label="Size">
              {sizeChoices.map((choice) => (
                <button
                  key={choice.id}
                  role="radio"
                  aria-checked={sizeId === choice.id}
                  className={`video-choice ${sizeId === choice.id ? "active" : ""}`}
                  data-tip={`${atResolution(choice.id, choice, resolution).width} × ${atResolution(choice.id, choice, resolution).height}`}
                  onClick={() => setSizeId(choice.id)}
                >
                  <span className="video-shape" aria-hidden="true"><i style={shapeStyle(choice.width, choice.height)} /></span>
                  <strong>{choice.ratio}</strong>
                  <span>{choice.sites}</span>
                </button>
              ))}
            </div>
          </div>
          {sizeId !== "sphere" && <ChoiceRow label="Resolution" choices={RESOLUTION_CHOICES} value={resolution} onChange={setResolution} />}
          {sizeId === "sphere" && (
            <p className="video-note">
              The picture goes all around you: its center is in front of you, and its mirror image is behind you. Copy the file to the headset and open it in its video player.
            </p>
          )}
          <div className="video-row" hidden={scenes === "song"}>
            <span className="video-label">Length</span>
            <div className="video-choices" role="radiogroup" aria-label="Length">
              {LOOP_CHOICES.map((count) => (
                <button
                  key={count}
                  role="radio"
                  aria-checked={loops === count}
                  className={`video-choice ${loops === count ? "active" : ""}`}
                  onClick={() => setLoops(count)}
                >
                  <strong>{formatLength(lengthOf(count))}</strong>
                  <span>{count === 1 ? "1 loop" : `${count} loops`}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="video-row">
            <span className="video-label">Quality</span>
            <div className="video-choices" role="radiogroup" aria-label="Quality">
              {QUALITY_CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  role="radio"
                  aria-checked={quality === choice.value}
                  className={`video-choice ${quality === choice.value ? "active" : ""}`}
                  onClick={() => setQuality(choice.value)}
                >
                  <strong>{choice.label}</strong>
                  <span>{choice.note}</span>
                </button>
              ))}
            </div>
          </div>
          {quality === "best" && sizeId !== "sphere" && (
            <p className="video-note">
              Best keeps all the color detail. VLC can open the file; many other players and phones cannot. Use High for a video that plays everywhere.
            </p>
          )}
          <div className="video-row">
            <span className="video-label">Frame rate</span>
            <div className="video-styles" role="radiogroup" aria-label="Frame rate">
              {FPS_CHOICES.map((choice) => (
                <label key={choice} className="video-radio">
                  <input type="radio" name="video-fps" checked={fps === choice} onChange={() => setFps(choice)} />
                  {choice} frames a second{choice === 30 ? " (exports twice as fast)" : ""}
                </label>
              ))}
            </div>
          </div>
          <ChoiceRow
            label="Motion blur"
            value={motionBlur ? "on" : "off"}
            onChange={(value) => setMotionBlur(value === "on")}
            choices={[
              { value: "on", label: "Half-frame", note: "Smoother fast motion" },
              { value: "off", label: "None", note: "Sharpest, can be faster" }
            ]}
          />
          <div className="video-row">
            <span className="video-label">Style</span>
            <div className="video-styles" role="radiogroup" aria-label="Style">
              <label className="video-radio">
                <input type="radio" name="video-style" checked={style === "title"} onChange={() => setStyle("title")} />
                Title
              </label>
              <label className="video-radio">
                <input type="radio" name="video-style" checked={style === "loop"} onChange={() => setStyle("loop")} />
                {scenes === "song" ? "No title" : "Seamless loop"}
              </label>
            </div>
          </div>
          {style === "title" ? (
            <>
              {scenes !== "separate" && scenes !== "song" && (
                <label className="video-row">
                  <span className="video-label">Title</span>
                  <input
                    className="video-input"
                    type="text"
                    value={title}
                    placeholder="No title, only the credit"
                    autoFocus
                    spellCheck={false}
                    onChange={(event) => setTitle(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
                  />
                </label>
              )}
              <label className="video-row">
                <span className="video-label">Fade out</span>
                <span className="video-fade">
                  <input
                    className="video-input"
                    type="text"
                    inputMode="numeric"
                    value={fadeOut}
                    placeholder="Never"
                    onChange={(event) => setFadeOut(event.target.value.replace(/[^0-9]/g, ""))}
                    onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
                  />
                  <span>ms</span>
                </span>
              </label>
              <p className="video-note">
                The title box says "made with Kaleido Sage™" under the title. It shows for {TITLE_HOLD} seconds, then fades out. With no fade-out time, it stays for the whole video.
                {scenes === "separate" && " Each video's title is its scene's name."}
                {scenes === "song" && " The title is the song's name."}
                {scenes === "stitched" && ` The scenes join with ${STITCH_FADE}-second crossfades.`}
              </p>
            </>
          ) : (
            <p className="video-note">
              {scenes === "song"
                ? `The video runs for the whole song (${formatLength(lengthOf(1))}${picked.length > 1 ? " in all" : ""}), with the scenes the song picks.`
                : scenes === "stitched"
                ? `The scenes join with ${STITCH_FADE}-second crossfades. The last scene crossfades into the first, so the video can repeat with no jump.`
                : scenes === "separate"
                  ? "In each video the last frame leads into the first, so it can repeat with no jump."
                  : "The last frame leads into the first, so the video can repeat with no jump."}
              {scenes === "current" && changes.customRanges > 0 && ` Ranges with their own time change a little, so they repeat in the video.`}
              {scenes === "current" && changes.crossfade && ` A random or drunk range, a flowing noise or cell warp, a flying tunnel, or a flying camera never repeats, so the last second crossfades into the first.`}
            </p>
          )}
        </div>
        <footer className="about-dialog-actions video-dialog-actions">
          <button className="button secondary" onClick={onCancel}>Cancel</button>
          <button className="button primary" onClick={submit}><FilmStrip size={16} weight="bold" /> {scenes === "separate" ? `Export ${sceneCount} Videos` : scenes === "song" && picked.length > 1 ? `Export ${picked.length} Videos` : "Export Video"}</button>
        </footer>
      </div>
    </div>
  );
}
