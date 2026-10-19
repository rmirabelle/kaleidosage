import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { ArrowClockwise, ArrowCounterClockwise, ArrowsIn, ArrowsOut, Camera, FilmSlate, FilmStrip, FloppyDisk, Gauge, Info, Keyboard, MusicNotes, Plus, Question, SignOut, SlidersHorizontal, SpeakerSimpleHigh, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { AboutDialog } from "./components/AboutDialog";
import { ShortcutsDialog } from "./components/ShortcutsDialog";
import { HelpLine } from "./components/HelpLine";
import { ColorFolder } from "./components/ColorFolder";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ControlPanel } from "./components/ControlPanel";
import { ExportVideoDialog } from "./components/ExportVideoDialog";
import { ImageSearchDialog } from "./components/ImageSearchDialog";
import { MidiIcon } from "./components/MidiIcon";
import { MidiPanel } from "./components/MidiPanel";
import { AudioPanel } from "./components/AudioPanel";
import { BottomPanelTabs, type BottomTab } from "./components/BottomPanelTabs";
import { SourcePanel } from "./components/SourcePanel";
import { StartScreen } from "./components/StartScreen";
import { MenuBar, type Menu } from "./components/MenuBar";
import { OpenDialog, type OpenKind } from "./components/OpenDialog";
import { StatsOverlay } from "./components/StatsOverlay";
import { TitleBar } from "./components/TitleBar";
import { DocumentTabs, type DocumentTabInfo } from "./components/DocumentTabs";
import { StageControls } from "./components/StageControls";
import { Engine } from "./engine/engine";
import { createParams, createPlayState, nudgeParams, randomizeGroup, randomizeParams, resetEffects, type GroupKey, type Params, type PlayState } from "./engine/params";
import { SettingsHistory } from "./engine/history";
import { SCENE_EXTENSION, applyScene, blobToSceneImage, sceneFingerprint, serializeScene, type SceneImage } from "./engine/scene";
import { loadSceneMedia, readScene, writeScene } from "./lib/scenes";
import type { ImageSource } from "./engine/renderer";
import {
  makeThumbnail,
  loadImageBlob,
  loadCommonsPhoto,
  loadImageFile,
  loadRandomImage,
  type CommonsPhoto
} from "./lib/images";
import { chooseExportPath, fileNameOf, writeExport } from "./lib/exports";
import { PATTERNS, drawPattern, type Pattern } from "./lib/patterns";
import { midi } from "./lib/midi";
import { audioInput } from "./lib/audioInput";
import { tracks } from "./lib/tracks";
import { helpSettings } from "./lib/helpSettings";
import { PLAYLIST_EXTENSION, openPlaylistFile, playlistFingerprint, readManifest, savePlaylistFile, type PlaylistAudio } from "./lib/playlistFile";
import { revealMainWindow } from "./lib/splash";
import { isVideoPath, isVideoType, loadVideoBlob, loadVideoFile, stageVideoBlob, type VideoFile } from "./lib/videos";
import { checkForUpdate, getAppVersion, type UpdateInfo } from "./lib/updater";
import { encodeVideo, videoSize, type VideoOptions } from "./lib/videoExport";

const MIDI_PANEL_HEIGHT_KEY = "kaleidosage.midi-panel-height";
/** The MIDI panel's height limits, in pixels; it opens at its last height, or DEFAULT. */
const MIDI_PANEL_MIN = 120;
const MIDI_PANEL_DEFAULT = 230;

interface Status {
  message: string;
  action?: { label: string; run: () => void };
  /** How long the message stays; 0 keeps it until the next message. */
  duration: number;
  /** Errors stay until closed, and their text can be selected and copied. */
  error?: boolean;
}

const CURSOR_IDLE_MS = 2000;
/** A switch to another scene tab fades from the old scene to the new one over this time (see Engine.fadeOut). */
const CROSSFADE_SECONDS = 1.5;

/** The image in one of the two slots: the first (A) or the second (B), which the picture can fade to. */
export interface SlotImage {
  source: ImageSource;
  /** The original file bytes, for Save scene. Patterns have none; they are saved as PNG. */
  blob?: Blob;
  /** Native stream handle; the video is embedded when saving. */
  videoFile?: VideoFile;
  label: string;
  thumbnail: string;
  /** Set for a test pattern. */
  patternId?: string;
  /** For a pattern: the image the pattern replaced, so one click can bring it back. */
  under?: SlotImage;
  /** A number for each loaded image, so a change of image counts as an unsaved change. */
  id: number;
}

let nextImageId = 1;

/**
 * An open scene in its document tab. The selected scene lives in the
 * engine and in the refs of App; a scene in a tab that is not selected
 * keeps everything here (see StoredScene), frozen at the frame it left.
 */
interface SceneDoc {
  id: number;
  /** The scene file, or null for a scene that was never saved. */
  path: string | null;
  /** For a scene that was never saved: 1 shows "Untitled Scene", 2 "Untitled Scene 2", and so on. */
  untitled: number;
  /** Unsaved changes. For the selected scene, the dirty state in App is the one that is up to date. */
  dirty: boolean;
}

/** The Driver effect's own video: the playing element, its stream (embedded when the scene is saved), its file name, and an id for the unsaved-changes check. */
interface DriverVideo {
  video: HTMLVideoElement;
  videoFile: VideoFile;
  name: string;
  id: number;
}

/** What a scene keeps while its tab is not selected. */
interface StoredScene {
  params: Params;
  state: PlayState;
  images: [SlotImage | null, SlotImage | null];
  driver: DriverVideo | null;
  savedFingerprint: string;
  history: SettingsHistory;
  openGroup: string | null;
}

let nextDocId = 1;

/** Windows file names do not care about case. */
const samePath = (a: string | null, b: string | null) => a !== null && b !== null && a.toLowerCase() === b.toLowerCase();

/**
 * True for a scene file that is the open playlist's own copy: in a folder
 * that the app made in the temp folder (see playlist_archive.rs). Save
 * Playlist writes such a copy in place; any other scene gets a new copy
 * first, so its own file on disk never changes.
 */
const isPlaylistCopy = (path: string | null) => path !== null && /[\\/]kaleidosage-playlist-[^\\/]+[\\/]/i.test(path);

/** One image slot as a scene file keeps it: a video by its stream (embedded when the file is written), anything else as image bytes. */
async function sceneMedia(image: SlotImage): Promise<SceneImage> {
  if (!image.videoFile && image.blob && isVideoType(image.blob.type)) {
    image.videoFile = await stageVideoBlob(image.blob);
  }
  if (image.videoFile) return { type: image.videoFile.mime, video: image.videoFile.id };
  const blob = image.blob ?? (image.source instanceof HTMLCanvasElement
    ? await new Promise<Blob | null>((resolve) => (image.source as HTMLCanvasElement).toBlob(resolve, "image/png")) : null);
  if (!blob) throw new Error("There is no source image or video to save in the scene.");
  return blobToSceneImage(blob);
}

/**
 * Writes a scene file at "path" from these settings and images: the
 * selected scene's (the engine's), or a scene in another tab (its stored
 * copy). The settings are taken before the media is copied, so a change
 * made while it writes still counts as unsaved.
 */
async function writeSceneFile(path: string, params: Params, state: PlayState, [first, second]: [SlotImage | null, SlotImage | null], driver: DriverVideo | null) {
  if (!first) throw new Error("There is no source image or video to save in the scene.");
  const scene = JSON.parse(serializeScene(params, state, { image: { type: "image/png", data: "pending" } }));
  scene.image = await sceneMedia(first);
  if (second) scene.image2 = await sceneMedia(second);
  /* The driver video is embedded like a source video (see scene_archive.rs). */
  if (driver) scene.driverVideo = { type: driver.videoFile.mime, video: driver.videoFile.id, name: driver.name };
  await writeScene(path, JSON.stringify(scene));
}

/** The open Open dialog: what it opens, and for an image, which slot gets it. */
interface OpenRequest {
  kind: OpenKind;
  slot: ImageSlot;
  /** "driver": the picked video becomes the Driver effect's own video. */
  target?: "driver";
}

export type ImageSlot = 0 | 1;

interface SetImageOptions {
  message?: string;
  /** The original file bytes, for Save scene. */
  blob?: Blob;
  /** Native stream handle; the video is embedded when saving. */
  videoFile?: VideoFile;
  /** The name shown for an original image in the Patterns list. */
  name?: string;
  /** Set for a test pattern; the original image is then kept. */
  patternId?: string;
  /** Set when a scene sets the image; the scene's own settings then stay as they are. */
  fromScene?: boolean;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** The first and second images. The ref has the latest pair at once; the state redraws the Source section. */
  const imagesRef = useRef<[SlotImage | null, SlotImage | null]>([null, null]);
  const [images, setImages] = useState<[SlotImage | null, SlotImage | null]>([null, null]);
  /** The Driver effect's own video for the selected scene (the ref at once, the name for the panel). */
  const driverRef = useRef<DriverVideo | null>(null);
  const [driverVideoName, setDriverVideoName] = useState<string | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  /** Loads started by a closed scene must not reopen it when they finish. */
  const sceneGenerationRef = useRef(0);
  const [sceneGeneration, setSceneGeneration] = useState(0);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  /**
   * The MIDI panel at the bottom of the window. It starts closed; it opens
   * at the height it last had, which the user sets by dragging its top
   * edge, and the app keeps that height across restarts.
   */
  const [midiPanelOpen, setMidiPanelOpen] = useState(false);
  /**
   * The bottom panel has two tabs, MIDI and Audio. M shows the MIDI tab and
   * A the Audio tab; the key of the tab that shows closes the panel.
   */
  const [bottomTab, setBottomTab] = useState<BottomTab>("audio");
  const showBottomTab = useCallback((tab: BottomTab) => {
    if (midiPanelOpen && bottomTab === tab) {
      setMidiPanelOpen(false);
      return;
    }
    setBottomTab(tab);
    setMidiPanelOpen(true);
  }, [bottomTab, midiPanelOpen]);
  const toggleMidiPanel = useCallback(() => showBottomTab("midi"), [showBottomTab]);
  const toggleAudioPanel = useCallback(() => showBottomTab("audio"), [showBottomTab]);
  const closeBottomPanel = useCallback(() => setMidiPanelOpen(false), []);
  /* The PC sound starts again at the app's start if it was on when the app closed. */
  useEffect(() => { audioInput.init(); }, []);
  const [midiPanelHeight, setMidiPanelHeight] = useState(() => {
    try { return Number(localStorage.getItem(MIDI_PANEL_HEIGHT_KEY)) || MIDI_PANEL_DEFAULT; } catch { return MIDI_PANEL_DEFAULT; }
  });
  const [midiPanelResizing, setMidiPanelResizing] = useState(false);
  /** A drag on the panel's top edge: up makes it taller, down shorter, within MIDI_PANEL_MIN and 70% of the window. */
  const resizeMidiPanel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = midiPanelHeight;
    let height = startHeight;
    setMidiPanelResizing(true);
    const move = (moveEvent: PointerEvent) => {
      height = Math.round(Math.min(window.innerHeight * 0.7, Math.max(MIDI_PANEL_MIN, startHeight + startY - moveEvent.clientY)));
      setMidiPanelHeight(height);
    };
    const end = () => {
      setMidiPanelResizing(false);
      try { localStorage.setItem(MIDI_PANEL_HEIGHT_KEY, String(height)); } catch { /* It opens at the default height next time. */ }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }, [midiPanelHeight]);
  const [statsOpen, setStatsOpen] = useState(false);
  /** The slot that a random photo is downloading for; the dice on its button spin. */
  const [randomLoading, setRandomLoading] = useState<ImageSlot | null>(null);
  const [paused, setPaused] = useState(false);
  const [revision, setRevision] = useState(0);
  /**
   * The open group of the Effects panel. It lives here, not in the panel,
   * so it stays when the panel hides (full screen, H) and shows again.
   */
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const openGroupRef = useRef(openGroup);
  openGroupRef.current = openGroup;
  const [status, setStatus] = useState<Status | null>(null);
  const [cursorIdle, setCursorIdle] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  /** The keyboard shortcuts sheet (Help, Keyboard Shortcuts, or the "?" key). */
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  /** Whether the panel headings show their "?" help buttons (Help, Hide Help Buttons). */
  const helpButtons = useSyncExternalStore(helpSettings.subscribe, () => helpSettings.get().buttons);
  const [openRequest, setOpenRequest] = useState<OpenRequest | null>(null);
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  /** The slot that the photo search dialog loads into, while it is open. */
  const [searchSlot, setSearchSlot] = useState<ImageSlot | null>(null);
  /** The video being made in the background: its file, progress from 0 to 1, and the controller that stops it. */
  const [videoJob, setVideoJob] = useState<{ path: string; progress: number; controller: AbortController } | null>(null);
  const videoJobRef = useRef(videoJob);
  videoJobRef.current = videoJob;
  /** The open scene file (null until a scene is opened or saved), and whether it has unsaved changes. */
  const [scenePath, setScenePath] = useState<string | null>(null);
  const scenePathRef = useRef<string | null>(null);
  scenePathRef.current = scenePath;
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const savedFingerprintRef = useRef("");
  /**
   * The open scenes, in tab order, and the selected one (null on the start
   * screen). The ref has the latest list at once; the state redraws the tabs.
   */
  const docsRef = useRef<SceneDoc[]>([]);
  const [docs, setDocs] = useState<SceneDoc[]>([]);
  const activeIdRef = useRef<number | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  /** The scenes whose tabs are not selected (see StoredScene). */
  const storedRef = useRef(new Map<number, StoredScene>());
  /**
   * The open playlist file (see playlistFile.ts), or null, and its
   * fingerprint as saved: it has its own unsaved mark, apart from each
   * scene's (a new track, a new tab order, an audio setting).
   */
  const [playlistPath, setPlaylistPath] = useState<string | null>(null);
  const playlistPathRef = useRef<string | null>(null);
  playlistPathRef.current = playlistPath;
  const playlistSavedRef = useRef("");
  const [playlistDirty, setPlaylistDirty] = useState(false);
  /** The scene files in tab order, the tracks and the audio settings: what a playlist file keeps. */
  const playlistScenes = useCallback(() => docsRef.current
    .map((doc) => doc.id === activeIdRef.current ? scenePathRef.current : doc.path)
    .filter((path): path is string => path !== null), []);
  const playlistAudio = useCallback((): PlaylistAudio => {
    const { kind, device, gainDb, thresholdDb } = audioInput.settings;
    return { kind, device, gainDb, thresholdDb };
  }, []);
  const playlistNow = useCallback(() => playlistFingerprint(playlistScenes(), tracks.list.map((track) => track.path), playlistAudio()), [playlistAudio, playlistScenes]);
  const playlistChanged = useCallback(() => playlistPathRef.current !== null && playlistNow() !== playlistSavedRef.current, [playlistNow]);
  /** The playlist as it is now counts as saved. */
  const markPlaylistClean = useCallback((path: string | null) => {
    playlistPathRef.current = path;
    setPlaylistPath(path);
    playlistSavedRef.current = playlistNow();
    setPlaylistDirty(false);
  }, [playlistNow]);
  /** Set below, once savePlaylist exists: asks "Save changes?" for the playlist. */
  const askToSavePlaylistRef = useRef<(title: string, reason: string) => Promise<boolean>>(async () => true);
  /** The selected scene's Undo history; each scene has its own. */
  const historyRef = useRef<SettingsHistory | null>(null);
  const [resetAsked, setResetAsked] = useState(false);
  /**
   * The open "Save changes?" question before an action that replaces the
   * scene (opening a scene, installing an update): its title, the reason,
   * and the answer, true to go on with the action.
   */
  const [saveQuestion, setSaveQuestion] = useState<{
    title: string;
    reason: string;
    answer: (go: boolean) => void;
    /** What has the changes, when it is not the selected scene (the playlist), and how Save saves it. */
    name?: string;
    save?: () => Promise<boolean>;
  } | null>(null);
  const [appVersion, setAppVersion] = useState("");
  const [startupUpdate, setStartupUpdate] = useState<UpdateInfo | null>(null);
  /** The start screen shows until a new scene starts or an image or scene opens. */
  const [startScreen, setStartScreen] = useState(true);

  const showStatus = useCallback((message: string, duration = 2500, action?: Status["action"]) => {
    setStatus({ message, duration, action });
  }, []);

  const showError = useCallback((message: string, action?: Status["action"]) => {
    setStatus({ message, duration: 0, error: true, action });
  }, []);

  useEffect(() => {
    if (!status?.duration) return;
    const id = window.setTimeout(() => setStatus(null), status.duration);
    return () => window.clearTimeout(id);
  }, [status]);

  const setSlotImage = useCallback((slot: ImageSlot, image: SlotImage | null) => {
    const next: [SlotImage | null, SlotImage | null] = [...imagesRef.current];
    next[slot] = image;
    imagesRef.current = next;
    setImages(next);
  }, []);

  /** Sets the selected scene's driver video (or none) in the engine and in the panel. */
  const setDriver = useCallback((driver: DriverVideo | null) => {
    driverRef.current = driver;
    setDriverVideoName(driver?.name ?? null);
    engine?.setDriverVideo(driver?.video ?? null);
  }, [engine]);

  const writeDocs = useCallback((next: SceneDoc[]) => {
    docsRef.current = next;
    setDocs(next);
  }, []);

  const selectDocId = useCallback((id: number | null) => {
    activeIdRef.current = id;
    setActiveId(id);
  }, []);

  /** The selected scene's file: kept in the ref, the state and its tab. */
  const setActivePath = useCallback((path: string | null) => {
    scenePathRef.current = path;
    setScenePath(path);
    writeDocs(docsRef.current.map((doc) => doc.id === activeIdRef.current ? { ...doc, path } : doc));
  }, [writeDocs]);

  /** Adds a tab, with its own Undo history, for the scene that is in the engine now, and selects it. */
  const addDoc = useCallback(() => {
    if (!engine) return;
    const used = new Set(docsRef.current.filter((doc) => doc.path === null).map((doc) => doc.untitled));
    let untitled = 1;
    while (used.has(untitled)) untitled++;
    const id = nextDocId++;
    writeDocs([...docsRef.current, { id, path: null, untitled, dirty: false }]);
    selectDocId(id);
    historyRef.current = new SettingsHistory(engine.params, engine.state);
  }, [engine, selectDocId, writeDocs]);

  const setImage = useCallback((source: ImageSource, { message, blob, videoFile, name, patternId, fromScene }: SetImageOptions = {}, slot: ImageSlot = 0) => {
    if (!engine || sceneGeneration !== sceneGenerationRef.current) return;
    try {
      /**
       * A new second image shows at once: the crossfade goes all the way to
       * image B, with no range. Replacing a second image keeps the settings.
       */
      if (slot === 1 && !imagesRef.current[1] && !fromScene) {
        const blend = engine.params.imageBlend;
        Object.assign(blend, { on: false, value: blend.max });
        setRevision((value) => value + 1);
      }
      engine.setImage(source, slot);
      /* A pattern keeps the image under it; a pattern over a pattern keeps the same image. */
      const previous = imagesRef.current[slot];
      const under = patternId && previous ? (previous.patternId ? previous.under : previous) : undefined;
      const image: SlotImage = { source, blob, videoFile, label: name ?? "Image", thumbnail: makeThumbnail(source), patternId, under, id: nextImageId++ };
      setSlotImage(slot, image);
      /* An image dropped or pasted on the start screen starts a scene in a new tab. */
      if (activeIdRef.current === null) addDoc();
      setStartScreen(false);
      if (message) showStatus(message);
    } catch (error) {
      showError(`Could not use that image or video. ${String(error)}`);
    }
  }, [addDoc, engine, sceneGeneration, setSlotImage, showError, showStatus]);

  const randomImage = useCallback(async (slot: ImageSlot = 0) => {
    showStatus(slot === 0 ? "Loading a random photo…" : "Loading a random photo for source B…", 0);
    setRandomLoading(slot);
    try {
      const loaded = await loadRandomImage();
      setImage(loaded.image, { message: loaded.title, blob: loaded.blob, name: loaded.title }, slot);
    } catch (error) {
      const reason = error instanceof Error && error.message.startsWith("The image service") ? error.message : "Check the internet connection.";
      showError(`Could not load a random photo. ${reason}`, { label: "Retry", run: () => void randomImageRef.current(slot) });
    } finally {
      setRandomLoading(null);
    }
  }, [setImage, showError, showStatus]);
  /** The Retry button calls the latest copy, so it uses the engine as it is now. */
  const randomImageRef = useRef(randomImage);
  randomImageRef.current = randomImage;

  /** Downloads the photo picked in the search dialog, 4K wide. */
  const loadSearchedPhoto = useCallback(async (photo: CommonsPhoto, slot: ImageSlot) => {
    showStatus(`Loading ${photo.label}…`, 0);
    setRandomLoading(slot);
    try {
      const loaded = await loadCommonsPhoto(photo.title);
      setImage(loaded.image, { message: loaded.title, blob: loaded.blob, name: loaded.title }, slot);
    } catch (error) {
      showError(`Could not load the photo. ${error instanceof Error ? error.message : "Check the internet connection."}`);
    } finally {
      setRandomLoading(null);
    }
  }, [setImage, showError, showStatus]);

  const openImage = useCallback((slot: ImageSlot = 0) => {
    if (isTauri()) setOpenRequest({ kind: "image", slot });
  }, []);

  /** Loads the image file picked in the Open dialog. */
  const openImagePath = useCallback(async (path: string, slot: ImageSlot) => {
    try {
      const name = path.split(/[\\/]/).pop();
      if (isVideoPath(path)) {
        showStatus(`Loading ${name}…`, 0);
        const loaded = await loadVideoFile(path);
        setImage(loaded.video, { message: name, videoFile: loaded.videoFile, name }, slot);
        return;
      }
      const loaded = await loadImageFile(path);
      setImage(loaded.image, { message: name, blob: loaded.blob, name }, slot);
    } catch (error) {
      showError(`Could not open the image or video. ${String(error)}`);
    }
  }, [setImage, showError, showStatus]);

  /** Draws a test pattern at 4K. The status shows first, because drawing takes a moment. */
  const loadPattern = useCallback((pattern: Pattern, slot: ImageSlot = 0) => {
    showStatus(`Drawing ${pattern.label.toLowerCase()}…`, 0);
    const options = { message: pattern.label, name: pattern.label, patternId: pattern.id };
    requestAnimationFrame(() => setTimeout(() => setImage(drawPattern(pattern), options, slot), 0));
  }, [setImage, showStatus]);

  const removeSecondImage = useCallback(() => {
    if (!engine) return;
    engine.clearSecondImage();
    setSlotImage(1, null);
  }, [engine, setSlotImage]);

  /** Removes one of two images. When A goes, B moves up to take its place. */
  const removeImage = useCallback((slot: ImageSlot) => {
    const second = imagesRef.current[1];
    if (!engine) return;
    if (slot === 0) {
      if (!imagesRef.current[0] || !second) return;
      engine.setImage(second.source, 0);
      setSlotImage(0, second);
    }
    removeSecondImage();
  }, [engine, removeSecondImage, setSlotImage]);

  /** Takes the pattern off a slot and shows the image that was under it again. */
  const restoreUnderImage = useCallback((slot: ImageSlot) => {
    const image = imagesRef.current[slot]?.under;
    if (!engine || !image) return;
    engine.setImage(image.source, slot);
    setSlotImage(slot, image);
    showStatus(image.label);
  }, [engine, setSlotImage, showStatus]);

  /** Puts the second image first and the first image second. */
  const swapImages = useCallback(() => {
    const [first, second] = imagesRef.current;
    if (!engine || !first || !second) return;
    engine.setImage(second.source, 0);
    engine.setImage(first.source, 1);
    setSlotImage(0, second);
    setSlotImage(1, first);
  }, [engine, setSlotImage]);

  const loadBlob = useCallback(async (blob: Blob | null | undefined, name?: string, slot: ImageSlot = 0) => {
    if (!blob) return;
    try {
      if (isVideoType(blob.type)) setImage(await loadVideoBlob(blob), { message: name || "Video loaded", blob, name: name || "Video" }, slot);
      else if (blob.type.startsWith("image/")) setImage(await loadImageBlob(blob), { message: name || "Image loaded", blob, name: name || "Pasted image" }, slot);
    } catch (error) {
      showError(blob.type.startsWith("video/") ? String(error instanceof Error ? error.message : error) : "Could not read that image.");
    }
  }, [setImage, showError, showStatus]);

  /** A status message with a Show button that opens the saved file's folder. */
  const showSaved = useCallback((path: string, duration: number) => {
    showStatus(`Saved ${fileNameOf(path)}`, duration, {
      label: "Show",
      run: () => void invoke("reveal_file", { path }).catch((error) => showError(String(error)))
    });
  }, [showError, showStatus]);

  /** Captures the picture at once, then asks where to save it. */
  const savePng = useCallback(async () => {
    if (!engine) return;
    const blob = await engine.snapshot();
    if (!blob) {
      showError("Could not capture the picture.");
      return;
    }
    if (!isTauri()) {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "kaleido.png";
      link.click();
      return;
    }
    try {
      const path = await chooseExportPath("png");
      if (!path) return;
      await writeExport(path, blob);
      showSaved(path, 5000);
    } catch (error) {
      showError(`Could not save the PNG. ${String(error)}`);
    }
  }, [engine, showError, showSaved]);

  /** The video size: the picture's shape on the screen, inside 1080p. */
  const exportSize = () => {
    const canvas = canvasRef.current;
    return videoSize(canvas && canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 16 / 9);
  };

  const openVideoDialog = useCallback(() => {
    if (!engine) return;
    if (videoJobRef.current) showStatus("A video is still being made. Stop it or wait for it first.", 4000);
    else setVideoDialogOpen(true);
  }, [engine, showStatus]);

  /**
   * Asks where to save the video, then makes it in the background: frames
   * are rendered off the screen in short slices, so the app stays usable.
   * The video uses the settings as they were when the export started.
   */
  const exportVideo = useCallback(async (options: VideoOptions) => {
    setVideoDialogOpen(false);
    if (!engine || videoJobRef.current) return;
    const title = options.style === "title" ? options.title : "";
    const path = isTauri() ? await chooseExportPath("mp4", title) : "kaleido.mp4";
    if (!path) return;
    const controller = new AbortController();
    const size = exportSize();
    const job = { path, progress: 0, controller };
    setVideoJob(job);
    let shown = 0;
    const progress = (fraction: number) => {
      const percent = Math.floor(fraction * 100);
      if (percent === shown) return;
      shown = percent;
      setVideoJob((current) => current?.controller === controller ? { ...current, progress: fraction } : current);
    };
    try {
      const blob = await encodeVideo(engine, size, options, progress, controller.signal);
      if (isTauri()) {
        await writeExport(path, blob);
        showSaved(path, 8000);
      } else {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = path;
        link.click();
      }
    } catch (error) {
      if (controller.signal.aborted) showStatus("Video export stopped");
      else showError(`Could not make the video. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setVideoJob((current) => current?.controller === controller ? null : current);
    }
  }, [engine, showError, showSaved, showStatus]);

  /** The current scene's fingerprint (see sceneFingerprint). */
  const fingerprint = useCallback(() => {
    if (!engine) return "";
    const [first, second] = imagesRef.current;
    return sceneFingerprint(engine.params, engine.state, [first?.id ?? null, second?.id ?? null, driverRef.current?.id ?? null]);
  }, [engine]);

  /**
   * The open playlist's unsaved changes: its own (a tab, a track, an audio
   * setting) and every scene's, because each scene in a playlist is the
   * playlist's (see savePlaylist).
   */
  const playlistUnsaved = useCallback(() => playlistPathRef.current !== null && (playlistChanged()
    || docsRef.current.some((doc) => doc.id === activeIdRef.current ? fingerprint() !== savedFingerprintRef.current : doc.dirty)), [fingerprint, playlistChanged]);

  /** Read current settings here; the title bar's dirty indicator updates on a timer. */
  const askToSave = useCallback((title: string, reason: string) => new Promise<boolean>((resolve) => {
    if (fingerprint() === savedFingerprintRef.current) resolve(true);
    else setSaveQuestion({ title, reason, answer: resolve });
  }), [fingerprint]);

  /** The scene as it is now counts as saved: the asterisk goes away until the next change. */
  const markClean = useCallback(() => {
    savedFingerprintRef.current = fingerprint();
    dirtyRef.current = false;
    setDirty(false);
  }, [fingerprint]);

  /** About twice a second, compare the scene with its saved state. */
  useEffect(() => {
    if (!engine) return;
    const id = window.setInterval(() => {
      setDirty(fingerprint() !== savedFingerprintRef.current);
      setPlaylistDirty(playlistUnsaved());
    }, 500);
    return () => window.clearInterval(id);
  }, [engine, fingerprint, playlistUnsaved]);

  /**
   * Keeps the selected scene in its tab (see StoredScene), so another scene
   * can use the engine. Its clocks are in its play state, so it comes back
   * at the same frame.
   */
  const stashActive = useCallback(() => {
    const id = activeIdRef.current;
    const history = historyRef.current;
    if (!engine || id === null || !history) return;
    history.commit();
    const dirtyNow = fingerprint() !== savedFingerprintRef.current;
    storedRef.current.set(id, {
      params: structuredClone(engine.params),
      state: structuredClone(engine.state),
      images: imagesRef.current,
      driver: driverRef.current,
      savedFingerprint: savedFingerprintRef.current,
      history,
      openGroup: openGroupRef.current
    });
    writeDocs(docsRef.current.map((doc) => doc.id === id ? { ...doc, dirty: dirtyNow } : doc));
  }, [engine, fingerprint, writeDocs]);

  /**
   * Puts a stored scene back into the engine and selects its tab. MIDI
   * holds and the momentary bypass and solo of the scene before it end,
   * and the trails start again from the still picture.
   */
  const restoreDoc = useCallback((id: number) => {
    const stored = storedRef.current.get(id);
    const doc = docsRef.current.find((candidate) => candidate.id === id);
    if (!engine || !stored || !doc) return;
    storedRef.current.delete(id);
    engine.releaseHolds();
    engine.bypassedGroups.clear();
    engine.bypassedParams.clear();
    engine.soloGroup = null;
    Object.assign(engine.params, stored.params);
    Object.assign(engine.state, stored.state);
    const [first, second] = stored.images;
    if (first) engine.setImage(first.source, 0);
    if (second) engine.setImage(second.source, 1);
    else engine.clearSecondImage();
    setDriver(stored.driver);
    engine.settle();
    engine.resetTrails();
    setSlotImage(0, first);
    setSlotImage(1, second);
    selectDocId(id);
    scenePathRef.current = doc.path;
    setScenePath(doc.path);
    savedFingerprintRef.current = stored.savedFingerprint;
    dirtyRef.current = doc.dirty;
    setDirty(doc.dirty);
    historyRef.current = stored.history;
    setOpenGroup(stored.openGroup);
    setPaused(engine.state.paused);
    setRandomLoading(null);
    setRevision((value) => value + 1);
  }, [engine, selectDocId, setDriver, setSlotImage]);

  /** Selects another tab. A photo still loading for the scene that was shown is dropped. */
  const switchToDoc = useCallback((id: number) => {
    if (id === activeIdRef.current || !storedRef.current.has(id)) return;
    sceneGenerationRef.current++;
    setSceneGeneration(sceneGenerationRef.current);
    stashActive();
    restoreDoc(id);
  }, [restoreDoc, stashActive]);

  /**
   * Selects another tab with a crossfade: the old scene's last frame fades
   * out over the new scene, which plays under it. For the switches the user
   * makes (a tab, Ctrl+Tab, the number keys); a switch to ask "Save
   * changes?" cuts at once.
   */
  const crossfadeToDoc = useCallback(async (id: number) => {
    if (!engine || id === activeIdRef.current || !storedRef.current.has(id)) return;
    await engine.fadeOut(CROSSFADE_SECONDS);
    switchToDoc(id);
  }, [engine, switchToDoc]);

  /** Adds audio files to the tracks. The first files of an empty track list start to play at once. */
  const addTracks = useCallback((paths: string[]) => {
    const wasEmpty = tracks.list.length === 0;
    tracks.add(paths);
    if (wasEmpty && tracks.list.length > 0) tracks.playTrack(0);
  }, []);

  /** Selects the next tab (step 1) or the one before it (step -1); the last tab goes round to the first. */
  const switchByStep = useCallback((step: 1 | -1) => {
    const list = docsRef.current;
    const index = list.findIndex((doc) => doc.id === activeIdRef.current);
    if (index < 0 || list.length < 2) return;
    void crossfadeToDoc(list[(index + step + list.length) % list.length].id);
  }, [crossfadeToDoc]);

  /** True when any open scene, or the open playlist, has changes that are not saved. */
  const anyDirty = useCallback(() => playlistChanged() || docsRef.current.some((doc) => doc.id === activeIdRef.current
    ? fingerprint() !== savedFingerprintRef.current
    : doc.dirty), [fingerprint, playlistChanged]);

  /**
   * Asks "Save changes?" for each scene with unsaved changes, the selected
   * one first, each in its own tab. Returns false when the user cancels.
   */
  const askToSaveAll = useCallback(async (title: string, reason: string) => {
    /* In a playlist the scenes are the playlist's: one question for all of them. */
    if (playlistPathRef.current) return askToSavePlaylistRef.current(title, reason);
    const activeFirst = [...docsRef.current].sort((a, b) => Number(b.id === activeIdRef.current) - Number(a.id === activeIdRef.current));
    for (const doc of activeFirst) {
      if (doc.id !== activeIdRef.current) {
        if (!doc.dirty) continue;
        switchToDoc(doc.id);
      }
      if (!(await askToSave(title, reason))) return false;
    }
    return askToSavePlaylistRef.current(title, reason);
  }, [askToSave, switchToDoc]);

  /**
   * Save writes to the open scene file without asking; Save As (or a scene
   * that was never saved) asks for a file name first. Returns true when the
   * scene was saved.
   */
  const saveScene = useCallback(async (saveAs = false, { copy = false }: { copy?: boolean } = {}): Promise<boolean> => {
    if (!engine || !isTauri()) return false;
    if (!imagesRef.current[0]) {
      showError("There is no source image or video to save in the scene.");
      return false;
    }
    const current = scenePathRef.current;
    const path = !saveAs && !copy && current
      ? current
      : await saveDialog({ defaultPath: copy && current ? fileNameOf(current) : current ?? "Scene.ksage", filters: [{ name: "Kaleido Sage scene", extensions: [SCENE_EXTENSION] }] });
    if (!path) return false;
    if (docsRef.current.some((doc) => doc.id !== activeIdRef.current && samePath(doc.path, path))) {
      showError(`${fileNameOf(path)} is open in another tab. Close that tab first, or save with another name.`);
      return false;
    }
    try {
      /* The fingerprint is taken before the file is written, so a change made while it writes still shows as unsaved. */
      const saved = fingerprint();
      showStatus("Saving scene and embedding media…", 0);
      await writeSceneFile(path, engine.params, engine.state, imagesRef.current, driverRef.current);
      /* A copy (Export Scene As, for a scene in a playlist) leaves the scene as it was: the playlist's. */
      if (!copy) {
        savedFingerprintRef.current = saved;
        setDirty(fingerprint() !== saved);
        setActivePath(path);
      }
      showStatus(`Saved ${fileNameOf(path)}`);
      return true;
    } catch (error) {
      showError(`Could not save the scene. ${String(error)}`);
      return false;
    }
  }, [engine, fingerprint, setActivePath, showError, showStatus]);

  /* A scene opens in a new tab, so the scenes that are open stay as they are. */
  const openScene = useCallback(() => {
    if (!engine || !isTauri()) return;
    setOpenRequest({ kind: "scene", slot: 0 });
  }, [engine]);

  /**
   * Reads the scene picked in the Open dialog into fresh settings first, and
   * uses them only when the file and its image are both good, so a bad file
   * changes nothing. A scene that is already open only selects its tab. The
   * scene opens in a new tab, or in the selected tab when that tab holds an
   * untitled scene with no changes.
   */
  const openScenePath = useCallback(async (path: string) => {
    if (!engine) return;
    const open = docsRef.current.find((doc) => samePath(doc.path, path));
    if (open) {
      switchToDoc(open.id);
      showStatus(`${path.split(/[\\/]/).pop()} is already open`);
      return;
    }
    const generation = sceneGenerationRef.current;
    try {
      const text = await readScene(path);
      const params = createParams();
      const state = createPlayState();
      const images = applyScene(text, params, state);
      const image = await loadSceneMedia(images.image);
      const image2 = images.image2 ? await loadSceneMedia(images.image2) : null;
      const driverMedia = images.driverVideo ? await loadSceneMedia(images.driverVideo.media) : null;
      if (generation !== sceneGenerationRef.current) return;
      const reuse = scenePathRef.current === null && fingerprint() === savedFingerprintRef.current;
      if (activeIdRef.current !== null && !reuse) {
        stashActive();
        addDoc();
        engine.bypassedGroups.clear();
        engine.bypassedParams.clear();
        engine.soloGroup = null;
        engine.settle();
        engine.resetTrails();
        setOpenGroup(null);
      }
      engine.releaseHolds();
      Object.assign(engine.params, params);
      Object.assign(engine.state, state, { paused: engine.state.paused, locks: engine.state.locks });
      const name = path.split(/[\\/]/).pop();
      setImage(image.source, { message: name, blob: image.blob, videoFile: image.videoFile, name });
      if (image2) setImage(image2.source, { blob: image2.blob, videoFile: image2.videoFile, name: `${name} (source B)`, fromScene: true }, 1);
      else removeSecondImage();
      setDriver(driverMedia?.source instanceof HTMLVideoElement && driverMedia.videoFile && images.driverVideo
        ? { video: driverMedia.source, videoFile: driverMedia.videoFile, name: images.driverVideo.name, id: nextImageId++ } : null);
      setRevision((value) => value + 1);
      setActivePath(path);
      markClean();
      historyRef.current?.clear();
    } catch (error) {
      showError(`Could not open the scene. ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [addDoc, engine, fingerprint, markClean, removeSecondImage, setActivePath, setDriver, setImage, showError, showStatus, stashActive, switchToDoc]);

  /** Makes a picked video file the Driver effect's own video. */
  const openDriverVideo = useCallback(async (path: string) => {
    if (!isVideoPath(path)) {
      showError("The driver needs a video file.");
      return;
    }
    const generation = sceneGenerationRef.current;
    try {
      const { video, videoFile } = await loadVideoFile(path);
      if (generation !== sceneGenerationRef.current) {
        video.removeAttribute("src");
        video.load();
        return;
      }
      setDriver({ video, videoFile, name: path.split(/[\\/]/).pop() ?? "Video", id: nextImageId++ });
      showStatus(`Driver video: ${path.split(/[\\/]/).pop()}`);
    } catch (error) {
      showError(`Could not open the video. ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [setDriver, showError, showStatus]);

  const randomize = useCallback(() => {
    if (!engine) return;
    randomizeParams(engine.params, engine.state);
    setRevision((value) => value + 1);
    showStatus("New random settings");
  }, [engine, showStatus]);

  /** A group's dice: new random settings for that group only. */
  const randomizeOneGroup = useCallback((group: GroupKey) => {
    if (!engine) return;
    randomizeGroup(engine.params, engine.state, group);
    setRevision((value) => value + 1);
  }, [engine]);

  /** Nudge: every unlocked value moves a little, up or down at random. */
  const nudge = useCallback(() => {
    if (!engine) return;
    nudgeParams(engine.params, engine.state);
    setRevision((value) => value + 1);
    showStatus("Nudged every unlocked setting");
  }, [engine, showStatus]);

  const reset = useCallback(() => {
    if (!engine) return;
    resetEffects(engine.params, engine.state);
    setRevision((value) => value + 1);
    setOpenGroup(null);
    showStatus("Every effect is off");
  }, [engine, showStatus]);

  /**
   * Undo and redo for the settings. A change counts as a step when it is
   * complete: about four times a second, but never while a mouse button is
   * down or a MIDI knob turns, so a whole slider drag or knob turn is one step.
   * Each tab has its own history (see addDoc); this commits the selected one.
   */
  useEffect(() => {
    if (!engine) return;
    let pointerDown = false;
    const down = () => { pointerDown = true; };
    const up = () => { pointerDown = false; };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    window.addEventListener("blur", up);
    const id = window.setInterval(() => { if (!pointerDown && !midi.turning) historyRef.current?.commit(); }, 250);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      window.removeEventListener("blur", up);
    };
  }, [engine]);

  /** MIDI knobs move the engine's sliders; learn mode tells which knob it mapped. */
  useEffect(() => {
    if (!engine) return;
    return midi.attach(engine, (device, control, keys) => {
      const [channel, number] = control.split(":");
      showStatus(`${device}: control ${number} (channel ${channel}) now moves ${keys.map((key) => engine.params[key].label).join(", ")}`, 4000);
    });
  }, [engine, showStatus]);

  const undo = useCallback(() => {
    if (historyRef.current?.undo()) setRevision((value) => value + 1);
    else showStatus("Nothing to undo");
  }, [showStatus]);

  const redo = useCallback(() => {
    if (historyRef.current?.redo()) setRevision((value) => value + 1);
    else showStatus("Nothing to redo");
  }, [showStatus]);

  /**
   * While the tracks are the input, they run the show (see docs/AUDIO.md,
   * part 7): Play and Pause start and stop the music and the animation
   * together, Stop also goes back to the start of the track, and each new
   * track crossfades to the next scene tab.
   */
  const tracksActive = useSyncExternalStore((listener) => audioInput.subscribe(listener), () => audioInput.settings.kind === "tracks");
  const tracksPlaying = useSyncExternalStore((listener) => tracks.subscribe(listener), () => tracks.playing);
  /* The animation follows the music, also after a scene tab change (which brings that scene's own pause back). */
  useEffect(() => {
    if (!engine || !tracksActive) return;
    engine.state.paused = !tracksPlaying;
    setPaused(!tracksPlaying);
  }, [activeId, engine, tracksActive, tracksPlaying]);
  const crossfadeRef = useRef(crossfadeToDoc);
  crossfadeRef.current = crossfadeToDoc;
  useEffect(() => tracks.onTrackChange((index) => {
    if (audioInput.settings.kind !== "tracks") return;
    const list = docsRef.current;
    if (list.length > 1) void crossfadeRef.current(list[index % list.length].id);
  }), []);

  const stop = useCallback(() => {
    if (!engine) return;
    if (tracksActive) tracks.stop();
    engine.rewind();
    setPaused(true);
    showStatus(tracksActive ? "Stopped: the file and every range are at their start" : "Stopped: every range is at its start");
  }, [engine, tracksActive, showStatus]);

  const togglePause = useCallback(() => {
    if (!engine) return;
    if (tracksActive) {
      tracks.toggle();
      return;
    }
    engine.state.paused = !engine.state.paused;
    setPaused(engine.state.paused);
  }, [engine, tracksActive]);

  const toggleFullscreen = useCallback(async () => {
    if (isTauri()) {
      const appWindow = getCurrentWindow();
      await appWindow.setFullscreen(!(await appWindow.isFullscreen()));
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    if (isTauri()) await getCurrentWindow().setFullscreen(false);
    else if (document.fullscreenElement) await document.exitFullscreen();
  }, []);

  /** Puts a new, untitled scene in the engine: the large checkerboard, with every effect off. */
  const blankScene = useCallback(() => {
    if (!engine) return;
    const pattern = PATTERNS.find((candidate) => candidate.id === "checker-large") ?? PATTERNS[0];
    const source = drawPattern(pattern);
    engine.bypassedGroups.clear();
    engine.bypassedParams.clear();
    engine.soloGroup = null;
    engine.releaseHolds();
    Object.assign(engine.params, createParams());
    Object.assign(engine.state, createPlayState());
    resetEffects(engine.params, engine.state);
    engine.setImage(source);
    engine.clearSecondImage();
    setDriver(null);
    engine.settle();
    engine.resetTrails();
    setSlotImage(0, { source, label: pattern.label, thumbnail: makeThumbnail(source), patternId: pattern.id, id: nextImageId++ });
    setSlotImage(1, null);
    scenePathRef.current = null;
    setScenePath(null);
    setPaused(false);
    setOpenGroup(null);
    setRandomLoading(null);
    setRevision(value => value + 1);
    markClean();
  }, [engine, markClean, setDriver, setSlotImage]);

  /** Starts a new, untitled scene in a new tab. The scene that was shown stays in its own tab. */
  const newScene = useCallback(() => {
    if (!engine) return;
    sceneGenerationRef.current++;
    setSceneGeneration(sceneGenerationRef.current);
    stashActive();
    blankScene();
    addDoc();
    setStartScreen(false);
  }, [addDoc, blankScene, engine, stashActive]);


  /**
   * Closes the selected scene's tab, after Save or Don't save for unsaved
   * changes. The tab next to it is then selected; after the last tab, the
   * start screen shows.
   */
  const closingSceneRef = useRef(false);
  const closeScene = useCallback(async () => {
    if (!engine || startScreen || closingSceneRef.current) return;
    closingSceneRef.current = true;
    try {
      const closing = activeIdRef.current;
      const rest = docsRef.current.filter((doc) => doc.id !== closing);
      const reason = rest.length ? "Closing the scene closes its tab." : "Closing returns to the start screen.";
      /* A scene in a playlist closes without a question: the playlist (Save Playlist) keeps it as it was saved. */
      if (!playlistPathRef.current && !(await askToSave("Save changes before closing the scene?", reason))) return;
      sceneGenerationRef.current++;
      setSceneGeneration(sceneGenerationRef.current);
      if (rest.length) {
        const index = docsRef.current.findIndex((doc) => doc.id === closing);
        writeDocs(rest);
        restoreDoc(rest[Math.min(Math.max(index, 0), rest.length - 1)].id);
        return;
      }
      if (fullscreen) await exitFullscreen();
      engine.stop();
      blankScene();
      writeDocs([]);
      selectDocId(null);
      historyRef.current = null;
      setStatus(null);
      setStartScreen(true);
    } catch (error) {
      showError(`Could not close the scene. ${String(error)}`);
    } finally {
      closingSceneRef.current = false;
    }
  }, [askToSave, blankScene, engine, exitFullscreen, fullscreen, restoreDoc, selectDocId, showError, startScreen, writeDocs]);

  /**
   * Save Playlist: writes the playlist file (see playlistFile.ts) with a
   * copy of each scene file, in tab order, and of each track, so the file
   * can move to another PC. Each scene goes in as its file: a scene that
   * was never saved is saved first (an empty new scene is left out), and
   * for unsaved changes the user picks Save or Don't save. Save As (or a
   * playlist never saved) asks for a file name first. Returns true when
   * the playlist was saved.
   */
  const savePlaylist = useCallback(async (saveAs = false): Promise<boolean> => {
    if (!engine || !isTauri()) return false;
    const current = playlistPathRef.current;
    const path = !saveAs && current
      ? current
      : await saveDialog({ defaultPath: current ?? `Playlist.${PLAYLIST_EXTENSION}`, filters: [{ name: "Kaleido Sage playlist", extensions: [PLAYLIST_EXTENSION] }] });
    if (!path) return false;
    try {
      showStatus("Saving the playlist and its scenes and audio files…", 0);
      /**
       * Each scene goes in as it is now, from the engine or from its tab's
       * stored copy. Its own file on disk never changes: a scene that is
       * not yet the playlist's copy gets one first, and from then on it is
       * the playlist's (Ctrl+S saves the playlist). An empty new scene is
       * left out.
       */
      const scenes: string[] = [];
      let activeScene = 0;
      for (const doc of [...docsRef.current]) {
        const active = doc.id === activeIdRef.current;
        const stored = active ? null : storedRef.current.get(doc.id);
        const docPath = active ? scenePathRef.current : doc.path;
        const docDirty = active ? fingerprint() !== savedFingerprintRef.current : doc.dirty;
        if (docPath === null && !docDirty) continue;
        if (active) activeScene = scenes.length;
        if (isPlaylistCopy(docPath) && !docDirty) {
          scenes.push(docPath!);
          continue;
        }
        const name = docPath ? fileNameOf(docPath) : `${docFileName(null, doc.untitled)}.${SCENE_EXTENSION}`;
        const target = isPlaylistCopy(docPath) ? docPath! : await invoke<string>("playlist_scene_path", { name });
        if (active) {
          const saved = fingerprint();
          await writeSceneFile(target, engine.params, engine.state, imagesRef.current, driverRef.current);
          savedFingerprintRef.current = saved;
          setDirty(fingerprint() !== saved);
          setActivePath(target);
        } else if (stored) {
          await writeSceneFile(target, stored.params, stored.state, stored.images, stored.driver);
          stored.savedFingerprint = sceneFingerprint(stored.params, stored.state, [stored.images[0]?.id ?? null, stored.images[1]?.id ?? null, stored.driver?.id ?? null]);
          writeDocs(docsRef.current.map((candidate) => candidate.id === doc.id ? { ...candidate, path: target, dirty: false } : candidate));
        }
        scenes.push(target);
      }
      await savePlaylistFile(path, { audio: playlistAudio(), activeScene }, scenes, tracks.list.map((track) => track.path));
    } catch (error) {
      showError(`Could not save the playlist. ${String(error)}`);
      return false;
    }
    markPlaylistClean(path);
    showStatus(`Saved ${fileNameOf(path)}`);
    return true;
  }, [engine, fingerprint, markPlaylistClean, playlistAudio, setActivePath, showError, showStatus, writeDocs]);

  askToSavePlaylistRef.current = (title: string, reason: string) => new Promise<boolean>((resolve) => {
    const path = playlistPathRef.current;
    if (!path || !playlistUnsaved()) resolve(true);
    else setSaveQuestion({ title, reason, answer: resolve, name: fileNameOf(path), save: () => savePlaylist() });
  });

  /* Opening a playlist closes the open scenes, so their changes, and the playlist's, are saved or given up first. */
  const openPlaylist = useCallback(async () => {
    if (!engine || !isTauri()) return;
    if (!(await askToSaveAll("Save changes before opening a playlist?", "Opening a playlist closes the open scenes."))) return;
    setOpenRequest({ kind: "playlist", slot: 0 });
  }, [askToSaveAll, engine]);

  /**
   * Opens the playlist picked in the Open dialog: the open scenes close
   * (their changes were asked about), then the playlist's scenes open in
   * its tab order, its tracks come in stopped at the first one, and its
   * audio settings apply. The tab that was selected at its save shows.
   */
  const openPlaylistPath = useCallback(async (path: string) => {
    if (!engine) return;
    const name = fileNameOf(path);
    try {
      showStatus(`Opening ${name}…`, 0);
      const opened = await openPlaylistFile(path);
      const manifest = readManifest(opened.manifest);
      tracks.pause();
      writeDocs([]);
      storedRef.current.clear();
      selectDocId(null);
      historyRef.current = null;
      blankScene();
      for (const scene of opened.scenes) await openScenePath(scene);
      tracks.replace(opened.tracks);
      await audioInput.applySettings(manifest.audio);
      const target = docsRef.current[Math.min(manifest.activeScene, docsRef.current.length - 1)];
      if (target) switchToDoc(target.id);
      else setStartScreen(true);
      markPlaylistClean(path);
      /* The Audio panel shows the playlist's tracks and audio settings. */
      setBottomTab("audio");
      setMidiPanelOpen(true);
      showStatus(`Opened ${name}`);
    } catch (error) {
      showError(`Could not open the playlist. ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [blankScene, engine, markPlaylistClean, openScenePath, selectDocId, showError, showStatus, switchToDoc, writeDocs]);

  /** Closes any tab. A tab with unsaved changes is selected first, so its "Save changes?" question shows over it. */
  const closeTab = useCallback((id: number) => {
    if (id !== activeIdRef.current) {
      const doc = docsRef.current.find((candidate) => candidate.id === id);
      if (!doc) return;
      if (!doc.dirty) {
        storedRef.current.delete(id);
        writeDocs(docsRef.current.filter((candidate) => candidate.id !== id));
        return;
      }
      switchToDoc(id);
    }
    void closeScene();
  }, [closeScene, switchToDoc, writeDocs]);

  /**
   * Start the engine with a placeholder pattern, then load a random photo.
   * The engine is made only once and kept in a ref. Effects run again on a
   * dev hot update (and twice in dev at start-up); a new engine there would
   * have fresh settings while the panels still show the old ones, so ranges
   * would look on and nothing would move.
   */
  const engineRef = useRef<Engine | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let created = engineRef.current;
    if (!created) {
      try {
        created = new Engine(canvas);
      } catch (error) {
        setFatalError(String(error instanceof Error ? error.message : error));
        return;
      }
      engineRef.current = created;
      /* The app starts on the large checkerboard, with every effect off. */
      const pattern = PATTERNS.find((candidate) => candidate.id === "checker-large") ?? PATTERNS[0];
      const source = drawPattern(pattern);
      created.setImage(source);
      resetEffects(created.params, created.state);
      const image: SlotImage = { source, label: pattern.label, thumbnail: makeThumbnail(source), patternId: pattern.id, id: nextImageId++ };
      setSlotImage(0, image);
    }
    const running = created;
    running.start();
    setEngine(running);
    /* Dev only: the engine can be looked at from the developer console. */
    if (import.meta.env.DEV) (window as unknown as { kaleidoEngine?: Engine }).kaleidoEngine = running;
    return () => running.stop();
  }, []);

  /**
   * The app starts on a test pattern; it does not load a photo.
   * The start-up scene has nothing to save, so it starts without an
   * asterisk. Only once: effects also run again on a dev hot update.
   */
  const startedRef = useRef(false);
  useEffect(() => {
    if (!engine || startedRef.current) return;
    startedRef.current = true;
    markClean();
  }, [engine]);

  /** The engine's audio links follow the running sound source; with none, they have no effect. */
  useEffect(() => {
    if (!engine) return;
    const follow = () => { engine.audio = audioInput.analyzer; };
    follow();
    return audioInput.subscribe(follow);
  }, [engine]);

  /** Once the engine runs (or failed to start), the main window replaces the splash. */
  useEffect(() => {
    if (engine || fatalError) void revealMainWindow();
  }, [engine, fatalError]);

  /**
   * While the Open dialog is open, the picture behind it holds still, so the
   * dialog's live scene preview gets the GPU. It also holds still under the
   * start screen, where nobody can see it, and under the Export Video dialog.
   */
  const holdStill = openRequest !== null || startScreen || videoDialogOpen;
  useEffect(() => {
    if (!engine || !holdStill) return;
    engine.stop();
    return () => engine.start();
  }, [holdStill, engine]);

  /**
   * Closing the window with unsaved changes asks first (Save, Don't save,
   * Cancel), once for each scene with changes. In a plain browser, the
   * browser's own question shows instead. The listener is added once, so it
   * calls the latest copies through refs.
   */
  const anyDirtyRef = useRef(anyDirty);
  anyDirtyRef.current = anyDirty;
  const askToSaveAllRef = useRef(askToSaveAll);
  askToSaveAllRef.current = askToSaveAll;
  useEffect(() => {
    if (!isTauri()) {
      const onBeforeUnload = (event: BeforeUnloadEvent) => { if (anyDirtyRef.current()) event.preventDefault(); };
      window.addEventListener("beforeunload", onBeforeUnload);
      return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }
    const unlisten = getCurrentWindow().onCloseRequested((event) => {
      if (!anyDirtyRef.current()) return;
      event.preventDefault();
      void askToSaveAllRef.current("Save changes before closing?", "Kaleido Sage closes after this.").then((go) => {
        if (go) void getCurrentWindow().destroy();
      });
    });
    return () => { void unlisten.then((stop) => stop()); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!isTauri()) return;
    getAppVersion().then((version) => { if (!cancelled) setAppVersion(version); }).catch(() => {});
    checkForUpdate().then((info) => { if (!cancelled && info) setStartupUpdate(info); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  /** Follow the window's full-screen state, whatever changed it. */
  useEffect(() => {
    if (!isTauri()) {
      const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
      document.addEventListener("fullscreenchange", onChange);
      return () => document.removeEventListener("fullscreenchange", onChange);
    }
    const appWindow = getCurrentWindow();
    let stop: (() => void) | undefined;
    void appWindow.isFullscreen().then(setFullscreen);
    void appWindow
      .onResized(() => void appWindow.isFullscreen().then(setFullscreen))
      .then((unlisten) => { stop = unlisten; });
    return () => stop?.();
  }, []);

  /** Full screen shows only the picture; leaving it brings the panel back. */
  useEffect(() => { setPanelOpen(!fullscreen); }, [fullscreen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (aboutOpen || shortcutsOpen || openRequest || videoDialogOpen || searchSlot !== null || event.altKey || event.metaKey) return;
      /* "?" opens the keyboard shortcuts sheet, also on the start screen, but not while typing in a text field. */
      if (event.key === "?" && !(event.target instanceof HTMLInputElement && event.target.type === "text")) {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      /* The start screen takes only Ctrl+O and Ctrl+N; the other keys act on a scene that is not shown yet. */
      if (startScreen) {
        const startAction = event.ctrlKey ? { o: openScene, n: newScene }[event.key.toLowerCase()] : undefined;
        if (startAction) {
          event.preventDefault();
          startAction();
        }
        return;
      }
      if (event.ctrlKey) {
        const key = event.key.toLowerCase();
        const target = event.target as HTMLElement | null;
        /* Text fields keep their own undo. */
        const typing = target instanceof HTMLInputElement && target.type === "text";
        const historyAction = { z: event.shiftKey ? redo : undo, y: redo }[key];
        if (historyAction && !typing) {
          event.preventDefault();
          historyAction();
          return;
        }
        /* Ctrl+Tab and Ctrl+Page Down select the next tab; Ctrl+Shift+Tab and Ctrl+Page Up the one before. */
        const tabStep = key === "tab" ? (event.shiftKey ? -1 : 1) : key === "pagedown" ? 1 : key === "pageup" ? -1 : 0;
        if (tabStep) {
          event.preventDefault();
          switchByStep(tabStep);
          return;
        }
        /* In a playlist, Ctrl+S saves the playlist (its scenes are the playlist's), and Ctrl+Shift+S exports the scene as a copy. */
        const save = () => playlistPathRef.current ? (event.shiftKey ? saveScene(false, { copy: true }) : savePlaylist()) : saveScene(event.shiftKey);
        const sceneAction = { s: save, o: openScene, n: newScene, w: closeScene }[key];
        if (sceneAction) {
          event.preventDefault();
          void sceneAction();
        }
        return;
      }
      const target = event.target as HTMLElement | null;
      /* Menus and text fields keep their own keys. */
      if (target?.tagName === "SELECT" || (target instanceof HTMLInputElement && target.type === "text")) return;
      const key = event.key.toLowerCase();
      /* The number keys 1 to 9 select the tab with that number, with a crossfade. */
      if (/^[1-9]$/.test(key)) {
        const doc = docsRef.current[Number(key) - 1];
        if (!doc) return;
        event.preventDefault();
        void crossfadeToDoc(doc.id);
        return;
      }
      const run: Record<string, () => void> = {
        f: () => void toggleFullscreen(),
        f11: () => void toggleFullscreen(),
        /* Esc plays the ranges that MIDI stopped; with none stopped, it leaves full screen. */
        escape: () => {
          if (engine?.anyHeld) engine.resumeAll();
          else void exitFullscreen();
        },
        h: () => setPanelOpen((open) => !open),
        m: toggleMidiPanel,
        a: toggleAudioPanel,
        p: () => setStatsOpen((open) => !open),
        " ": event.shiftKey ? stop : togglePause,
        o: () => void openImage(),
        x: randomize,
        n: nudge,
        s: () => void savePng()
      };
      const action = run[key];
      if (!action) return;
      event.preventDefault();
      /* A focused button or checkbox would also react to Space. */
      if (key === " ") (document.activeElement as HTMLElement | null)?.blur();
      action();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [aboutOpen, shortcutsOpen, closeScene, crossfadeToDoc, engine, exitFullscreen, newScene, nudge, openImage, openRequest, videoDialogOpen, searchSlot, openScene, randomize, redo, savePng, saveScene, startScreen, stop, switchByStep, toggleAudioPanel, toggleFullscreen, toggleMidiPanel, togglePause, undo]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const item = [...(event.clipboardData?.items ?? [])].find((entry) => entry.type.startsWith("image/"));
      if (item) void loadBlob(item.getAsFile(), "Pasted image");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loadBlob]);

  /** Hide the cursor over the picture after a short time without mouse movement. */
  useEffect(() => {
    let id = 0;
    const onMove = () => {
      setCursorIdle(false);
      window.clearTimeout(id);
      id = window.setTimeout(() => setCursorIdle(true), CURSOR_IDLE_MS);
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.clearTimeout(id);
    };
  }, []);

  const menus: Menu[] = [
    {
      id: "file",
      label: "File",
      items: [
        { label: "New Scene", icon: <Plus size={15} />, shortcut: "Ctrl+N", run: newScene },
        { label: "Open Image or Video…", icon: <ColorFolder size={18} />, shortcut: "O", run: () => void openImage() },
        { label: "Open Scene…", icon: <FilmSlate size={15} />, shortcut: "Ctrl+O", run: () => void openScene() },
        { label: "Open Playlist…", icon: <MusicNotes size={15} />, run: () => void openPlaylist() },
        "separator",
        /* In a playlist, a scene is the playlist's: Save Scene gives way to Export Scene As, which writes a copy. */
        ...(playlistPath
          ? [{ label: "Export Scene As…", disabled: startScreen, icon: <FloppyDisk size={15} />, shortcut: "Ctrl+Shift+S", run: () => void saveScene(false, { copy: true }) }]
          : [
            { label: "Save Scene", disabled: startScreen, icon: <FloppyDisk size={15} />, shortcut: "Ctrl+S", run: () => void saveScene() },
            { label: "Save Scene As…", icon: <FloppyDisk size={15} />, shortcut: "Ctrl+Shift+S", run: () => void saveScene(true) }
          ]),
        { label: "Save Playlist", icon: <MusicNotes size={15} />, shortcut: playlistPath ? "Ctrl+S" : undefined, run: () => void savePlaylist() },
        { label: "Save Playlist As…", icon: <MusicNotes size={15} />, run: () => void savePlaylist(true) },
        { label: "Save PNG", disabled: startScreen, icon: <Camera size={15} />, shortcut: "S", run: () => void savePng() },
        { label: "Export Video…", icon: <FilmStrip size={15} />, run: openVideoDialog },
        "separator",
        { label: "Close Scene", icon: <X size={15} />, shortcut: "Ctrl+W", disabled: startScreen, run: () => void closeScene() },
        "separator",
        { label: "Exit", icon: <SignOut size={15} />, shortcut: "Alt+F4", run: () => void (isTauri() ? getCurrentWindow().close() : window.close()) }
      ]
    },
    {
      id: "edit",
      label: "Edit",
      items: [
        { label: "Undo", disabled: startScreen, icon: <ArrowCounterClockwise size={15} />, shortcut: "Ctrl+Z", run: undo },
        { label: "Redo", disabled: startScreen, icon: <ArrowClockwise size={15} />, shortcut: "Ctrl+Y", run: redo }
      ]
    },
    {
      id: "view",
      label: "View",
      items: [
        { label: panelOpen ? "Hide Settings" : "Show Settings", icon: <SlidersHorizontal size={15} />, shortcut: "H", run: () => setPanelOpen((open) => !open) },
        { label: statsOpen ? "Hide Performance" : "Show Performance", icon: <Gauge size={15} />, shortcut: "P", run: () => setStatsOpen((open) => !open) },
        { label: midiPanelOpen && bottomTab === "audio" ? "Hide Audio Panel" : "Show Audio Panel", icon: <SpeakerSimpleHigh size={16} />, shortcut: "A", disabled: startScreen, run: toggleAudioPanel },
        { label: midiPanelOpen && bottomTab === "midi" ? "Hide MIDI Panel" : "Show MIDI Panel", icon: <MidiIcon size={15} />, shortcut: "M", disabled: startScreen, run: toggleMidiPanel },
        "separator",
        { label: "Full Screen", icon: <ArrowsOut size={15} />, shortcut: "F", run: () => void toggleFullscreen() }
      ]
    },
    {
      id: "help",
      label: "Help",
      items: [
        { label: "Keyboard Shortcuts", icon: <Keyboard size={15} />, shortcut: "?", run: () => setShortcutsOpen(true) },
        { label: helpButtons ? "Hide Help Buttons" : "Show Help Buttons", icon: <Question size={15} />, run: () => helpSettings.set({ buttons: !helpButtons }) },
        "separator",
        { label: "About Kaleido Sage", icon: <Info size={15} />, run: () => setAboutOpen(true) }
      ]
    }
  ];

  /** A tab's label: the scene file's name, or "Untitled Scene", with a number after the first. */
  const docFileName = (path: string | null, untitled: number) =>
    path?.split(/[\\/]/).pop() ?? (untitled > 1 ? `Untitled Scene ${untitled}` : "Untitled Scene");
  const tabs: DocumentTabInfo[] = docs.map((doc) => doc.id === activeId
    ? { id: doc.id, fileName: docFileName(scenePath, doc.untitled), path: scenePath, dirty }
    : { id: doc.id, fileName: docFileName(doc.path, doc.untitled), path: doc.path, dirty: doc.dirty });
  const sceneFileName = tabs.find((tab) => tab.id === activeId)?.fileName ?? "Untitled Scene";

  return (
    <div
      className={`app ${fullscreen ? "fullscreen" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => { if (!event.relatedTarget) setDragging(false); }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        /* A drop on the second image's card loads the second image. */
        const slot = (event.target as Element).closest?.("[data-image-slot='1']") ? 1 : 0;
        void loadBlob(file, file?.name, slot);
      }}
    >
      {!fullscreen && (
        <>
          <TitleBar
            updateAvailable={Boolean(startupUpdate)}
            onAbout={() => setAboutOpen(true)}
            fileName={startScreen ? null : sceneFileName}
            dirty={dirty}
            playlistName={playlistPath ? fileNameOf(playlistPath) : null}
            playlistDirty={playlistDirty}
          />
          <MenuBar menus={menus} />
        </>
      )}
      <div className="workspace">
        {startScreen && <StartScreen onNewScene={newScene} onOpenScene={openScene} onOpenPlaylist={() => void openPlaylist()} />}
        {/* The left panel: the Source section, then the Designer (the effects). */}
        {engine && !startScreen && panelOpen && (
          <ControlPanel
            /* A change outside the panel (Randomize, Undo, a new scene) makes a new panel, so all of its state reloads. */
            key={`controls-${revision}`}
            engine={engine}
            openGroup={openGroup}
            onOpenGroup={setOpenGroup}
            onRandomize={randomize}
            onNudge={nudge}
            onReset={() => setResetAsked(true)}
            onRandomizeGroup={randomizeOneGroup}
            hasVideo={images.some((image) => image?.source instanceof HTMLVideoElement)}
            driverVideoName={driverVideoName}
            onPickDriverVideo={() => setOpenRequest({ kind: "image", slot: 0, target: "driver" })}
            source={(
              <SourcePanel
                engine={engine}
                images={images}
                randomLoading={randomLoading}
                onOpenImage={(slot) => void openImage(slot)}
                onRandomImage={(slot) => void randomImage(slot)}
                onSearchImage={setSearchSlot}
                onPatternImage={loadPattern}
                onRemoveImage={removeImage}
                onSwapImages={swapImages}
                onRestoreImage={restoreUnderImage}
              />
            )}
          />
        )}
        {/* The picture under its document tab; full screen hides the tab. */}
        <div className="document">
          {!fullscreen && !startScreen && <DocumentTabs tabs={tabs} activeId={activeId} onSelect={(id) => void crossfadeToDoc(id)} onClose={closeTab} />}
          <main className={`stage ${cursorIdle ? "cursor-idle" : ""}`}>
            <canvas ref={canvasRef} onDoubleClick={() => void toggleFullscreen()} />
            {engine && statsOpen && <StatsOverlay engine={engine} />}
            {engine && !startScreen && !fullscreen && (
              <StageControls
                paused={paused}
                onTogglePause={togglePause}
                onStop={stop}
                onFullscreen={() => void toggleFullscreen()}
                tracks={tracksActive}
              />
            )}
            {fullscreen && (
              /* In full screen the title bar and toolbar are gone; these buttons show while the mouse moves. */
              <div className={`fullscreen-controls ${cursorIdle && !panelOpen ? "hidden" : ""}`}>
                <button
                  className={panelOpen ? "active" : ""}
                  onClick={() => setPanelOpen((open) => !open)}
                  data-tip="Settings (H)"
                  aria-label="Settings"
                  aria-pressed={panelOpen}
                >
                  <SlidersHorizontal size={18} />
                </button>
                <button onClick={() => void exitFullscreen()} data-tip="Exit full screen (Esc)" aria-label="Exit full screen">
                  <ArrowsIn size={18} />
                </button>
              </div>
            )}
            {fatalError && <div className="fatal-error selectable">{fatalError}</div>}
            {status && (
              <div className={`status-toast ${status.error ? "error" : ""}`} role={status.error ? "alert" : "status"}>
                <span className={status.error ? "selectable" : undefined}>{status.message}</span>
                {status.action && <button onClick={status.action.run}>{status.action.label}</button>}
                {status.error && (
                  <button className="status-close" onClick={() => setStatus(null)} aria-label="Close" data-tip="Close">
                    <X size={13} weight="bold" />
                  </button>
                )}
              </div>
            )}
            {videoJob && (
              <div className="export-job" role="status">
                <span className="export-job-label">Making {fileNameOf(videoJob.path)}… {Math.floor(videoJob.progress * 100)}%</span>
                <span className="export-job-bar"><i style={{ width: `${videoJob.progress * 100}%` }} /></span>
                <button onClick={() => videoJob.controller.abort()}>Stop</button>
              </div>
            )}
            {dragging && <div className="drop-overlay">Drop the image or video here</div>}
          </main>
        </div>
      </div>
      {/* The MIDI panel slides up at the bottom of the window, under the panels and the picture, which get shorter to make room. */}
      {engine && !startScreen && panelOpen && (
        <div
          className={`midi-panel ${midiPanelOpen ? "open" : ""} ${midiPanelResizing ? "resizing" : ""}`}
          style={{ height: midiPanelOpen ? midiPanelHeight : 0 }}
          inert={!midiPanelOpen}
        >
          <div className="midi-panel-grip" onPointerDown={resizeMidiPanel} data-tip="Drag to make the MIDI panel taller or shorter" />
          <div className="midi-panel-body">
            <BottomPanelTabs tab={bottomTab} onTab={setBottomTab} onClose={closeBottomPanel} />
            {bottomTab === "midi" ? <MidiPanel engine={engine} open={midiPanelOpen} /> : <AudioPanel engine={engine} sceneName={sceneFileName} onAddTracks={() => setOpenRequest({ kind: "audio", slot: 0 })} />}
          </div>
        </div>
      )}
      {/* The help line: the tip of the control under the mouse, always in view under the panels (not in full screen, not with the settings hidden). */}
      {!fullscreen && !startScreen && panelOpen && <HelpLine />}
      {resetAsked && (
        <ConfirmDialog
          title="Clear all effects?"
          message="Every effect leaves the list, its controls go back to no effect, and every range turns off. Locked groups stay as they are."
          confirmLabel="Clear"
          onConfirm={() => {
            setResetAsked(false);
            reset();
          }}
          onCancel={() => setResetAsked(false)}
        />
      )}
      {openRequest && (
        <OpenDialog
          kind={openRequest.kind}
          title={openRequest.target === "driver" ? "Open Video for the Driver" : openRequest.kind === "scene" ? "Open Scene" : openRequest.kind === "playlist" ? "Open Playlist" : openRequest.kind === "audio" ? "Add Audio Files" : openRequest.slot === 1 ? "Open Image or Video for Source B" : "Open Image or Video"}
          onCancel={() => setOpenRequest(null)}
          onOpen={(path) => {
            setOpenRequest(null);
            if (openRequest.target === "driver") void openDriverVideo(path);
            else if (openRequest.kind === "scene") void openScenePath(path);
            else if (openRequest.kind === "audio") addTracks([path]);
            else if (openRequest.kind === "playlist") void openPlaylistPath(path);
            else void openImagePath(path, openRequest.slot);
          }}
          /* Several scenes open one after the other, each in its own tab; the last one shows. Several audio files go to the tracks. */
          onOpenMany={openRequest.kind === "scene" ? (paths) => {
            setOpenRequest(null);
            void (async () => { for (const path of paths) await openScenePath(path); })();
          } : openRequest.kind === "audio" ? (paths) => {
            setOpenRequest(null);
            addTracks(paths);
          } : undefined}
        />
      )}
      {searchSlot !== null && (
        <ImageSearchDialog
          letter={searchSlot === 0 ? "A" : "B"}
          onCancel={() => setSearchSlot(null)}
          onPick={(photo) => {
            setSearchSlot(null);
            void loadSearchedPhoto(photo, searchSlot);
          }}
        />
      )}
      {videoDialogOpen && engine && (
        <ExportVideoDialog
          engine={engine}
          size={exportSize()}
          onCancel={() => setVideoDialogOpen(false)}
          onExport={(options) => void exportVideo(options)}
        />
      )}
      {shortcutsOpen && <ShortcutsDialog onClose={closeShortcuts} />}
      {aboutOpen && (
        <AboutDialog
          version={appVersion}
          initialUpdateInfo={startupUpdate}
          onClose={() => setAboutOpen(false)}
          beforeInstall={() => askToSaveAll("Save changes before updating?", "Kaleido Sage closes to install the update.")}
        />
      )}
      {/* After the About dialog, so this question shows over it. */}
      {saveQuestion && (
        <ConfirmDialog
          title={saveQuestion.title}
          message={`${saveQuestion.name ?? sceneFileName} has changes that are not saved. ${saveQuestion.reason}`}
          confirmLabel="Save"
          otherLabel="Don't save"
          onConfirm={() => {
            const { answer, save } = saveQuestion;
            setSaveQuestion(null);
            void (save ?? (() => saveScene()))().then(answer);
          }}
          onOther={() => {
            saveQuestion.answer(true);
            setSaveQuestion(null);
          }}
          onCancel={() => {
            saveQuestion.answer(false);
            setSaveQuestion(null);
          }}
        />
      )}
    </div>
  );
}
