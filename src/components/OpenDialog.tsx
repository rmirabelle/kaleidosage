import { invoke } from "@tauri-apps/api/core";
import { ArrowClockwise, ArrowUp, CaretDown, CaretRight, CaretUp, CheckCircle, Copy, Desktop, DownloadSimple, FileImage, FilmSlate, Folder, FolderOpen, HardDrive, House, Images, MagnifyingGlass, MusicNote, MusicNotes, PencilSimple, SpinnerGap, Trash, WarningCircle, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Engine } from "../engine/engine";
import { createParams, createPlayState, type GroupKey, type Params, type PlayState } from "../engine/params";
import { sourceSize, type ImageSource } from "../engine/renderer";
import { applyScene } from "../engine/scene";
import { loadImageFile } from "../lib/images";
import { isVideoPath, loadVideoFile } from "../lib/videos";
import { loadSceneMedia } from "../lib/scenes";
import { isShow, readFileScene, readFileSummary, type FileSummary } from "../lib/kaleidoFile";
import { formatPlayTime } from "../lib/tracks";
import { ColorFolder } from "./ColorFolder";

/** The kind of file the dialog opens: an image (or a video), a Kaleido Sage project (.ksage), or an audio file for the tracks. */
export type OpenKind = "image" | "scene" | "audio";

interface Props {
  kind: OpenKind;
  /** The dialog's heading. */
  title: string;
  /** The line under the heading, in place of the kind's own (see TEXT). */
  hint?: string;
  onCancel: () => void;
  onOpen: (path: string) => void;
  /**
   * When set, several files can be picked (Ctrl + click, Shift + click,
   * Shift + arrow keys, Ctrl + A), and Open passes them all, in list order.
   * One picked file still goes to onOpen.
   */
  onOpenMany?: (paths: string[]) => void;
}

/** "scene" in a listing is a file with one scene; "playlist" is a show (two or more scenes, or audio files, see isShow). The "scene" dialog lists both. */
type EntryKind = "folder" | OpenKind | "playlist";
type PlaceKind = "home" | "desktop" | "documents" | "pictures" | "downloads" | "drive";
type SortKey = "name" | "type" | "modified" | "size";
type SortDirection = "asc" | "desc";

interface SortState {
  key: SortKey;
  direction: SortDirection;
}

const DEFAULT_SORT: SortState = { key: "name", direction: "asc" };

type Notice = { tone: "error" | "success"; message: string } | null;

interface ContextMenuState {
  x: number;
  y: number;
  entry: BrowseEntry;
}

interface RenameState {
  path: string;
  value: string;
}

interface BrowseEntry {
  name: string;
  path: string;
  kind: EntryKind;
  size: number;
  modifiedMs: number | null;
}

interface BrowseListing {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
}

interface BrowsePlace {
  name: string;
  path: string;
  kind: PlaceKind;
}

interface ImagePreviewData {
  kind: "image";
  imageUrl: string;
  width: number;
  height: number;
}

/** A scene's settings and its images (made smaller), which the preview plays. */
interface ScenePreviewData {
  kind: "scene";
  params: Params;
  state: PlayState;
  image: ImageSource;
  image2: ImageSource | null;
  width: number;
  height: number;
  effects: string[];
}

interface VideoPreviewData {
  kind: "video";
  url: string;
  width: number;
  height: number;
}

/** A show's summary, for the dashboard in the preview column (see ShowDashboard). */
interface ShowPreviewData {
  kind: "show";
  summary: FileSummary;
}

type PreviewData = ImagePreviewData | ScenePreviewData | VideoPreviewData | ShowPreviewData;

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: PreviewData }
  | { status: "error"; message: string };

const DIRECTORY_KEY = "kaleidosage.open-directory";
const STATE_KEY = "kaleidosage.open-dialog";
const PREVIEW_MAX_EDGE = 1200;
const PREVIEW_CACHE_LIMIT = 24;
const MIN_WIDTH = 1040;
const MIN_HEIGHT = 700;
/** Space kept between the dialog and the window edge. */
const OVERLAY_MARGIN = 28;

/** The effect groups a scene can turn on, with the names the settings panel uses. */
const EFFECT_GROUPS: [GroupKey, string][] = [
  ["warp", "Warp"],
  ["map", "Algorithm"],
  ["kaleidoscope", "Kaleidoscope"],
  ["blur", "Blur"],
  ["trails", "Trails"],
  ["smear", "Time smear"],
  ["contours", "Contours"],
  ["relief", "Relief"],
  ["driver", "Driver"],
  ["terrain", "Terrain"],
  ["camera", "Camera"],
  ["solid", "3D object"],
  ["sort", "Pixel sort"],
  ["particles", "Particles"],
  ["cycles", "Light cycles"],
  ["rays", "Light rays"],
  ["lasers", "Lasers"],
  ["outlines", "Light shapes"],
  ["picture", "Image or Video"],
  ["bloom", "Bloom"],
  ["sharpen", "Sharpen"],
  ["color", "Color"],
  ["levels", "Levels"],
  ["mask", "Opacity mask"]
];

const IMAGE_TYPES: Record<string, string> = {
  png: "PNG image", jpg: "JPEG image", jpeg: "JPEG image", webp: "WebP image",
  gif: "GIF image", bmp: "BMP image", avif: "AVIF image",
  mp4: "MP4 video", m4v: "MP4 video", webm: "WebM video", mov: "MOV video", avi: "AVI video"
};

const TEXT: Record<OpenKind, { hint: string; empty: string; startPlace: PlaceKind }> = {
  image: { hint: "Choose a PNG, JPEG, WebP, GIF, BMP or AVIF image, or an MP4, M4V, WebM, MOV or AVI video.", empty: "This folder has no images or videos.", startPlace: "pictures" },
  scene: { hint: "Choose a Kaleido Sage project (.ksage). It opens in place of the open project.", empty: "This folder has no Kaleido Sage projects.", startPlace: "documents" },
  audio: { hint: "Choose MP3, WAV, FLAC, OGG, Opus, M4A or AAC audio files for the Files list.", empty: "This folder has no audio files.", startPlace: "home" }
};

interface DialogFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const RESIZE_EDGES: ResizeEdge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

/** Widths of the two outer columns; the file list takes what is left. */
interface ColumnWidths {
  places: number;
  preview: number;
}

const DEFAULT_COLUMNS: ColumnWidths = { places: 172, preview: 340 };
const SPLITTER_WIDTH = 6;
const PLACES_MIN = 120;
const PLACES_MAX = 400;
const PREVIEW_MIN = 240;
const FILES_MIN = 360;

const clampColumns = (columns: ColumnWidths, dialogWidth: number): ColumnWidths => {
  const available = dialogWidth - SPLITTER_WIDTH * 2;
  const places = Math.min(PLACES_MAX, Math.max(PLACES_MIN, Math.min(columns.places, available - FILES_MIN - PREVIEW_MIN)));
  const preview = Math.max(PREVIEW_MIN, Math.min(columns.preview, available - places - FILES_MIN));
  return { places, preview };
};

interface StoredState {
  frame?: DialogFrame;
  columns?: ColumnWidths;
  search?: string;
  sort?: SortState;
}

const isSort = (value: unknown): value is SortState => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (record.key === "name" || record.key === "type" || record.key === "modified" || record.key === "size")
    && (record.direction === "asc" || record.direction === "desc");
};

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** A file's type in a word or two, for the Type column: KS Scene, KS Playlist, Audio, or an image's or video's extension (JPG, MP4). */
const shortType = (entry: BrowseEntry) => {
  if (entry.kind === "folder") return "Folder";
  if (entry.kind === "scene") return "KS Scene";
  if (entry.kind === "playlist") return "KS Playlist";
  if (entry.kind === "audio") return "Audio";
  return (entry.name.split(".").pop() ?? "").toUpperCase();
};

/** Folders always come first; within each group the chosen column decides the order, then the name. */
const compareEntries = (a: BrowseEntry, b: BrowseEntry, sort: SortState) => {
  if ((a.kind === "folder") !== (b.kind === "folder")) return a.kind === "folder" ? -1 : 1;
  let result = 0;
  if (sort.key === "type") result = collator.compare(shortType(a), shortType(b));
  else if (sort.key === "modified") result = (a.modifiedMs ?? 0) - (b.modifiedMs ?? 0);
  else if (sort.key === "size") result = a.size - b.size;
  if (result === 0) result = collator.compare(a.name, b.name);
  return sort.direction === "asc" ? result : -result;
};

/** Selects the file name without its extension, the way File Explorer does. */
const selectBaseName = (input: HTMLInputElement) => {
  const dot = input.value.lastIndexOf(".");
  input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
};

const hasNumbers = (value: unknown, keys: string[]) => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return keys.every((key) => typeof record[key] === "number" && Number.isFinite(record[key]));
};

const isFrame = (value: unknown): value is DialogFrame => hasNumbers(value, ["left", "top", "width", "height"]);
const isColumns = (value: unknown): value is ColumnWidths => hasNumbers(value, ["places", "preview"]);

/** Reads the last dialog frame, column widths, search text and sort order; ignores anything malformed. */
const loadStoredState = (): StoredState => {
  try {
    const stored = JSON.parse(localStorage.getItem(STATE_KEY) || "null") as Record<string, unknown> | null;
    if (!stored || typeof stored !== "object") return {};
    return {
      frame: isFrame(stored.frame) ? stored.frame : undefined,
      columns: isColumns(stored.columns) ? stored.columns : undefined,
      search: typeof stored.search === "string" ? stored.search : undefined,
      sort: isSort(stored.sort) ? stored.sort : undefined
    };
  } catch {
    return {};
  }
};

const saveStoredState = (patch: StoredState) => {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...loadStoredState(), ...patch }));
  } catch {
    /* The dialog works without its stored state. */
  }
};

/**
 * Fits a requested frame into the overlay: never smaller than the minimum
 * size (or the overlay, when the window is smaller than that) and never
 * outside the overlay's padded content box.
 */
const clampFrame = (frame: DialogFrame, bounds: { width: number; height: number }): DialogFrame => {
  const minWidth = Math.min(MIN_WIDTH, bounds.width);
  const minHeight = Math.min(MIN_HEIGHT, bounds.height);
  const width = Math.min(bounds.width, Math.max(minWidth, frame.width));
  const height = Math.min(bounds.height, Math.max(minHeight, frame.height));
  return {
    width,
    height,
    left: Math.min(bounds.width - width, Math.max(0, frame.left)),
    top: Math.min(bounds.height - height, Math.max(0, frame.top))
  };
};

const centeredFrame = (size: { width: number; height: number }, bounds: { width: number; height: number }) =>
  clampFrame({
    width: size.width,
    height: size.height,
    left: (bounds.width - size.width) / 2,
    top: (bounds.height - size.height) / 2
  }, bounds);

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const formatDate = (value: number | null) => {
  if (value === null) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const typeLabel = (entry: BrowseEntry) => {
  if (entry.kind === "folder") return "Folder";
  if (entry.kind === "scene") return "Kaleido Sage scene";
  if (entry.kind === "playlist") return "Kaleido Sage playlist";
  if (entry.kind === "audio") return "Audio file";
  return IMAGE_TYPES[entry.name.split(".").pop()?.toLowerCase() ?? ""] ?? "Image";
};

/** A copy of the image whose longest side is at most PREVIEW_MAX_EDGE. */
function shrink(image: HTMLImageElement): HTMLCanvasElement {
  const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create a preview canvas.");
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function buildImagePreview(path: string): Promise<ImagePreviewData | VideoPreviewData> {
  if (isVideoPath(path)) {
    const { video } = await loadVideoFile(path);
    const data: VideoPreviewData = { kind: "video", url: video.src, width: video.videoWidth, height: video.videoHeight };
    URL.revokeObjectURL(video.src);
    video.removeAttribute("src");
    video.load();
    return data;
  }
  /* The image's own blob URL is already revoked, so the preview is drawn from a canvas copy. */
  const { image } = await loadImageFile(path);
  return {
    kind: "image",
    imageUrl: shrink(image).toDataURL("image/png"),
    width: image.naturalWidth,
    height: image.naturalHeight
  };
}

/** Reads a single scene's file in place (see readFileScene) into fresh settings that only the preview uses. */
async function buildScenePreview(path: string): Promise<ScenePreviewData> {
  const text = await readFileScene(path, 0);
  const params = createParams();
  const state = createPlayState();
  const images = applyScene(text, params, state);
  const { source: image } = await loadSceneMedia(images.image);
  const image2 = images.image2 ? (await loadSceneMedia(images.image2)).source : null;
  const [width, height] = sourceSize(image);
  /* A video plays as it is; a still image is made smaller for the preview. */
  const small = (source: ImageSource) => source instanceof HTMLImageElement ? shrink(source) : source;
  return {
    kind: "scene",
    params,
    state,
    image: small(image),
    image2: image2 ? small(image2) : null,
    width,
    height,
    effects: EFFECT_GROUPS.filter(([key]) => state.groups[key]).map(([, label]) => label)
  };
}

/** A show's preview is its dashboard; a single scene plays. */
async function buildFilePreview(path: string): Promise<PreviewData> {
  const summary = await readFileSummary(path);
  return isShow(summary) ? { kind: "show", summary } : buildScenePreview(path);
}

const buildPreview = (entry: BrowseEntry): Promise<PreviewData> =>
  entry.kind === "scene" || entry.kind === "playlist" ? buildFilePreview(entry.path) : buildImagePreview(entry.path);

const INPUT_NAMES: Record<string, string> = { tracks: "Files", output: "PC sound", input: "Microphone", none: "None" };

/** One card of the show dashboard: a heading with an icon and a blue count badge, then the files, numbered, in a list that scrolls by itself. */
function ShowCard({ title, icon, files, empty, strip, times }: {
  title: string;
  icon: ReactNode;
  files: FileSummary["scenes"];
  empty: string;
  strip?: RegExp;
  /** Show each file's length instead of its size, with the total in a footer (the tracks, when the file kept their lengths). */
  times?: boolean;
}) {
  const known = files.filter((file) => file.seconds !== null);
  const total = known.reduce((sum, file) => sum + (file.seconds ?? 0), 0);
  return (
    <section className="playlist-card">
      <header className="playlist-card-head">{icon}<span className="playlist-card-title">{title}</span><span className="playlist-card-count">{files.length}</span></header>
      {files.length ? (
        <ol className="playlist-list">
          {files.map((file, index) => (
            <li key={`${index}:${file.name}`} className="playlist-item">
              <span className="playlist-item-number">{index + 1}</span>
              <span className="playlist-item-name" data-tip={file.name}>{strip ? file.name.replace(strip, "") : file.name}</span>
              <span className="playlist-item-size">{times ? (file.seconds !== null ? formatPlayTime(file.seconds) : "–") : formatSize(file.bytes)}</span>
            </li>
          ))}
        </ol>
      ) : <p className="playlist-empty">{empty}</p>}
      {times && files.length > 0 && (
        <footer className="playlist-card-foot">
          <span>{files.length === 1 ? "1 file" : `${files.length} files`}</span>
          <span>{formatPlayTime(total)}{known.length < files.length ? "+" : ""}</span>
        </footer>
      )}
    </section>
  );
}

/**
 * A show's preview in the Open dialog: a dashboard of the selected file.
 * The audio settings, then two cards of the same height, the tracks and
 * the scenes, each of which scrolls by itself. The file's size and date
 * are in the details under the preview.
 */
function ShowDashboard({ summary }: { summary: FileSummary }) {
  const audio = summary.audio ?? {};
  return (
    <div className="playlist-dashboard">
      <div className="playlist-audio">
        <span>Input <b>{INPUT_NAMES[audio.kind ?? "none"] ?? "None"}</b></span>
        {audio.gainDb !== undefined && <span>Gain <b>{audio.gainDb} dB</b></span>}
        {audio.thresholdDb !== undefined && <span>Threshold <b>{audio.thresholdDb} dB</b></span>}
      </div>
      <ShowCard title="Tracks" icon={<MusicNotes size={15} weight="fill" />} files={summary.tracks} empty="No tracks" times={summary.tracks.some((track) => track.seconds !== null)} />
      <ShowCard title="Scenes" icon={<FilmSlate size={15} weight="fill" />} files={summary.scenes} empty="No scenes" strip={/\.ksage$/i} />
    </div>
  );
}

/** Native controls provide play/pause, seeking, and time for the selected video. */
function VideoPreview({ video }: { video: VideoPreviewData }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const player = ref.current;
    if (!player) return;
    player.src = video.url;
    return () => {
      player.pause();
      player.removeAttribute("src");
      player.load();
    };
  }, [video]);
  return <video ref={ref} className="open-preview-video" crossOrigin="anonymous" controls muted loop playsInline preload="auto" aria-label="Video preview" />;
}

/**
 * Plays the selected scene in a small engine of its own. The canvas stays
 * in the page while the dialog is open, so the engine (and its GPU context)
 * is made once, on the first scene, and freed when the dialog closes.
 */
function ScenePreview({ scene }: { scene: ScenePreviewData | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => () => {
    engineRef.current?.dispose();
    engineRef.current = null;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!scene) {
      engineRef.current?.stop();
      return;
    }
    try {
      engineRef.current ??= new Engine(canvas);
      const engine = engineRef.current;
      /* Copies, so the playing preview never changes the cached scene. */
      Object.assign(engine.params, structuredClone(scene.params));
      Object.assign(engine.state, structuredClone(scene.state), { paused: false });
      engine.setImage(scene.image, 0);
      if (scene.image2) engine.setImage(scene.image2, 1);
      else engine.clearSecondImage();
      engine.resetTrails();
      engine.start();
      setFailure(null);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }, [scene]);

  return (
    <>
      <canvas ref={canvasRef} className="open-preview-canvas" hidden={!scene || failure !== null} />
      {scene && failure && (
        <div className="open-preview-placeholder error"><WarningCircle size={30} weight="fill" /><span>{failure}</span></div>
      )}
    </>
  );
}

const placeIcon = (kind: PlaceKind) => {
  switch (kind) {
    case "home": return <House size={16} />;
    case "desktop": return <Desktop size={16} />;
    case "documents": return <Folder size={16} />;
    case "pictures": return <Images size={16} />;
    case "downloads": return <DownloadSimple size={16} />;
    default: return <HardDrive size={16} />;
  }
};

const entryIcon = (entry: BrowseEntry) => {
  if (entry.kind === "folder") return <Folder size={17} weight="fill" className="open-entry-icon folder" />;
  if (entry.kind === "scene") return <img className="open-entry-icon" src="/icon.ico" alt="" />;
  if (entry.kind === "playlist") return <MusicNotes size={17} weight="duotone" className="open-entry-icon image" />;
  if (entry.kind === "audio") return <MusicNote size={17} weight="duotone" className="open-entry-icon image" />;
  if (isVideoPath(entry.path)) return <FilmSlate size={17} weight="duotone" className="open-entry-icon image" />;
  return <FileImage size={17} weight="duotone" className="open-entry-icon image" />;
};

/**
 * The app's own Open dialog, with a preview: an image shows as a still
 * picture, and a scene plays as it will look. It can be moved and resized,
 * and it remembers its size, column widths, sort order and the last folder
 * for each kind of file. Right-click a file to rename, copy or delete it.
 */
export function OpenDialog({ kind, title, hint, onCancel, onOpen, onOpenMany }: Props) {
  const multiple = Boolean(onOpenMany);
  const directoryKey = `${DIRECTORY_KEY}.${kind}`;
  const text = TEXT[kind];
  const [places, setPlaces] = useState<BrowsePlace[]>([]);
  const [listing, setListing] = useState<BrowseListing | null>(null);
  const [notice, setNoticeState] = useState<Notice>(null);
  const [loadingDirectory, setLoadingDirectory] = useState(true);
  const [search, setSearchState] = useState(() => loadStoredState().search ?? "");
  const [sort, setSortState] = useState<SortState>(() => loadStoredState().sort ?? DEFAULT_SORT);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renaming, setRenaming] = useState<RenameState | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const setNotice = useCallback((next: Notice) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = null;
    setNoticeState(next);
    if (next?.tone === "success") {
      noticeTimer.current = window.setTimeout(() => setNoticeState(null), 3200);
    }
  }, []);

  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  const setSearch = useCallback((next: string) => {
    setSearchState(next);
    saveStoredState({ search: next });
  }, []);

  /** Clicking the active column flips its direction; clicking another column sorts by it ascending. */
  const sortBy = useCallback((key: SortKey) => {
    setSortState((current) => {
      const next: SortState = current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" };
      saveStoredState({ sort: next });
      return next;
    });
  }, []);
  /** The entry with the focus: it shows in the preview, and the keys move from it. */
  const [selected, setSelected] = useState<BrowseEntry | null>(null);
  /** The picked files (paths); with one file, the one with the focus. Folders are never picked. */
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  /** Where a Shift + click range starts: the last entry picked without Shift. */
  const anchorRef = useRef<string | null>(null);
  /** Gives the focus to one entry and picks only it (a plain click, the arrow keys). */
  const selectOne = useCallback((entry: BrowseEntry | null) => {
    setSelected(entry);
    setPicked(new Set(entry && entry.kind !== "folder" ? [entry.path] : []));
    anchorRef.current = entry?.path ?? null;
  }, []);
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const [frame, setFrame] = useState<DialogFrame | null>(null);
  const [columns, setColumns] = useState<ColumnWidths>(() => loadStoredState().columns ?? DEFAULT_COLUMNS);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const directoryRequest = useRef(0);
  const previewRequest = useRef(0);
  const previewCache = useRef(new Map<string, PreviewData>());
  const listRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<DialogFrame | null>(null);
  frameRef.current = frame;

  const overlayBounds = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return { width: MIN_WIDTH, height: MIN_HEIGHT };
    return {
      width: Math.max(0, overlay.clientWidth - OVERLAY_MARGIN * 2),
      height: Math.max(0, overlay.clientHeight - OVERLAY_MARGIN * 2)
    };
  }, []);

  /**
   * The dialog reopens at its last size and position, or centered at the
   * default size the first time. A ResizeObserver keeps it inside the window
   * when the window shrinks.
   */
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const stored = loadStoredState().frame;
    setFrame(stored
      ? clampFrame(stored, overlayBounds())
      : centeredFrame({ width: MIN_WIDTH, height: MIN_HEIGHT }, overlayBounds()));
    const observer = new ResizeObserver(() => {
      setFrame((current) => (current ? clampFrame(current, overlayBounds()) : current));
    });
    observer.observe(overlay);
    return () => observer.disconnect();
  }, [overlayBounds]);

  const startMove = (event: React.PointerEvent<HTMLElement>) => {
    const origin = frameRef.current;
    if (!origin || event.button !== 0) return;
    /* Buttons in the header (the close button) keep their normal click behavior. */
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    const bounds = overlayBounds();
    const startX = event.clientX;
    const startY = event.clientY;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);

    const onMove = (move: PointerEvent) => {
      setFrame(clampFrame({
        ...origin,
        left: origin.left + move.clientX - startX,
        top: origin.top + move.clientY - startY
      }, bounds));
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      const final = frameRef.current;
      if (final) saveStoredState({ frame: final });
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  const startColumnResize = (side: keyof ColumnWidths) => (event: React.PointerEvent<HTMLDivElement>) => {
    const dialog = frameRef.current;
    if (!dialog || event.button !== 0) return;
    event.preventDefault();
    const origin = columnsRef.current;
    const startX = event.clientX;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);

    const onMove = (move: PointerEvent) => {
      const dx = move.clientX - startX;
      /* The places column grows to the right; the preview column grows to the left. */
      const next = side === "places"
        ? { ...origin, places: origin.places + dx }
        : { ...origin, preview: origin.preview - dx };
      setColumns(clampColumns(next, dialog.width));
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      saveStoredState({ columns: columnsRef.current });
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  const startResize = (edge: ResizeEdge) => (event: React.PointerEvent<HTMLDivElement>) => {
    const origin = frameRef.current;
    if (!origin || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = overlayBounds();
    const minWidth = Math.min(MIN_WIDTH, bounds.width);
    const minHeight = Math.min(MIN_HEIGHT, bounds.height);
    const startX = event.clientX;
    const startY = event.clientY;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);

    const onMove = (move: PointerEvent) => {
      const dx = move.clientX - startX;
      const dy = move.clientY - startY;
      let { left, top, width, height } = origin;
      if (edge.includes("e")) width = Math.min(bounds.width - left, Math.max(minWidth, origin.width + dx));
      if (edge.includes("s")) height = Math.min(bounds.height - top, Math.max(minHeight, origin.height + dy));
      if (edge.includes("w")) {
        width = Math.min(origin.left + origin.width, Math.max(minWidth, origin.width - dx));
        left = origin.left + origin.width - width;
      }
      if (edge.includes("n")) {
        height = Math.min(origin.top + origin.height, Math.max(minHeight, origin.height - dy));
        top = origin.top + origin.height - height;
      }
      setFrame({ left, top, width, height });
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      const final = frameRef.current;
      if (final) saveStoredState({ frame: final });
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  /**
   * Lists a folder. `selectPath` re-selects an entry after a refresh, for
   * example the file that was just renamed.
   */
  const navigate = useCallback(async (path: string, selectPath: string | null = null) => {
    const request = ++directoryRequest.current;
    setLoadingDirectory(true);
    setContextMenu(null);
    setRenaming(null);
    try {
      const next = await invoke<BrowseListing>("list_browse_directory", { path });
      if (request !== directoryRequest.current) return false;
      setListing(next);
      setNotice(null);
      selectOne(next.entries.find((entry) => entry.path === selectPath) ?? null);
      try {
        localStorage.setItem(directoryKey, next.path);
      } catch {
        /* The dialog then starts in the default folder next time. */
      }
      return true;
    } catch (error) {
      if (request === directoryRequest.current) setNotice({ tone: "error", message: String(error) });
      return false;
    } finally {
      if (request === directoryRequest.current) setLoadingDirectory(false);
    }
  }, [directoryKey, selectOne, setNotice]);

  const beginRename = useCallback((entry: BrowseEntry) => {
    setContextMenu(null);
    selectOne(entry);
    setRenaming({ path: entry.path, value: entry.name });
  }, [selectOne]);

  const commitRename = useCallback(async () => {
    const current = renaming;
    if (!current) return;
    const entry = listing?.entries.find((candidate) => candidate.path === current.path);
    setRenaming(null);
    if (!entry || current.value.trim() === "" || current.value.trim() === entry.name) return;
    try {
      const newPath = await invoke<string>("rename_browse_entry", { path: entry.path, newName: current.value });
      previewCache.current.delete(entry.path);
      await navigate(listing?.path ?? "", newPath);
      setNotice({ tone: "success", message: `Renamed to ${current.value.trim()}` });
    } catch (error) {
      setNotice({ tone: "error", message: String(error) });
    }
  }, [listing, navigate, renaming, setNotice]);

  const deleteEntry = useCallback(async (entry: BrowseEntry) => {
    setContextMenu(null);
    try {
      await invoke("delete_browse_entry", { path: entry.path });
      previewCache.current.delete(entry.path);
      await navigate(listing?.path ?? "");
      setNotice({ tone: "success", message: `Moved ${entry.name} to the Recycle Bin` });
    } catch (error) {
      setNotice({ tone: "error", message: String(error) });
    }
  }, [listing?.path, navigate, setNotice]);

  const copyEntry = useCallback(async (entry: BrowseEntry) => {
    setContextMenu(null);
    try {
      await invoke("copy_browse_entry", { path: entry.path });
      setNotice({ tone: "success", message: `Copied ${entry.name}. Paste it in File Explorer.` });
    } catch (error) {
      setNotice({ tone: "error", message: String(error) });
    }
  }, [setNotice]);

  const openContextMenu = (entry: BrowseEntry) => (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    /* A right-click on a picked file keeps the other picks. */
    if (picked.has(entry.path)) setSelected(entry);
    else selectOne(entry);
    setRenaming(null);
    setContextMenu({ x: event.clientX, y: event.clientY, entry });
  };

  /* Any click, scroll or key outside the menu closes it. */
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as HTMLElement | null)?.closest(".open-context-menu")) close();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("blur", close);
    window.addEventListener("wheel", close, true);
    window.addEventListener("keydown", close, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("keydown", close, true);
    };
  }, [contextMenu]);

  useEffect(() => {
    let active = true;
    void (async () => {
      let nextPlaces: BrowsePlace[] = [];
      try {
        nextPlaces = await invoke<BrowsePlace[]>("browse_places");
      } catch {
        /* Places are a convenience; the dialog still works without them. */
      }
      if (!active) return;
      setPlaces(nextPlaces);
      let remembered: string | null = null;
      try {
        remembered = localStorage.getItem(directoryKey);
      } catch {
        /* Start in the default folder. */
      }
      const candidates = [
        remembered,
        nextPlaces.find((place) => place.kind === text.startPlace)?.path,
        nextPlaces.find((place) => place.kind === "home")?.path,
        ...nextPlaces.map((place) => place.path)
      ].filter((candidate): candidate is string => Boolean(candidate));
      for (const candidate of candidates) {
        if (!active) return;
        if (await navigate(candidate)) return;
      }
      if (active) {
        setNotice({ tone: "error", message: "Kaleido Sage could not find a folder to browse." });
        setLoadingDirectory(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [directoryKey, navigate, setNotice, text.startPlace]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      /* A non-empty search box clears itself first; a second Escape closes the dialog. */
      const target = event.target as HTMLElement | null;
      if (target?.classList.contains("open-search-input") && (target as HTMLInputElement).value !== "") {
        setSearch("");
        return;
      }
      onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, setSearch]);

  const visibleEntries = useMemo(() => {
    if (!listing) return [];
    const needle = search.trim().toLowerCase();
    return listing.entries
      .filter((entry) =>
        (entry.kind === "folder" || entry.kind === kind || (kind === "scene" && entry.kind === "playlist"))
        && (needle === "" || entry.name.toLowerCase().includes(needle)))
      .sort((a, b) => compareEntries(a, b, sort));
  }, [kind, listing, search, sort]);

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || (event.key === "Enter" && visibleEntries.length > 0)) {
      event.preventDefault();
      if (!selected || !visibleEntries.some((entry) => entry.path === selected.path)) selectOne(visibleEntries[0] ?? null);
      listRef.current?.focus();
    }
  };

  /* A search that hides the focused entry clears it; hidden picks are dropped. */
  useEffect(() => {
    if (selected && !visibleEntries.some((entry) => entry.path === selected.path)) setSelected(null);
    setPicked((current) => {
      const shown = [...current].filter((path) => visibleEntries.some((entry) => entry.path === path));
      return shown.length === current.size ? current : new Set(shown);
    });
  }, [selected, visibleEntries]);

  /**
   * A click with Ctrl adds the file to the picks or takes it out; with
   * Shift, it picks every file from the anchor to it. Folders, and every
   * click when only one file can be picked, pick only that entry.
   */
  const selectWith = (entry: BrowseEntry, { ctrlKey, shiftKey }: { ctrlKey: boolean; shiftKey: boolean }) => {
    if (!multiple || entry.kind === "folder" || (!ctrlKey && !shiftKey)) {
      selectOne(entry);
      return;
    }
    if (shiftKey) {
      const from = visibleEntries.findIndex((candidate) => candidate.path === anchorRef.current);
      const to = visibleEntries.findIndex((candidate) => candidate.path === entry.path);
      if (from < 0 || to < 0) {
        selectOne(entry);
        return;
      }
      const range = visibleEntries.slice(Math.min(from, to), Math.max(from, to) + 1);
      setPicked(new Set(range.filter((candidate) => candidate.kind !== "folder").map((candidate) => candidate.path)));
      setSelected(entry);
      return;
    }
    const next = new Set(picked);
    if (next.has(entry.path)) next.delete(entry.path);
    else next.add(entry.path);
    setPicked(next);
    setSelected(entry);
    anchorRef.current = entry.path;
  };

  /** The picked files, in list order. */
  const pickedPaths = visibleEntries.filter((entry) => picked.has(entry.path)).map((entry) => entry.path);

  useEffect(() => {
    /* Audio files have no preview; a show's is its dashboard (see ShowDashboard). */
    if (!selected || selected.kind === "folder" || selected.kind === "audio") {
      previewRequest.current++;
      setPreview({ status: "idle" });
      return;
    }
    const cached = previewCache.current.get(selected.path);
    if (cached) {
      previewRequest.current++;
      setPreview({ status: "ready", data: cached });
      return;
    }
    const request = ++previewRequest.current;
    setPreview({ status: "loading" });
    let cancelled = false;
    void buildPreview(selected)
      .then((data) => {
        if (cancelled) return;
        const cache = previewCache.current;
        // Keep only the selected video preview; the native conversion cache
        // already avoids re-encoding when this file is selected again.
        if (data.kind !== "video") cache.set(selected.path, data);
        while (cache.size > PREVIEW_CACHE_LIMIT) {
          const oldest = cache.keys().next().value;
          if (oldest === undefined) break;
          cache.delete(oldest);
        }
        if (request === previewRequest.current) setPreview({ status: "ready", data });
      })
      .catch((error) => {
        if (!cancelled && request === previewRequest.current) {
          setPreview({ status: "error", message: error instanceof Error ? error.message : String(error) });
        }
      });
    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    document.getElementById(`open-entry-${selected.path}`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const activate = useCallback((entry: BrowseEntry) => {
    if (entry.kind === "folder") void navigate(entry.path);
    else onOpen(entry.path);
  }, [navigate, onOpen]);

  /** Open and Enter: every picked file when there are several, else the focused entry. */
  const openPicked = () => {
    if (onOpenMany && pickedPaths.length > 1) onOpenMany(pickedPaths);
    else if (selected) activate(selected);
  };

  const goUp = useCallback(() => {
    if (listing?.parent) void navigate(listing.parent);
  }, [listing, navigate]);

  const onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (renaming) return;
    if (visibleEntries.length === 0 && event.key !== "Backspace") return;
    const index = selected ? visibleEntries.findIndex((entry) => entry.path === selected.path) : -1;
    /* Shift + an arrow key picks every file from the anchor, as Shift + click does. */
    const moveTo = (next: number) => {
      event.preventDefault();
      const target = visibleEntries[Math.min(visibleEntries.length - 1, Math.max(0, next))];
      if (event.shiftKey) selectWith(target, { ctrlKey: false, shiftKey: true });
      else selectOne(target);
    };
    if (multiple && event.ctrlKey && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setPicked(new Set(visibleEntries.filter((entry) => entry.kind !== "folder").map((entry) => entry.path)));
      return;
    }
    switch (event.key) {
      case "ArrowDown": moveTo(index + 1); break;
      case "ArrowUp": moveTo(index <= 0 ? 0 : index - 1); break;
      case "Home": moveTo(0); break;
      case "End": moveTo(visibleEntries.length - 1); break;
      case "PageDown": moveTo(index + 10); break;
      case "PageUp": moveTo(index - 10); break;
      case "Enter":
        if (selected || pickedPaths.length > 0) {
          event.preventDefault();
          openPicked();
        }
        break;
      case "Backspace":
        event.preventDefault();
        goUp();
        break;
      case "F2":
        if (selected) {
          event.preventDefault();
          beginRename(selected);
        }
        break;
      case "Delete":
        if (selected) {
          event.preventDefault();
          void deleteEntry(selected);
        }
        break;
      default:
        break;
    }
  };

  const onRenameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    /* Keep Enter and Escape inside the rename box; the list and the dialog must not react. */
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      void commitRename();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setRenaming(null);
      listRef.current?.focus();
    } else {
      event.stopPropagation();
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sort.key !== key) return null;
    return sort.direction === "asc" ? <CaretUp size={11} weight="bold" /> : <CaretDown size={11} weight="bold" />;
  };

  const sortHeader = (key: SortKey, label: string) => (
    <button
      type="button"
      className={`open-sort-button ${sort.key === key ? "active" : ""}`}
      onClick={() => sortBy(key)}
      aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      data-tip={`Sort by ${label.toLowerCase()}`}
    >
      <span>{label}</span>
      {sortIndicator(key)}
    </button>
  );

  const crumbs = useMemo(() => {
    if (!listing) return [];
    const separator = listing.path.includes("\\") ? "\\" : "/";
    const absolutePrefix = /^[\\/]/.test(listing.path) ? separator : "";
    const parts = listing.path.split(/[\\/]+/).filter(Boolean);
    return parts.map((part, index) => {
      const isDrive = index === 0 && /^[A-Za-z]:$/.test(part);
      return {
        label: isDrive ? `${part}${separator}` : part,
        path: isDrive ? `${part}${separator}` : absolutePrefix + parts.slice(0, index + 1).join(separator)
      };
    });
  }, [listing]);

  const folderPlaces = places.filter((place) => place.kind !== "drive");
  const drivePlaces = places.filter((place) => place.kind === "drive");
  const currentPath = listing?.path ?? null;
  const selectedId = selected ? `open-entry-${selected.path}` : undefined;
  const layout = clampColumns(columns, frame?.width ?? MIN_WIDTH);
  const gridTemplateColumns =
    `${layout.places}px ${SPLITTER_WIDTH}px minmax(0, 1fr) ${SPLITTER_WIDTH}px ${layout.preview}px`;
  const ready = preview.status === "ready" ? preview.data : null;
  const playingScene = ready?.kind === "scene" ? ready : null;

  const renderPlace = (place: BrowsePlace) => (
    <button
      key={place.path}
      type="button"
      className={`open-place ${currentPath === place.path ? "active" : ""}`}
      onClick={() => void navigate(place.path)}
      data-tip={place.path}
    >
      {placeIcon(place.kind)} <span>{place.name}</span>
    </button>
  );

  return (
    <div ref={overlayRef} className="open-dialog-overlay" role="presentation" onPointerDown={onCancel}>
      <div
        className="open-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-file-title"
        style={frame
          ? { left: frame.left + OVERLAY_MARGIN, top: frame.top + OVERLAY_MARGIN, width: frame.width, height: frame.height }
          : { visibility: "hidden" }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {RESIZE_EDGES.map((edge) => (
          <div key={edge} className={`open-resize-handle ${edge}`} onPointerDown={startResize(edge)} aria-hidden="true" />
        ))}
        <header className="open-dialog-header" onPointerDown={startMove}>
          <div className="open-dialog-title-icon">
            {kind === "scene" ? <FilmSlate size={22} weight="fill" /> : kind === "audio" ? <MusicNotes size={22} weight="fill" /> : <FolderOpen size={22} weight="fill" />}
          </div>
          <div>
            <h2 id="open-file-title">{title}</h2>
            <p>{hint ?? text.hint}</p>
          </div>
          <button className="open-dialog-close" onClick={onCancel} aria-label="Close" data-tip="Close">
            <X size={18} />
          </button>
        </header>

        <div className="open-dialog-body" style={{ gridTemplateColumns }}>
          <nav className="open-places" aria-label="Places">
            {folderPlaces.length > 0 && (
              <div className="open-places-group">
                <span>Places</span>
                {folderPlaces.map(renderPlace)}
              </div>
            )}
            {drivePlaces.length > 0 && (
              <div className="open-places-group">
                <span>Drives</span>
                {drivePlaces.map(renderPlace)}
              </div>
            )}
          </nav>

          <div
            className="open-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the places column"
            onPointerDown={startColumnResize("places")}
          />

          <section className="open-files" aria-label="Files">
            <div className="open-toolbar">
              <div className="open-toolbar-row">
                <button
                  type="button"
                  className="open-toolbar-button"
                  onClick={goUp}
                  disabled={!listing?.parent}
                  aria-label="Go to the parent folder"
                  data-tip="Parent folder (Backspace)"
                >
                  <ArrowUp size={15} weight="bold" />
                </button>
                <div className="open-breadcrumbs" data-tip={currentPath ?? undefined}>
                  {crumbs.map((crumb, index) => (
                    <span className="open-crumb" key={crumb.path}>
                      {index > 0 && <CaretRight size={11} className="open-crumb-separator" />}
                      <button
                        type="button"
                        className={index === crumbs.length - 1 ? "current" : ""}
                        onClick={() => void navigate(crumb.path)}
                      >
                        {crumb.label}
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="open-toolbar-row">
                <label className="open-search">
                  <MagnifyingGlass size={14} />
                  <input
                    type="text"
                    className="open-search-input"
                    placeholder="Search this folder"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={onSearchKeyDown}
                    aria-label="Search this folder by name"
                    spellCheck={false}
                  />
                  {search !== "" && (
                    <button type="button" onClick={() => setSearch("")} aria-label="Clear search" data-tip="Clear">
                      <X size={12} weight="bold" />
                    </button>
                  )}
                </label>
                <button
                  type="button"
                  className="open-toolbar-button"
                  onClick={() => { if (currentPath) void navigate(currentPath); }}
                  disabled={!currentPath}
                  aria-label="Refresh this folder"
                  data-tip="Refresh"
                >
                  <ArrowClockwise size={15} weight="bold" />
                </button>
              </div>
            </div>

            {notice && (
              <div className={`open-listing-notice ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
                {notice.tone === "error"
                  ? <WarningCircle size={15} weight="fill" />
                  : <CheckCircle size={15} weight="fill" />}
                <span className={notice.tone === "error" ? "selectable" : undefined}>{notice.message}</span>
                <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" data-tip="Dismiss">
                  <X size={12} weight="bold" />
                </button>
              </div>
            )}

            <div className="open-list-header">
              {sortHeader("name", "Name")}
              {sortHeader("type", "Type")}
              {sortHeader("modified", "Modified")}
              {sortHeader("size", "Size")}
            </div>
            <div
              ref={listRef}
              className="open-list"
              role="listbox"
              aria-label="Folder contents"
              aria-multiselectable={multiple || undefined}
              aria-activedescendant={selectedId}
              tabIndex={0}
              onKeyDown={onListKeyDown}
            >
              {loadingDirectory && listing === null && (
                <div className="open-list-empty"><SpinnerGap className="spin" size={18} /> Loading…</div>
              )}
              {listing !== null && visibleEntries.length === 0 && !loadingDirectory && (
                <div className="open-list-empty">
                  {search.trim() !== "" ? `Nothing here matches “${search.trim()}”.` : text.empty}
                </div>
              )}
              {visibleEntries.map((entry) => {
                const focused = selected?.path === entry.path;
                const active = picked.has(entry.path) || (focused && entry.kind === "folder");
                return (
                  <div
                    key={entry.path}
                    id={`open-entry-${entry.path}`}
                    role="option"
                    aria-selected={active}
                    className={`open-entry ${active ? "selected" : ""} ${focused && multiple ? "focused" : ""}`}
                    onClick={(event) => selectWith(entry, event)}
                    onDoubleClick={() => activate(entry)}
                    onContextMenu={openContextMenu(entry)}
                  >
                    <span className="open-entry-name">
                      {entryIcon(entry)}
                      {renaming?.path === entry.path ? (
                        <input
                          type="text"
                          className="open-rename-input"
                          value={renaming.value}
                          autoFocus
                          spellCheck={false}
                          aria-label={`New name for ${entry.name}`}
                          onFocus={(event) => selectBaseName(event.currentTarget)}
                          onChange={(event) => setRenaming({ path: entry.path, value: event.target.value })}
                          onKeyDown={onRenameKeyDown}
                          onBlur={() => void commitRename()}
                          onClick={(event) => event.stopPropagation()}
                          onDoubleClick={(event) => event.stopPropagation()}
                        />
                      ) : (
                        <span>{entry.name}</span>
                      )}
                    </span>
                    <span className="open-entry-meta" data-tip={typeLabel(entry)}>{shortType(entry)}</span>
                    <span className="open-entry-meta">{formatDate(entry.modifiedMs)}</span>
                    <span className="open-entry-meta">{entry.kind === "folder" ? "" : formatSize(entry.size)}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <div
            className="open-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the preview column"
            onPointerDown={startColumnResize("preview")}
          />

          <aside className="open-preview" aria-label="Preview">
            <div className={`open-preview-frame ${ready?.kind === "show" ? "playlist" : ""}`}>
              {preview.status === "idle" && (
                <div className="open-preview-placeholder">
                  {kind === "scene" ? <FilmSlate size={34} weight="duotone" /> : kind === "audio" ? <MusicNotes size={34} weight="duotone" /> : <FileImage size={34} weight="duotone" />}
                  <span>{selected?.kind === "folder" ? "Double-click a folder to open it." : kind === "audio" ? "Pick one or more audio files." : "Select a file to preview it."}</span>
                </div>
              )}
              {preview.status === "loading" && (
                <div className="open-preview-placeholder"><SpinnerGap className="spin" size={26} /><span>Loading preview…</span></div>
              )}
              {preview.status === "error" && (
                <div className="open-preview-placeholder error"><WarningCircle size={30} weight="fill" /><span>{preview.message}</span></div>
              )}
              {ready?.kind === "image" && (
                <img src={ready.imageUrl} alt={selected ? `Preview of ${selected.name}` : "Preview"} />
              )}
              {ready?.kind === "video" && <VideoPreview video={ready} />}
              {ready?.kind === "show" && selected && <ShowDashboard summary={ready.summary} />}
              <ScenePreview scene={playingScene} />
            </div>
            {selected && (
              <dl className="open-preview-details">
                <dt>Name</dt>
                <dd className="open-preview-name" data-tip={selected.name}>{selected.name}</dd>
                <dt>Type</dt>
                <dd>{typeLabel(selected)}</dd>
                {ready && ready.kind !== "show" && (
                  <>
                    <dt>{ready.kind === "scene" ? "Image size" : "Dimensions"}</dt>
                    <dd>{ready.width} × {ready.height} px</dd>
                  </>
                )}
                {ready?.kind === "scene" && (
                  <>
                    <dt>Sources</dt>
                    <dd>{ready.image2 ? "2 (fades between them)" : "1"}</dd>
                    <dt>Effects on</dt>
                    <dd>{ready.effects.length > 0 ? ready.effects.join(", ") : "None"}</dd>
                  </>
                )}
                <dt>Modified</dt>
                <dd>{formatDate(selected.modifiedMs)}</dd>
                {selected.kind !== "folder" && (
                  <>
                    <dt>File size</dt>
                    <dd>{formatSize(selected.size)}</dd>
                  </>
                )}
              </dl>
            )}
          </aside>
        </div>

        {contextMenu && (
          <div
            className="open-context-menu"
            role="menu"
            aria-label={`Actions for ${contextMenu.entry.name}`}
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 190),
              top: Math.min(contextMenu.y, window.innerHeight - 130)
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button type="button" role="menuitem" onClick={() => beginRename(contextMenu.entry)}>
              <PencilSimple size={15} /> <span>Rename</span> <kbd>F2</kbd>
            </button>
            <button type="button" role="menuitem" onClick={() => void copyEntry(contextMenu.entry)}>
              <Copy size={15} /> <span>Copy</span>
            </button>
            <button type="button" role="menuitem" className="danger" onClick={() => void deleteEntry(contextMenu.entry)}>
              <Trash size={15} /> <span>Delete</span> <kbd>Del</kbd>
            </button>
          </div>
        )}

        <footer className="open-dialog-actions">
          {multiple && <span className="open-dialog-hint">Ctrl + click or Shift + click to pick several. {kind === "scene" ? "Their scenes go after the open project's scenes." : "They go to the end of the Files list."}</span>}
          <button className="button secondary" onClick={onCancel}>Cancel</button>
          <button
            className="button primary"
            disabled={!selected && pickedPaths.length === 0}
            onClick={openPicked}
          >
            <ColorFolder size={19} /> {pickedPaths.length > 1 ? `Open ${pickedPaths.length} files` : "Open"}
          </button>
        </footer>
      </div>
    </div>
  );
}
