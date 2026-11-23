import { FloppyDisk, Image as ImageIcon, X, YoutubeLogo } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { writeExport } from "../lib/exports";
import { THUMB_HEIGHT, THUMB_WIDTH, drawThumbnail, pickAccent, splitTitle, thumbnailReady, type ThumbnailSpec } from "../lib/thumbnail";

/** One exported video and the still taken from it. */
export interface ThumbnailJob {
  videoPath: string;
  title: string;
  still: ImageData;
}

/** The artist and the picture's place, kept for the next thumbnail. */
const STORE_KEY = "kaleidosage.thumbnail";
const readStored = (): Partial<ThumbnailSpec> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed as Partial<ThumbnailSpec> : {};
  } catch {
    return {};
  }
};

/** Ready-made accent colors, after the color taken from the picture. */
const SWATCHES = ["#ffc23a", "#9dff3a", "#3ae0ff", "#5a8cff", "#b45aff", "#ff3fd0", "#ff4a4a"];

const folderOf = (path: string) => path.replace(/[\\/][^\\/]*$/, "");
const baseName = (path: string) => path.replace(/^.*[\\/]/, "").replace(/\.mp4$/i, "").replace(/_360$/, "");

/**
 * The thumbnail editor: opens after a video export with a thumbnail, one
 * video at a time. The fields change the template (see lib/thumbnail.ts);
 * Save writes "<video name> on Kaleido Sage.png" next to the video, with a
 * number added when that file is already there.
 */
export function ThumbnailDialog({ jobs, onSaved, onUpload, onError, onClose }: {
  jobs: ThumbnailJob[];
  onSaved: (videoPath: string, path: string) => void;
  /** Save and Upload: the thumbnail is saved, then the upload dialog opens with its video. */
  onUpload: (videoPath: string) => void;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const job = jobs[index];
  const stored = useMemo(readStored, []);
  const [picture, setPicture] = useState<ImageBitmap | null>(null);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [artist, setArtist] = useState(typeof stored.artist === "string" ? stored.artist : "");
  const [topLine, setTopLine] = useState("");
  const [mainLine, setMainLine] = useState("");
  const [pictureAccent, setPictureAccent] = useState("#5fc8ff");
  const [accent, setAccent] = useState<string | null>(null);
  const [pictureX, setPictureX] = useState(typeof stored.pictureX === "number" ? stored.pictureX : 0.4);
  const [zoom, setZoom] = useState(typeof stored.zoom === "number" ? stored.zoom : 1.1);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    void thumbnailReady().then((image) => {
      setLogo(image);
      setReady(true);
    });
  }, []);

  /* Each video: its still as a picture, its title split into two lines, and the color of its picture. */
  useEffect(() => {
    let cancelled = false;
    const { topLine: top, mainLine: main } = splitTitle(job.title);
    setTopLine(top);
    setMainLine(main);
    setAccent(null);
    void createImageBitmap(job.still).then((bitmap) => {
      if (cancelled) return bitmap.close();
      setPictureAccent(pickAccent(bitmap));
      setPicture((old) => {
        old?.close();
        return bitmap;
      });
    });
    return () => { cancelled = true; };
  }, [job]);

  const spec: ThumbnailSpec = { artist, topLine, mainLine, accent: accent ?? pictureAccent, pictureX, zoom };
  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (context && picture && ready) drawThumbnail(context, picture, spec, logo);
  });

  const next = () => {
    if (index + 1 < jobs.length) setIndex(index + 1);
    else onClose();
  };

  const save = async (upload = false) => {
    const canvas = canvasRef.current;
    if (!canvas || saving) return;
    setSaving(true);
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ artist, pictureX, zoom })); } catch { /* Remembering is a convenience only. */ }
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("The thumbnail could not be made.");
      const [path] = await invoke<string[]>("free_export_paths", { folder: folderOf(job.videoPath), names: [`${baseName(job.videoPath)} on Kaleido Sage.png`] });
      await writeExport(path, blob);
      onSaved(job.videoPath, path);
      if (upload) onUpload(job.videoPath);
      else next();
    } catch (error) {
      onError(`Could not save the thumbnail. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div className="about-dialog-overlay video-dialog-overlay">
      <div className="about-dialog video-dialog thumbnail-dialog" role="dialog" aria-modal="true" aria-labelledby="thumbnail-dialog-title">
        <header className="video-dialog-header">
          <div className="open-dialog-title-icon"><ImageIcon size={22} weight="duotone" /></div>
          <div>
            <h2 id="thumbnail-dialog-title">YouTube Thumbnail{jobs.length > 1 ? ` (${index + 1} of ${jobs.length})` : ""}</h2>
            <p>{THUMB_WIDTH} × {THUMB_HEIGHT} PNG, saved next to {baseName(job.videoPath)}.mp4.</p>
          </div>
          <button className="about-dialog-close" onClick={onClose} aria-label="Close" data-tip="Close `Esc`"><X size={18} /></button>
        </header>
        <div className="video-dialog-body">
          <canvas ref={canvasRef} className="thumbnail-preview" width={THUMB_WIDTH} height={THUMB_HEIGHT} />
          <label className="video-row">
            <span className="video-label">Artist</span>
            <input className="video-input" type="text" value={artist} placeholder="None" spellCheck={false} onChange={(event) => setArtist(event.target.value)} />
          </label>
          <label className="video-row">
            <span className="video-label">Top line</span>
            <input className="video-input" type="text" value={topLine} placeholder="None" spellCheck={false} onChange={(event) => setTopLine(event.target.value)} />
          </label>
          <label className="video-row">
            <span className="video-label">Title</span>
            <input className="video-input" type="text" value={mainLine} spellCheck={false} autoFocus onChange={(event) => setMainLine(event.target.value)} />
          </label>
          <div className="video-row">
            <span className="video-label">Color</span>
            <div className="thumbnail-swatches" role="radiogroup" aria-label="Color">
              {[null, ...SWATCHES].map((color) => (
                <button
                  key={color ?? "picture"}
                  role="radio"
                  aria-checked={accent === color}
                  className={`thumbnail-swatch ${accent === color ? "active" : ""} ${color ? "" : "from-picture"}`}
                  style={{ background: color ?? pictureAccent }}
                  data-tip={color ? undefined : "The color of the picture"}
                  aria-label={color ?? "The color of the picture"}
                  onClick={() => setAccent(color)}
                />
              ))}
            </div>
          </div>
          <label className="video-row">
            <span className="video-label">Picture</span>
            <input className="thumbnail-range" type="range" min={-0.5} max={1} step={0.01} value={pictureX} aria-label="Picture position" onChange={(event) => setPictureX(Number(event.target.value))} />
          </label>
          <label className="video-row">
            <span className="video-label">Zoom</span>
            <input className="thumbnail-range" type="range" min={1} max={2.5} step={0.01} value={zoom} aria-label="Zoom" onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
        </div>
        <footer className="about-dialog-actions video-dialog-actions">
          <button className="button secondary" onClick={next}>{index + 1 < jobs.length ? "Skip" : "Cancel"}</button>
          {jobs.length === 1 && <button className="button secondary" disabled={!picture || saving} onClick={() => void save(true)}><YoutubeLogo size={16} weight="bold" /> Save and Upload…</button>}
          <button className="button primary" disabled={!picture || saving} onClick={() => void save()}><FloppyDisk size={16} weight="bold" /> Save Thumbnail</button>
        </footer>
      </div>
    </div>
  );
}
