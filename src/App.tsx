import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openFileDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { ArrowClockwise, ArrowCounterClockwise, ArrowsIn, ArrowsOut, Camera, Export, FilePlus, FilmStrip, FloppyDisk, FolderOpen, Gauge, HandPointing, Info, Playlist, Keyboard, Plus, SignOut, SlidersHorizontal, SpeakerSimpleHigh, Trash, VirtualReality, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { AboutDialog } from "./components/AboutDialog";
import { ShortcutsDialog } from "./components/ShortcutsDialog";
import { HelpLine } from "./components/HelpLine";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ControlPanel } from "./components/ControlPanel";
import { ExportVideoDialog } from "./components/ExportVideoDialog";
import { ImageSearchDialog } from "./components/ImageSearchDialog";
import { MidiIcon } from "./components/MidiIcon";
import { MidiPanel } from "./components/MidiPanel";
import { AudioPanel } from "./components/AudioPanel";
import { BottomPanelTabs, type BottomTab } from "./components/BottomPanelTabs";
import { SongMapPanel, type SongTip } from "./components/SongMapPanel";
import { PointerTip } from "./components/PointerTip";
import { SceneTransport, SourcePanel } from "./components/SourcePanel";
import { StartScreen } from "./components/StartScreen";
import { LoadingOverlay, type Loading } from "./components/LoadingOverlay";
import { SceneList } from "./components/SceneList";
import { FilesCard } from "./components/FilesCard";
import { AudioInputMenu } from "./components/AudioInputMenu";
import { MenuBar, type Menu } from "./components/MenuBar";
import { OpenDialog, type OpenKind } from "./components/OpenDialog";
import { StatsOverlay } from "./components/StatsOverlay";
import { TitleBar } from "./components/TitleBar";
import type { TerrainData } from "./engine/terrain";
import { DocumentTabs, type DocumentTabInfo } from "./components/DocumentTabs";
import { StageControls } from "./components/StageControls";
import { Engine } from "./engine/engine";
import { vrAvailable, watchVr } from "./engine/vr";
import { createParams, createPlayState, nudgeParams, randomizeGroup, randomizeParams, resetEffects, type GroupKey, type Params, type PlayState } from "./engine/params";
import { SettingsHistory } from "./engine/history";
import { scenePosition } from "./engine/loop";
import { SCENE_EXTENSION, applyScene, blobToSceneImage, sceneFingerprint, serializeScene, type SceneImage } from "./engine/scene";
import { loadSceneMedia, loadSceneSource, readScene, writeScene } from "./lib/scenes";
import { terrainFromScene, terrainToScene } from "./lib/terrain";
import { adoptImage, keepAnalyses, keepImage, keepScenes, keepTerrain, keptAnalysisText, keptImageBytes, keptTerrain, readKept, type Kept, type KeptImage } from "./lib/reloadKeeper";
import type { ImageSource } from "./engine/renderer";
import {
  makeThumbnail,
  loadImageBlob,
  loadCommonsPhoto,
  loadImageFile,
  loadRandomImage,
  type CommonsPhoto
} from "./lib/images";
import { chooseExportPath, fileNameOf, openExportFile, writeExport } from "./lib/exports";
import { PATTERNS, drawPattern, type Pattern } from "./lib/patterns";
import { midi } from "./lib/midi";
import { audioInput, type InputKind } from "./lib/audioInput";
import { panelLayout } from "./lib/panelLayout";
import { tracks } from "./lib/tracks";
import { songFollow } from "./lib/songFollow";
import { settingButtons } from "./lib/settingButtons";
import { sliceAt, type ScheduledSlice } from "./engine/showSchedule";
import { mapOf, planSong } from "./engine/songPlan";
import { fillScenes } from "./engine/songMapEdits";
import { helpSettings } from "./lib/helpSettings";
import { RANGE_ON_EVENT } from "./lib/pointerEvents";
import { FILE_EXTENSION, fileFingerprint, isFileCopy, matchingScenes, openKaleidoFile, readManifest, saveKaleidoFile, type FileAudio } from "./lib/kaleidoFile";
import { revealMainWindow } from "./lib/splash";
import { isVideoPath, isVideoType, loadVideoBlob, loadVideoFile, stageVideoBlob, type VideoFile } from "./lib/videos";
import { checkForUpdate, getAppVersion, type UpdateInfo } from "./lib/updater";
import { encodeVideo, videoDimensions, videoSize, type VideoOptions } from "./lib/videoExport";
import { attachCameraDrag } from "./lib/cameraDrag";

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
  /** Work that takes a while (a save): a spinner shows before the message. */
  busy?: boolean;
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
  /** The Image or Video effect's image or video (its label is the file name), or null. */
  picture: SlotImage | null;
  /** The camera's real terrain (see docs/TERRAIN.md), or null. */
  terrain?: TerrainData | null;
  savedFingerprint: string;
  history: SettingsHistory;
  openGroup: string | null;
}

let nextDocId = 1;

/** Dev only: each stored tab's scene text for the reload keeper, made once per stored scene (see reloadKeeper.ts). */
const keptText = new WeakMap<StoredScene, string>();
/* A stand-in for the scene text only: the kept images are stored apart (see KeptImage). */
const KEPT_IMAGE: SceneImage = { type: "image/png", data: "kept" };
/** True while the kept tabs open after a reload; keeping waits, so the empty start-up state does not replace them. */
let restoringKept = false;

/**
 * Songs added to the open project (see addTracks) whose song map is not
 * filled yet. Once a song's analysis is done, Auto Fill picks a scene for
 * each of its slices (see fillAddedSongs), so a new show has a first map to
 * edit. Songs that come with an opened project keep their maps.
 */
const songsToFill = new Set<string>();

/**
 * Fills the song map of each added song whose analysis is done (see
 * songsToFill), as Auto Fill does, with two or more scenes. Its first slice
 * gets the scene after the last pick of the song before it in the list, so
 * the scenes go on through the show and do not start again at each song.
 */
function fillAddedSongs(sceneCount: number) {
  for (const path of [...songsToFill]) {
    const analysis = songFollow.analysisFor(path);
    if (!analysis) continue;
    songsToFill.delete(path);
    const index = tracks.list.findIndex((track) => track.path === path);
    if (sceneCount < 2 || index < 0 || analysis.mapEdits) continue;
    const before = tracks.list.slice(0, index).reverse()
      .map((track) => songFollow.analysisFor(track.path)?.mapEdits?.at(-1)?.scene)
      .find((scene) => scene !== undefined);
    songFollow.editMap(path, fillScenes(mapOf(planSong(analysis)), before === undefined ? 0 : (before + 1) % sceneCount, sceneCount));
  }
}

/** Windows file names do not care about case. */
const samePath = (a: string | null, b: string | null) => a !== null && b !== null && a.toLowerCase() === b.toLowerCase();


/** One image slot as a scene file keeps it: a video by its stream (embedded when the file is written), anything else as image bytes. */
async function sceneMedia(image: Pick<SlotImage, "source" | "blob" | "videoFile">): Promise<SceneImage> {
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
async function writeSceneFile(path: string, params: Params, state: PlayState, [first, second]: [SlotImage | null, SlotImage | null], driver: DriverVideo | null, picture: SlotImage | null, terrain: TerrainData | null) {
  if (!first) throw new Error("There is no source image or video to save in the scene.");
  const scene = JSON.parse(serializeScene(params, state, { image: { type: "image/png", data: "pending" } }));
  scene.image = await sceneMedia(first);
  if (second) scene.image2 = await sceneMedia(second);
  /**
   * The driver video is embedded like a source video (see scene_archive.rs),
   * but only while the scene uses it: the Driver effect is in the list,
   * with Video as its driver. A video the scene no longer uses would only
   * make the file large (an unused 1.2 GB video once made a 1.2 GB scene).
   */
  const usesDriverVideo = state.fxOrder.includes("driver") && state.driverSource === 5;
  if (driver && usesDriverVideo) scene.driverVideo = { type: driver.videoFile.mime, video: driver.videoFile.id, name: driver.name };
  /* The overlay's image or video goes in the same way: only while the Image or Video effect is in the list. */
  if (picture && state.fxOrder.includes("picture")) scene.picture = { ...(await sceneMedia(picture)), name: picture.label };
  /* Real terrain's land and picture go in while Terrain is in the list and uses them (Real terrain heights or Terrain picture colors). */
  if (terrain && state.fxOrder.includes("terrain") && (state.cameraHeightSource === 2 || state.cameraColors === 2)) scene.terrain = await terrainToScene(terrain);
  await writeScene(path, JSON.stringify(scene));
}

/** The open Open dialog: what it opens, and for an image, which slot gets it. */
interface OpenRequest {
  kind: OpenKind;
  slot: ImageSlot;
  /** "driver": the picked video becomes the Driver effect's own video. "picture": the picked image or video becomes the Image or Video effect's. "import": the picked projects' scenes go into the open project. */
  target?: "driver" | "picture" | "import";
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
  /** The Image or Video effect's image or video for the selected scene (the ref at once, the name for the panel). */
  const pictureRef = useRef<SlotImage | null>(null);
  const [pictureName, setPictureName] = useState<string | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  /** Loads started by a closed scene must not reopen it when they finish. */
  const sceneGenerationRef = useRef(0);
  const [sceneGeneration, setSceneGeneration] = useState(0);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  /* The Playlist column can be collapsed on its own (see FilesCard); View > Hide Playlist does it too. */
  const filesCollapsed = useSyncExternalStore(panelLayout.subscribe, () => panelLayout.filesCollapsed);
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
  /** True while the play toolbar shows its tip at the Input menu (see onNeedAudioInput). */
  const [inputTip, setInputTip] = useState(false);
  const askForAudioInput = useCallback(() => setInputTip(true), []);
  /**
   * A pick of an input with sound (a PC output, a microphone, a line input or
   * Files) turns the settings' audio buttons on. A live input also shows a
   * tip at the FX audio button that tells what it does, and a tip at the
   * next step (see ControlPanel), while no setting of the scene is linked to
   * the sound yet. Files shows only one tip, at the Playlist's Add File(s)
   * button, while the list is empty: the FX tips come later.
   */
  const [linksTip, setLinksTip] = useState(false);
  const [nextTip, setNextTip] = useState(false);
  const [filesTip, setFilesTip] = useState(false);
  const endLinksTip = useCallback(() => setLinksTip(false), []);
  const endNextTip = useCallback(() => setNextTip(false), []);
  const endFilesTip = useCallback(() => setFilesTip(false), []);
  const [songTip, setSongTip] = useState<SongTip>(null);
  /**
   * The first scene (New Scene with no scene open) shows an overview tip at
   * the right of each card of the left panel: Scene, FX and Play. Each has
   * its own close button; a press anywhere in the left panel closes all
   * three. The cards are looked up in each frame (see PointerTip): the
   * panel is made again often.
   */
  type PanelTips = { scene: boolean; fx: boolean; play: boolean };
  const NO_PANEL_TIPS: PanelTips = { scene: false, fx: false, play: false };
  const ALL_PANEL_TIPS: PanelTips = { scene: true, fx: true, play: true };
  const [panelTips, setPanelTips] = useState<PanelTips>(NO_PANEL_TIPS);
  const anyPanelTip = panelTips.scene || panelTips.fx || panelTips.play;
  /** The welcome card in the middle of the picture: with the first scene of a run, it offers to turn the pointers off. */
  const [welcome, setWelcome] = useState(false);
  const welcomeShownRef = useRef(false);
  const sceneCard = useMemo(() => ({ get current() { return document.querySelector<HTMLElement>(".control-panel .source-section > .panel-header-bar"); } }), []);
  const fxCard = useMemo(() => ({ get current() { return document.querySelector<HTMLElement>(".control-panel .fx-card > .panel-header-bar"); } }), []);
  /* The Play card has no header: its tip points at the card's first row. */
  const playCard = useMemo(() => ({ get current() { return document.querySelector<HTMLElement>(".control-panel .scene-transport > :first-child"); } }), []);
  const playOutline = useMemo(() => ({ get current() { return document.querySelector<HTMLElement>(".control-panel .scene-transport"); } }), []);
  /* The whole cards, for the green line round each (the tips point at the cards' headers). */
  const sceneOutline = useMemo(() => ({ get current() { return document.querySelector<HTMLElement>(".control-panel .source-section"); } }), []);
  const fxOutline = useMemo(() => ({ get current() { return document.querySelector<HTMLElement>(".control-panel .fx-card"); } }), []);
  useEffect(() => {
    if (!anyPanelTip) return;
    const onPress = (event: PointerEvent) => {
      if ((event.target as Element).closest?.(".control-panel")) setPanelTips(NO_PANEL_TIPS);
    };
    window.addEventListener("pointerdown", onPress, true);
    return () => window.removeEventListener("pointerdown", onPress, true);
  }, [anyPanelTip]);
  /**
   * Each first effect that "+ New" adds to an empty list shows the effect
   * tip at the right of its header (until Help, Disable Pointers). It stays
   * until its close button, also while the effect is closed. Then the range
   * tip shows at the first range button of the open effect: while no effect
   * is open, it waits out of sight (see PointerTip), and shows when one
   * opens. Its close button, or a press in the FX card while it shows,
   * ends it.
   */
  const [effectTip, setEffectTip] = useState<"effect" | "range" | null>(null);
  /** True once the ranged slider tip (below) has shown since the last first effect: each first effect lets it show again. */
  const rangedTipShownRef = useRef(false);
  const firstEffect = useCallback(() => {
    rangedTipShownRef.current = false;
    setEffectTip("effect");
  }, []);
  const nextEffectTip = useCallback(() => setEffectTip((tip) => (tip === "effect" ? "range" : null)), []);
  const effectHeader = useMemo(() => ({
    get current() {
      return document.querySelector<HTMLElement>(".fx-card .panel-group.open .panel-group-header")
        ?? document.querySelector<HTMLElement>(".fx-card .panel-group .panel-group-header");
    }
  }), []);
  const firstRangeButton = useMemo(() => ({ get current() { return document.querySelector<HTMLElement>(".fx-card .panel-group.open .panel-drift"); } }), []);
  /* The name of that range button's setting: the setting tip sits above it, its arrow down to the name. */
  const firstRangeName = useMemo(() => ({
    get current() { return firstRangeButton.current?.closest(".panel-row")?.querySelector<HTMLElement>(".panel-row-name") ?? null; }
  }), [firstRangeButton]);
  useEffect(() => {
    if (effectTip !== "range") return;
    const onPress = (event: PointerEvent) => {
      if (firstRangeButton.current && (event.target as Element).closest?.(".fx-card")) setEffectTip(null);
    };
    window.addEventListener("pointerdown", onPress, true);
    return () => window.removeEventListener("pointerdown", onPress, true);
  }, [effectTip, firstRangeButton]);
  /**
   * The first range that the user turns on after a first effect (a click
   * on a setting's [] button, see useParamRows) shows the ranged slider tip at
   * the right of that setting. The setting is found by its range button's
   * name, as the panel is made again often; the tip hides while the range
   * is off or the effect is closed. Its close button, or a press in the FX
   * card outside that setting, ends it.
   */
  const [rangedTip, setRangedTip] = useState<string | null>(null);
  useEffect(() => {
    const onRangeOn = (event: Event) => {
      const label = (event.target as Element).getAttribute("aria-label");
      if (rangedTipShownRef.current || !label) return;
      rangedTipShownRef.current = true;
      setRangedTip(label);
      /* The effect's tips give way: they would push the ranged slider tip out of its place. */
      setEffectTip(null);
      setPanelTips(NO_PANEL_TIPS);
    };
    window.addEventListener(RANGE_ON_EVENT, onRangeOn);
    return () => window.removeEventListener(RANGE_ON_EVENT, onRangeOn);
  }, []);
  const rangedRow = useMemo(() => ({
    get current() {
      if (!rangedTip) return null;
      const button = document.querySelector<HTMLElement>(`.fx-card .panel-group.open .panel-drift[aria-label="${CSS.escape(rangedTip)}"]`);
      return button?.getAttribute("aria-pressed") === "true" ? button.closest<HTMLElement>(".panel-row") : null;
    }
  }), [rangedTip]);
  useEffect(() => {
    if (!rangedTip) return;
    const onPress = (event: PointerEvent) => {
      const target = event.target as Element;
      if (target.closest?.(".fx-card") && !rangedRow.current?.contains(target)) setRangedTip(null);
    };
    window.addEventListener("pointerdown", onPress, true);
    return () => window.removeEventListener("pointerdown", onPress, true);
  }, [rangedTip, rangedRow]);
  const pickInput = useCallback((kind: InputKind, switched: boolean) => {
    setFilesTip(kind === "tracks" && tracks.list.length === 0);
    if (kind !== "tracks") setSongTip(null);
    /* A switch to Files turns Song follow on: the picture follows the songs. */
    if (kind === "tracks" && switched) songFollow.setEnabled(true);
    /* With Nothing, the audio buttons have no sound to follow, so they hide. */
    settingButtons.set("audio", kind !== "none");
    const fxTips = kind !== "none" && kind !== "tracks" && Boolean(engine) && engine!.soundLinks().length === 0;
    setLinksTip(fxTips);
    setNextTip(fxTips);
  }, [engine]);
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
  /** A long open (a playlist, several scenes) in progress: the overlay over the work area (see LoadingOverlay). */
  const [loading, setLoading] = useState<Loading | null>(null);
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
  /** Whether the pointer tips show (Help, Enable or Disable Pointers). */
  const pointersOn = useSyncExternalStore(helpSettings.subscribe, () => helpSettings.get().pointers);
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
   * The open Kaleido Sage file (see kaleidoFile.ts), or null while it was
   * never saved, and its fingerprint as saved. Every open scene is the
   * file's (see docs/ONE-FILE.md). The file has one unsaved mark: its own
   * changes (a new track, a new tab order, an audio setting) and each
   * scene's.
   */
  const [filePath, setFilePath] = useState<string | null>(null);
  const filePathRef = useRef<string | null>(null);
  filePathRef.current = filePath;
  const fileSavedRef = useRef("");
  const [fileDirty, setFileDirty] = useState(false);
  /** The scene files in tab order, the tracks and the audio settings: what a Kaleido Sage file keeps. */
  const fileScenes = useCallback(() => docsRef.current
    .map((doc) => doc.id === activeIdRef.current ? scenePathRef.current : doc.path)
    .filter((path): path is string => path !== null), []);
  const fileAudio = useCallback((): FileAudio => {
    const { kind, device, gainDb, thresholdDb } = audioInput.settings;
    return { kind, device, gainDb, thresholdDb };
  }, []);
  /**
   * A new song analysis, an edit of a song map, or Song follow turned on or
   * off is a change too: Save keeps it (see songFollow.ts). The tracks count
   * only while Files is the input, as Save keeps them only then.
   */
  const fileNow = useCallback(() => {
    const paths = audioInput.settings.kind === "tracks" ? tracks.list.map((track) => track.path) : [];
    return `${fileFingerprint(fileScenes(), paths, fileAudio(), panelLayout.filesWidth)} ${songFollow.analyzedCount(paths)} ${songFollow.edits} ${songFollow.enabled}`;
  }, [fileAudio, fileScenes]);
  const fileChanged = useCallback(() => docsRef.current.length > 0 && fileNow() !== fileSavedRef.current, [fileNow]);
  /** The file as it is now counts as saved, at "path" (null for a file that was never saved). */
  const markFileClean = useCallback((path: string | null) => {
    filePathRef.current = path;
    setFilePath(path);
    fileSavedRef.current = fileNow();
    setFileDirty(false);
  }, [fileNow]);
  /** Set below, once saveFile exists: asks "Save changes?" for the file. */
  const askToSaveFileRef = useRef<(reason: string) => Promise<boolean>>(async () => true);
  /** The selected scene's Undo history; each scene has its own. */
  const historyRef = useRef<SettingsHistory | null>(null);
  const [resetAsked, setResetAsked] = useState(false);
  /**
   * The open "Save changes?" question before an action that replaces the
   * file (opening a show, installing an update): the reason, the answer
   * (true to go on with the action), the file's name, and how Save saves it.
   */
  const [saveQuestion, setSaveQuestion] = useState<{
    reason: string;
    answer: (go: boolean) => void;
    name: string;
    save: () => Promise<boolean>;
  } | null>(null);
  /**
   * The open "Replace scenes?" question of Import Scene(s): the imported
   * scenes' names that the project has too, and the answer.
   */
  const [importQuestion, setImportQuestion] = useState<{ names: string[]; answer: (choice: "replace" | "both" | "cancel") => void } | null>(null);
  const [appVersion, setAppVersion] = useState("");
  const [startupUpdate, setStartupUpdate] = useState<UpdateInfo | null>(null);
  /** The start screen shows until a new scene starts or an image or scene opens. */
  const [startScreen, setStartScreen] = useState(true);

  const showStatus = useCallback((message: string, duration = 2500, action?: Status["action"], busy = false) => {
    setStatus({ message, duration, action, busy });
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

  /** Sets the selected scene's overlay image or video (or none) in the engine and in the panel. */
  const setPicture = useCallback((picture: SlotImage | null) => {
    pictureRef.current = picture;
    setPictureName(picture?.label ?? null);
    engine?.setPicture(picture?.source ?? null);
  }, [engine]);

  /** "replaced": scenes that took the place of others (old id to new id), so their song map picks go to the new scene. */
  const writeDocs = useCallback((next: SceneDoc[], replaced?: ReadonlyMap<number, number>) => {
    const before = docsRef.current;
    docsRef.current = next;
    setDocs(next);
    /* A scene that moved or closed: the song map slices that picked it follow it, or go back to the show's order (see songFollow.moveScenes). */
    const place = new Map(next.map((doc, index) => [doc.id, index]));
    const placeOf = (doc: SceneDoc | undefined) => doc ? place.get(replaced?.get(doc.id) ?? doc.id) : undefined;
    if (before.some((doc, index) => placeOf(doc) !== index)) songFollow.moveScenes((index) => placeOf(before[index]) ?? null);
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
    /* Above every open tab's id: a dev hot update of this file starts nextDocId at 1 again while the tabs stay, and two tabs with one id break the tab bar. */
    const id = Math.max(nextDocId, ...docsRef.current.map((doc) => doc.id + 1));
    nextDocId = id + 1;
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

  /** The picture's shape on the screen (width over height). */
  const screenAspect = () => {
    const canvas = canvasRef.current;
    return canvas && canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 16 / 9;
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
    /* Headset players also know a 360 video by "_360" at the end of its name. */
    const sphere = options.size === "sphere";
    const path = isTauri() ? await chooseExportPath("mp4", title, sphere ? "_360" : "") : "kaleido.mp4";
    if (!path) return;
    const controller = new AbortController();
    const size = videoDimensions(options.size, screenAspect());
    const job = { path, progress: 0, controller };
    setVideoJob(job);
    let shown = 0;
    const progress = (fraction: number) => {
      const percent = Math.floor(fraction * 100);
      if (percent === shown) return;
      shown = percent;
      setVideoJob((current) => current?.controller === controller ? { ...current, progress: fraction } : current);
    };
    /* In the app the video goes to its file while it is made (see openExportFile); a stopped or failed export removes the file. */
    const file = isTauri() ? await openExportFile(path, sphere).catch((error: unknown) => {
      showError(`Could not make the video. ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }) : null;
    if (isTauri() && !file) {
      setVideoJob((current) => current?.controller === controller ? null : current);
      return;
    }
    try {
      const blob = await encodeVideo(engine, size, options, progress, controller.signal, file);
      if (file) {
        await file.finish();
        showSaved(path, 8000);
      } else if (blob) {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = path;
        link.click();
      }
    } catch (error) {
      await file?.discard();
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
    return sceneFingerprint(engine.params, engine.state, [first?.id ?? null, second?.id ?? null, driverRef.current?.id ?? null, pictureRef.current?.id ?? null, engine.terrain?.id ?? null]);
  }, [engine]);

  /**
   * Hold (Files only, see the watch of the user's changes below): while it
   * is on, a Length end or a new track does not take the shown scene away.
   * A click on Hold, a save, or a tab click turns it off; the scene
   * then plays to the end of its Length. While the picture follows a song,
   * Hold keeps the scene and loops the slice that plays in the music;
   * while the music plays, the scene still follows the song's plan, so it
   * looks as it does in the show, and with the music paused it runs on its
   * own clock, so it can be edited.
   */
  const [sceneHeld, setSceneHeld] = useState(false);
  const sceneHeldRef = useRef(false);
  const holdScene = useCallback((held: boolean) => {
    sceneHeldRef.current = held;
    setSceneHeld(held);
  }, []);

  /**
   * The open file's unsaved changes: its own (a tab, a track, an audio
   * setting) and every scene's, because each scene is the file's (see
   * saveFile).
   */
  const fileUnsaved = useCallback(() => fileChanged()
    || docsRef.current.some((doc) => doc.id === activeIdRef.current ? fingerprint() !== savedFingerprintRef.current : doc.dirty), [fingerprint, fileChanged]);

  /** The scene as it is now counts as saved: the asterisk goes away until the next change. */
  const markClean = useCallback(() => {
    savedFingerprintRef.current = fingerprint();
    dirtyRef.current = false;
    setDirty(false);
    holdScene(false);
  }, [fingerprint, holdScene]);

  /** About twice a second, compare the scene with its saved state. */
  useEffect(() => {
    if (!engine) return;
    const id = window.setInterval(() => {
      setDirty(fingerprint() !== savedFingerprintRef.current);
      setFileDirty(fileUnsaved());
    }, 500);
    return () => window.clearInterval(id);
  }, [engine, fingerprint, fileUnsaved]);

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
      picture: pictureRef.current,
      terrain: engine.terrain,
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
    setPicture(stored.picture);
    engine?.setTerrain(stored.terrain ?? null);
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
    /* Each scene opens its own last open group again; while the picture follows the songs, it comes in with its groups closed. */
    setOpenGroup(songFollow.enabled && audioInput.settings.kind === "tracks" ? null : stored.openGroup);
    setPaused(engine.state.paused);
    setRandomLoading(null);
    setRevision((value) => value + 1);
  }, [engine, selectDocId, setDriver, setPicture, setSlotImage]);

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
   * changes?", or any switch while paused, cuts at once. Only the latest request switches: a tab click
   * during an automatic switch (a loop end or a new track, see below) wins.
   * "auto" is true for those automatic switches. The new scene always
   * starts from 0, so it plays its whole Length.
   */
  const switchRequestRef = useRef(0);
  /** How a scene last came into view through a tab switch: picked by the user or not, and the scene's play clock then. */
  const sceneShownRef = useRef<{ id: number | null; byUser: boolean; clock: number }>({ id: null, byUser: false, clock: 0 });
  const crossfadeToDoc = useCallback(async (id: number, auto = false, fade = CROSSFADE_SECONDS) => {
    const request = ++switchRequestRef.current;
    if (!engine || (id !== activeIdRef.current && !storedRef.current.has(id))) return;
    if (!auto) holdScene(false);
    /* A click on the shown scene's own tab keeps it, as a pick of the user. */
    if (id !== activeIdRef.current) {
      /* While the picture stands still (paused, or waiting for stopped music) the new scene shows at once, with no fade. */
      if (!engine.still) await engine.fadeOut(fade);
      if (request !== switchRequestRef.current) return;
      /**
       * The new scene starts from 0, as Stop puts it (see Engine.rewind), and plays or stays paused as the scene before it did.
       * While the picture follows the song, it starts where the song is instead (see Engine.followAgain).
       */
      const paused = engine.state.paused;
      switchToDoc(id);
      if (engine.script) engine.followAgain();
      else engine.rewind();
      engine.state.paused = paused;
      setPaused(paused);
    }
    sceneShownRef.current = { id, byUser: !auto, clock: engine.state.clock };
  }, [engine, holdScene, switchToDoc]);

  /** Adds audio files to the tracks, stopped: the first file of an empty list becomes the current track, and its analysis and the Song Map's tips (see SongTip) start. */
  const addTracks = useCallback((paths: string[]) => {
    const wasEmpty = tracks.list.length === 0;
    const known = new Set(tracks.list.map((track) => track.path));
    tracks.add(paths);
    /* Each song that is new in the list gets its song map filled once its analysis is done (see fillAddedSongs). */
    for (const track of tracks.list) if (!known.has(track.path)) songsToFill.add(track.path);
    if (wasEmpty && tracks.list.length > 0) setSongTip("analyzing");
  }, []);

  /**
   * Add File(s) in the Audio panel: the Windows file dialog, a window of its
   * own that can move off the app, so the track list stays in view. The
   * same file types as AUDIO_EXTENSIONS in files.rs.
   */
  const pickTracks = useCallback(async () => {
    if (!isTauri()) return;
    const picked = await openFileDialog({
      title: "Add Audio Files",
      multiple: true,
      filters: [{ name: "Audio files", extensions: ["mp3", "wav", "flac", "ogg", "opus", "m4a", "aac"] }]
    });
    if (picked) addTracks(Array.isArray(picked) ? picked : [picked]);
  }, [addTracks]);

  /**
   * Starts the show from its beginning: the first scene, from its start,
   * set to play (it waits for the music, see the music gate), with Hold
   * off. For a playlist that opens, and for Stop in the playlist. With Song
   * follow on, the first scene is the one that the show's schedule gives
   * the start of the track (see showSchedule.ts).
   */
  const startShow = useCallback(() => {
    const scheduled = songFollow.enabled ? songFollow.schedule(docsRef.current.length)[tracks.index]?.[0]?.scene ?? 0 : 0;
    const first = docsRef.current[scheduled] ?? docsRef.current[0];
    if (!engine || !first) return;
    if (first.id !== activeIdRef.current) switchToDoc(first.id);
    engine.rewind();
    engine.state.paused = false;
    setPaused(false);
    holdScene(false);
  }, [engine, holdScene, switchToDoc]);

  /** Selects the next tab (step 1) or the one before it (step -1); the last tab goes round to the first. "fade": the crossfade's seconds (0 cuts). */
  const switchByStep = useCallback((step: 1 | -1, auto = false, fade = CROSSFADE_SECONDS) => {
    const list = docsRef.current;
    const index = list.findIndex((doc) => doc.id === activeIdRef.current);
    if (index < 0 || list.length < 2) return;
    void crossfadeToDoc(list[(index + step + list.length) % list.length].id, auto, fade);
  }, [crossfadeToDoc]);

  /** True when the open file has changes that are not saved (see fileUnsaved). */
  const anyDirty = fileUnsaved;

  /** Asks "Save changes?" once, for the open file and all of its scenes. Returns false when the user cancels. */
  const askToSaveAll = useCallback((reason: string) => askToSaveFileRef.current(reason), []);

  /**
   * Export Scene: writes the selected scene to a Kaleido Sage file of its
   * own, with no tracks. The scene stays the open file's, as it was; a scene
   * that had no name yet takes the exported file's name.
   * Returns true when the file was written.
   */
  const exportScene = useCallback(async (): Promise<boolean> => {
    if (!engine || !isTauri()) return false;
    if (!imagesRef.current[0]) {
      showError("There is no source image or video to save in the scene.");
      return false;
    }
    const current = scenePathRef.current;
    const name = current ? fileNameOf(current) : `${docFileName(null, docsRef.current.find((doc) => doc.id === activeIdRef.current)?.untitled ?? 1)}.${FILE_EXTENSION}`;
    const path = await saveDialog({ defaultPath: name, filters: [{ name: "Kaleido Sage project", extensions: [FILE_EXTENSION] }] });
    if (!path) return false;
    if (samePath(path, filePathRef.current)) {
      showError(`${fileNameOf(path)} is the open project. Export the scene with another name.`);
      return false;
    }
    try {
      showStatus("Exporting the scene and embedding media…", 0, undefined, true);
      const copy = await invoke<string>("scene_copy_path", { name: fileNameOf(path) });
      await writeSceneFile(copy, engine.params, engine.state, imagesRef.current, driverRef.current, pictureRef.current, engine.terrain);
      /* A scene alone has no tracks, so Files as the input would open with an empty list: it keeps no input then. */
      const audio = fileAudio();
      await saveKaleidoFile(path, { audio: audio.kind === "tracks" ? { ...audio, kind: "none" } : audio, activeScene: 0 }, [copy], []);
      /* A scene that had no name yet takes the exported file's name: its copy is the one just written. */
      if (scenePathRef.current === null) setActivePath(copy);
      showSaved(path, 5000);
      return true;
    } catch (error) {
      showError(`Could not export the scene. ${String(error)}`);
      return false;
    }
  }, [engine, fileAudio, setActivePath, showError, showSaved, showStatus]);

  /* Open Project: the Open dialog, for a project in place of the open one (see openProject). */
  const openFile = useCallback(() => {
    if (!engine || !isTauri()) return;
    setOpenRequest({ kind: "scene", slot: 0 });
  }, [engine]);

  /* Import Scene(s): the Open dialog, for projects whose scenes go into the open project (see importScenes). */
  const openImport = useCallback(() => {
    if (!engine || !isTauri() || docsRef.current.length === 0) return;
    setOpenRequest({ kind: "scene", slot: 0, target: "import" });
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
      const pictureMedia = images.picture ? await loadSceneMedia(images.picture.media) : null;
      /* Broken terrain data leaves the scene with no land loaded; the rest still opens. */
      const terrain = images.terrain ? await terrainFromScene(images.terrain).catch(() => null) : null;
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
      engine.setTerrain(terrain);
      setPicture(pictureMedia && images.picture ? { ...pictureMedia, label: images.picture.name, thumbnail: makeThumbnail(pictureMedia.source), id: nextImageId++ } : null);
      setRevision((value) => value + 1);
      setActivePath(path);
      markClean();
      historyRef.current?.clear();
    } catch (error) {
      showError(`Could not open the scene. ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [addDoc, engine, fingerprint, markClean, removeSecondImage, setActivePath, setDriver, setImage, setPicture, showError, showStatus, stashActive, switchToDoc]);

  /** Makes a picked image or video the Image or Video effect's own (see setPicture). */
  const openPicturePath = useCallback(async (path: string) => {
    const generation = sceneGenerationRef.current;
    const name = path.split(/[\\/]/).pop() ?? "Image or Video";
    try {
      const loaded = isVideoPath(path)
        ? await loadVideoFile(path).then(({ video, videoFile }) => ({ source: video as ImageSource, videoFile }))
        : await loadImageFile(path).then(({ image, blob }) => ({ source: image as ImageSource, blob }));
      if (generation !== sceneGenerationRef.current) return;
      setPicture({ ...loaded, label: name, thumbnail: makeThumbnail(loaded.source), id: nextImageId++ });
      showStatus(`Image or Video: ${name}`);
    } catch (error) {
      showError(`Could not open the image or video. ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [setPicture, showError, showStatus]);

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
    /* Random all on an empty list adds the first effects: the effect tips show, as for "+ New". */
    const wasEmpty = engine.state.fxOrder.length === 0;
    randomizeParams(engine.params, engine.state);
    setRevision((value) => value + 1);
    showStatus("New random settings");
    if (wasEmpty && engine.state.fxOrder.length > 0) firstEffect();
  }, [engine, firstEffect, showStatus]);

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

  /** The mouse moves the Camera effect on the canvas (see attachCameraDrag), not on the start screen. */
  const startScreenRef = useRef(startScreen);
  startScreenRef.current = startScreen;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;
    return attachCameraDrag(canvas, engine, () => !startScreenRef.current);
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
   * While the tracks are the input, each scene plays its Length and then
   * crossfades to the next scene (see docs/AUDIO.md, part 7). The music and
   * the scene have play controls of their own: the Playlist card's toolbar
   * runs the music, and the controls on the picture run the scene.
   */
  const tracksActive = useSyncExternalStore((listener) => audioInput.subscribe(listener), () => audioInput.settings.kind === "tracks");
  /** True while Song follow is on with the tracks as the input (see songFollow.ts). */
  const followOn = useSyncExternalStore((listener) => songFollow.subscribe(listener), () => songFollow.enabled) && tracksActive;
  /* When the picture starts to follow the songs, the FX panel shows the settings' audio buttons, so the user sees which settings follow. */
  useEffect(() => { if (followOn) settingButtons.set("audio", true); }, [followOn]);
  /** Hold means something only with more than one scene: it keeps the scene from the next. With one scene, a song plays from start to end, with no loop. */
  const holdUseful = docs.length > 1;
  /* The Song Map's scene tip waits for a second scene (see SongTip). */
  useEffect(() => { if (songTip === "waitForScenes" && docs.length > 1) setSongTip("scenes"); }, [songTip, docs.length]);
  const holdUsefulRef = useRef(holdUseful);
  holdUsefulRef.current = holdUseful;
  const switchByStepRef = useRef(switchByStep);
  switchByStepRef.current = switchByStep;
  const crossfadeToDocRef = useRef(crossfadeToDoc);
  crossfadeToDocRef.current = crossfadeToDoc;
  /**
   * At the end of the scene's Length (see scenePosition, which the Length
   * slider shows), the next tab crossfades in; the last tab goes round to
   * the first. Ranges with their own times, or that need two Lengths to
   * come back, do not make the scene longer. Each scene starts from 0 when
   * it shows (see crossfadeToDoc), so it plays its whole Length. A pause
   * holds it. A tab click starts the order again from the clicked tab. The
   * track end takes precedence: a Length that ends in the last half Length
   * of the track does not switch, and the new track switches instead.
   */
  useEffect(() => {
    if (!engine || !tracksActive) return;
    /* After a switch, this watch sees the new scene's clock until the effect runs again: it stops at once, so it cannot read that as a loop end. */
    const shown = activeIdRef.current;
    let lastClock = engine.state.clock;
    let lastPosition = scenePosition(engine.state);
    /** The switch request this watch made (see crossfadeToDoc), or 0. */
    let pending = 0;
    return engine.onFrame(() => {
      if (activeIdRef.current !== shown) return;
      const clock = engine.state.clock;
      const position = scenePosition(engine.state);
      /* A click on this scene's own tab cancelled the switch: the scene stays. */
      if (pending && switchRequestRef.current !== pending) pending = 0;
      /* Stop sets the clock back to 0, so its jump to the start is not an end. */
      const ended = clock > lastClock && position < lastPosition;
      lastClock = clock;
      lastPosition = position;
      /* While the picture follows the song, the song plan's cues change the scene instead (see below). */
      if (pending || !ended || engine.script || docsRef.current.length < 2 || sceneHeldRef.current) return;
      if (tracks.playing && tracks.duration > 0 && tracks.duration - tracks.position < engine.params.cycle.value / 2) return;
      switchByStepRef.current(1, true);
      pending = switchRequestRef.current;
    });
  }, [activeId, engine, tracksActive]);

  /**
   * While the picture follows the song (see songFollow.ts), the show's
   * schedule changes the scene (see showSchedule.ts): as the song comes to
   * a slice with a picked scene, that scene comes in, with a cut on a drop
   * and with a crossfade of up to two beats otherwise. A slice with no
   * pick changes nothing. A jump (a play, a seek, a click on a slice, a new
   * track) shows the last pick at or before that place in the song, if
   * any. A slice is taken a frame early, so the cut lands on its beat.
   * Between picks the scene stays, so a tab click shows its tab until the
   * next pick; Hold keeps the scene.
   */
  useEffect(() => {
    if (!engine || !tracksActive) return;
    let last = -1;
    /** The slice that brought in the scene the schedule last asked for (track and start). */
    let shownRun = "";
    return engine.onFrame(() => {
      const following = engine.script;
      const now = engine.songNow;
      if (!following || !now || !tracks.playing || tracks.current?.path !== songFollow.currentPath) {
        last = -1;
        return;
      }
      const early = now.time + 1 / 60;
      /* After a jump (a play, a seek, a click on a slice), the playing place counts: the song clock sits a little before it (the output latency), and the slice before it must not come in. */
      const jumped = last < 0 || early < last - 0.25 || early > last + 0.5;
      const time = jumped ? Math.max(early, tracks.position) : Math.max(early, last);
      last = time;
      const slice = sliceAt(songFollow.schedule(docsRef.current.length)[tracks.index] ?? [], time);
      if (!slice) return;
      /* The pick is part of the run, so a scene picked for the slice that plays comes in at once. */
      const run = `${tracks.index} ${slice.runStart} ${slice.lastPick}`;
      if (run === shownRun && !jumped) return;
      shownRun = run;
      const scene = jumped ? slice.lastPick : slice.scene;
      if (scene === null) return;
      const doc = docsRef.current[scene];
      if (!doc || doc.id === activeIdRef.current || sceneHeldRef.current) return;
      const beat = following.script.tempo > 0 ? 60 / following.script.tempo : 0.5;
      const cut = slice.runStart === slice.start && slice.drop;
      void crossfadeToDocRef.current(doc.id, true, cut ? 0 : Math.min(CROSSFADE_SECONDS, 2 * beat));
    });
  }, [engine, tracksActive]);

  /**
   * A click on a slice of the Song Map (see SongMapPanel): while Hold is on
   * and the last pick at or before the slice is not the scene shown, Hold
   * goes off and that scene comes in, as the schedule brings it in.
   */
  const pickSlice = useCallback((slice: ScheduledSlice) => {
    if (!sceneHeldRef.current || slice.lastPick === null) return;
    const doc = docsRef.current[slice.lastPick];
    if (!doc || doc.id === activeIdRef.current) return;
    holdScene(false);
    const tempo = songFollow.script?.tempo ?? 0;
    const cut = slice.runStart === slice.start && slice.drop;
    void crossfadeToDoc(doc.id, true, cut ? 0 : Math.min(CROSSFADE_SECONDS, 2 * (tempo > 0 ? 60 / tempo : 0.5)));
  }, [crossfadeToDoc, holdScene]);

  /**
   * Each new track (the end of a track, or a pick in the list) also
   * crossfades to the next tab. A scene that the user picked
   * stays for at least half its Length of play time: the user's pick takes
   * precedence. With Song follow on, the show's schedule picks the scene
   * instead (see above).
   */
  useEffect(() => tracks.onTrackChange(() => {
    if (!engine || audioInput.settings.kind !== "tracks" || songFollow.enabled || docsRef.current.length < 2 || sceneHeldRef.current) return;
    const shown = sceneShownRef.current;
    if (shown.id === activeIdRef.current && shown.byUser && engine.state.clock - shown.clock < engine.params.cycle.value / 2) return;
    switchByStepRef.current(1, true);
  }), [engine]);

  /**
   * A change that the user makes to the shown scene with the mouse or the
   * keys (a slider, a menu, Random, Undo) turns Hold on, so the scene stays
   * while the user edits it. A change counts when the scene's settings
   * change within 10 seconds of a click, a drag, a key or the mouse wheel.
   * MIDI knobs and audio links do not turn it on, so a live show with
   * knobs goes on.
   */
  useEffect(() => {
    /* Hold keeps one scene from the next: with one scene it means nothing, so it goes off. */
    if (!engine || !holdUseful) {
      holdScene(false);
      return;
    }
    let lastInput = -Infinity;
    const input = (event: Event) => {
      if (event.type !== "pointermove" || (event as PointerEvent).buttons) lastInput = performance.now();
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel"];
    for (const name of events) window.addEventListener(name, input, true);
    let last = { id: activeIdRef.current, print: fingerprint() };
    const timer = window.setInterval(() => {
      const now = { id: activeIdRef.current, print: fingerprint() };
      /* A tab switch changes the settings too: only a change of the same scene counts. */
      /* Ten seconds: a change can come a while after its click or key (a random photo downloads first). */
      const edited = now.id === last.id && now.print !== last.print && performance.now() - lastInput < 10_000 && !midi.turning;
      last = now;
      if (!edited || sceneHeldRef.current) return;
      holdScene(true);
      showStatus("Scene Hold: this scene stays while you edit it. Click Scene Hold to go on.", 4000);
    }, 250);
    return () => {
      window.clearInterval(timer);
      for (const name of events) window.removeEventListener(name, input, true);
    };
  }, [engine, fingerprint, holdScene, holdUseful, filePath, showStatus, tracksActive]);

  /**
   * Opening an effect, or any press in the Source and FX column (but its
   * play toolbar, and an effect header that collapses its effect), counts
   * as working on the scene too: in a show
   * (see the watch above) it turns Hold on, so the scene does not change
   * while the user looks into it or waits for a random image.
   */
  const holdForWork = useCallback(() => {
    if (sceneHeldRef.current || !holdUsefulRef.current) return;
    holdScene(true);
    showStatus("Scene Hold: this scene stays while you edit it. Click Scene Hold to go on.", 4000);
  }, [holdScene, showStatus]);

  /**
   * While Hold is on and the song plays with Song follow, the song map slice
   * that plays loops too: at its end the music goes back to its start. A
   * jump to another place (a seek, a click on a slice, another track) loops
   * the slice there.
   */
  useEffect(() => {
    if (!sceneHeld || !tracksActive) return;
    let loop: { path: string; start: number; end: number } | null = null;
    let frame = 0;
    const watch = () => {
      frame = requestAnimationFrame(watch);
      const path = tracks.current?.path;
      const script = songFollow.script;
      if (!tracks.playing || !path || path !== songFollow.currentPath || !script) return;
      const position = tracks.position;
      if (!loop || loop.path !== path || position < loop.start - 0.5 || position > loop.end + 0.5) {
        const parts = script.plan.parts;
        const part = parts.find((candidate) => candidate.start <= position && position < candidate.end) ?? parts[parts.length - 1];
        loop = part ? { path, start: part.start, end: part.end } : null;
        return;
      }
      /* The last slice loops a little before the song's end, so the song does not end and go to the next one. */
      const early = loop.end >= tracks.duration - 0.05 ? 0.15 : 0.02;
      if (position >= loop.end - early) tracks.seek(loop.start);
    };
    frame = requestAnimationFrame(watch);
    return () => cancelAnimationFrame(frame);
  }, [sceneHeld, tracksActive]);

  /** True while Space resumes the song: that resume keeps Hold on (see below). */
  const resumeKeepsHoldRef = useRef(false);
  /** Play in the playlist hands the picture back to the song (or the show): Hold goes off. Space only pauses and resumes the song, so Hold stays. */
  useEffect(() => {
    let playing = tracks.playing;
    return tracks.subscribe(() => {
      if (tracks.playing && !playing && sceneHeldRef.current && !resumeKeepsHoldRef.current) holdScene(false);
      if (tracks.playing) resumeKeepsHoldRef.current = false;
      playing = tracks.playing;
    });
  }, [holdScene]);
  /* Opening an effect is work on the scene; collapsing one is not. */
  const openEffectGroup = useCallback((group: string | null) => {
    setOpenGroup(group);
    if (group !== null) holdForWork();
  }, [holdForWork]);

  /* Stop and Play or Pause run the scene only; the music has its own controls (see FilesCard). */
  const stop = useCallback(() => {
    if (!engine) return;
    engine.rewind();
    setPaused(true);
    showStatus("Stopped: every range is at its start");
  }, [engine, showStatus]);

  const togglePause = useCallback(() => {
    if (!engine) return;
    engine.state.paused = !engine.state.paused;
    setPaused(engine.state.paused);
  }, [engine]);

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

  /** Live VR (see vr.ts): whether a headset is ready (for a Quest: Quest Link is on), and whether it shows the picture now. */
  const [vrReady, setVrReady] = useState(false);
  const [inVr, setInVr] = useState(false);
  useEffect(() => {
    const check = () => void vrAvailable().then(setVrReady);
    check();
    return watchVr(check);
  }, []);
  const toggleVr = useCallback(() => {
    if (!engine) return;
    if (engine.inVr) {
      engine.exitVr();
      return;
    }
    engine.enterVr(() => setInVr(false)).then(() => setInVr(engine.inVr)).catch((error: unknown) => {
      showError(`Could not show the picture in VR. ${error instanceof Error ? error.message : String(error)}`);
    });
  }, [engine, showError]);

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
    setPicture(null);
    engine?.setTerrain(null);
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
  }, [engine, markClean, setDriver, setPicture, setSlotImage]);

  /**
   * A new file, or a closed one, starts quiet: the app stops listening
   * (Input Nothing), so the Files and Scenes columns go too, and the track
   * list empties. A file that opens brings its own input and tracks.
   */
  const quietInput = () => {
    if (audioInput.settings.kind !== "none") audioInput.setSource("none", null);
    tracks.clear();
  };

  /**
   * New Scene: a new, untitled scene in a new tab of the open file. The
   * scene that was shown stays in its own tab, and the input and the tracks
   * stay. On the start screen, it starts a new, untitled file with this
   * scene, quiet (see quietInput).
   */
  const newScene = useCallback(() => {
    if (!engine) return;
    const fresh = docsRef.current.length === 0;
    if (fresh) {
      /* The first scene of each run, with the pointers on, shows the welcome card first; Show Me Around then shows the panels' tips. */
      if (!welcomeShownRef.current && helpSettings.get().pointers) {
        welcomeShownRef.current = true;
        setWelcome(true);
      } else setPanelTips(ALL_PANEL_TIPS);
      quietInput();
    }
    /* With no input, the new scene starts with the settings' audio buttons hidden. */
    if (audioInput.settings.kind === "none") settingButtons.set("audio", false);
    sceneGenerationRef.current++;
    setSceneGeneration(sceneGenerationRef.current);
    stashActive();
    blankScene();
    addDoc();
    setStartScreen(false);
    if (fresh) markFileClean(null);
  }, [addDoc, blankScene, engine, markFileClean, stashActive]);

  /** Set below, once closeFile exists: the last scene's Remove Scene closes the file. */
  const closeFileRef = useRef<() => Promise<void>>(async () => {});

  /**
   * Remove Scene: takes the selected scene out of the open file, with no
   * question (the file on disk keeps it until the next Save). The tab next
   * to it is then selected. The last scene closes the file (see closeFile),
   * which asks first.
   */
  const closeScene = useCallback(async () => {
    if (!engine || startScreen) return;
    const closing = activeIdRef.current;
    const rest = docsRef.current.filter((doc) => doc.id !== closing);
    if (!rest.length) {
      await closeFileRef.current();
      return;
    }
    sceneGenerationRef.current++;
    setSceneGeneration(sceneGenerationRef.current);
    const index = docsRef.current.findIndex((doc) => doc.id === closing);
    writeDocs(rest);
    restoreDoc(rest[Math.min(Math.max(index, 0), rest.length - 1)].id);
  }, [engine, restoreDoc, startScreen, writeDocs]);

  /**
   * Save: writes the open file (see kaleidoFile.ts) with a copy of each
   * scene, in tab order, and, while Files is the input, of each track, so
   * the file can move to another PC. With any other input, the track list
   * empties first, so tracks from an earlier Files input never go into the
   * file. A new blank scene with no changes is left out, unless it is the
   * only one. Save As (or a file never saved) asks for a file name first.
   * Returns true when the file was saved.
   */
  const saveFile = useCallback(async (saveAs = false): Promise<boolean> => {
    if (!engine || !isTauri() || docsRef.current.length === 0) return false;
    const current = filePathRef.current;
    const first = docsRef.current[0];
    const firstName = docFileName(first.id === activeIdRef.current ? scenePathRef.current : first.path, first.untitled).replace(/\.ksage$/i, "");
    const path = !saveAs && current
      ? current
      : await saveDialog({ defaultPath: current ?? `${firstName}.${FILE_EXTENSION}`, filters: [{ name: "Kaleido Sage project", extensions: [FILE_EXTENSION] }] });
    if (!path) return false;
    try {
      if (audioInput.settings.kind !== "tracks") tracks.clear();
      showStatus(tracks.list.length ? "Saving the project and its scenes and audio files…" : "Saving the project and its scenes…", 0, undefined, true);
      /**
       * Each scene goes in as it is now, from the engine or from its tab's
       * stored copy. A scene's file on disk never changes: a scene that is
       * not yet the open file's copy gets one first (see isFileCopy).
       */
      const docPath = (doc: SceneDoc) => doc.id === activeIdRef.current ? scenePathRef.current : doc.path;
      const docDirty = (doc: SceneDoc) => doc.id === activeIdRef.current ? fingerprint() !== savedFingerprintRef.current : doc.dirty;
      const keepBlank = !docsRef.current.some((doc) => docPath(doc) !== null || docDirty(doc));
      const scenes: string[] = [];
      let activeScene = 0;
      const projectName = fileNameOf(path).replace(/\.ksage$/i, "");
      let unnamed = 0;
      for (const doc of [...docsRef.current]) {
        const active = doc.id === activeIdRef.current;
        const stored = active ? null : storedRef.current.get(doc.id);
        const scenePath = docPath(doc);
        const dirtyNow = docDirty(doc);
        if (scenePath === null && !dirtyNow && !keepBlank) continue;
        if (active) activeScene = scenes.length;
        if (isFileCopy(scenePath) && !dirtyNow) {
          scenes.push(scenePath!);
          continue;
        }
        /* A scene with no name yet takes the project's name: "Cool", then "Cool 2" and so on. */
        if (scenePath === null) unnamed++;
        const name = scenePath ? fileNameOf(scenePath) : `${projectName}${unnamed > 1 ? ` ${unnamed}` : ""}.${SCENE_EXTENSION}`;
        const target = isFileCopy(scenePath) ? scenePath! : await invoke<string>("scene_copy_path", { name });
        if (active) {
          const saved = fingerprint();
          await writeSceneFile(target, engine.params, engine.state, imagesRef.current, driverRef.current, pictureRef.current, engine.terrain);
          savedFingerprintRef.current = saved;
          setDirty(fingerprint() !== saved);
          setActivePath(target);
        } else if (stored) {
          await writeSceneFile(target, stored.params, stored.state, stored.images, stored.driver, stored.picture, stored.terrain ?? null);
          stored.savedFingerprint = sceneFingerprint(stored.params, stored.state, [stored.images[0]?.id ?? null, stored.images[1]?.id ?? null, stored.driver?.id ?? null, stored.picture?.id ?? null, stored.terrain?.id ?? null]);
          writeDocs(docsRef.current.map((candidate) => candidate.id === doc.id ? { ...candidate, path: target, dirty: false } : candidate));
        }
        scenes.push(target);
      }
      await saveKaleidoFile(path, {
        audio: fileAudio(),
        activeScene,
        filesWidth: panelLayout.filesWidth,
        trackSeconds: tracks.list.map((track) => tracks.lengthOf(track.path)),
        songFollow: songFollow.enabled
      }, scenes, tracks.list.map((track) => track.path), tracks.list.map((track) => songFollow.analysisText(track.path)));
    } catch (error) {
      showError(`Could not save the project. ${String(error)}`);
      return false;
    }
    markFileClean(path);
    /* A save of the file saves the shown scene too, so Hold goes off. */
    holdScene(false);
    showStatus(`Saved ${fileNameOf(path)}`);
    return true;
  }, [engine, fingerprint, holdScene, markFileClean, fileAudio, setActivePath, showError, showStatus, writeDocs]);

  askToSaveFileRef.current = (reason: string) => new Promise<boolean>((resolve) => {
    const path = filePathRef.current;
    if (!fileUnsaved()) resolve(true);
    else setSaveQuestion({ reason, answer: resolve, name: path ? fileNameOf(path) : "Untitled Project", save: () => saveFile() });
  });

  /** Takes every scene and track out of the app, with no question: for Close, New and a show that opens. The start screen does not show. */
  const clearFile = useCallback(async () => {
    if (!engine) return;
    holdScene(false);
    tracks.clear();
    /**
     * No new scene generation here: a project that opens next adds its
     * scenes through setImage, which still has this render's generation
     * and would drop every scene (Close Project counts one itself).
     */
    blankScene();
    writeDocs([]);
    storedRef.current.clear();
    selectDocId(null);
    historyRef.current = null;
    markFileClean(null);
  }, [blankScene, engine, holdScene, markFileClean, selectDocId, writeDocs]);

  /**
   * Close: asks "Save changes?" for the file when it has changes, then
   * closes its scenes, and the app goes quiet (see quietInput). The start
   * screen shows.
   */
  const closeFile = useCallback(async () => {
    if (!engine || docsRef.current.length === 0) return;
    const name = filePathRef.current ? fileNameOf(filePathRef.current) : "Untitled Project";
    if (!(await askToSaveFileRef.current("Closing the project closes its scenes and its audio files."))) return;
    if (fullscreen) await exitFullscreen();
    await clearFile();
    /* A photo that still loads for a closed scene does not come back. */
    sceneGenerationRef.current++;
    setSceneGeneration(sceneGenerationRef.current);
    quietInput();
    engine.stop();
    setStartScreen(true);
    showStatus(`Closed ${name}`);
  }, [clearFile, engine, exitFullscreen, fullscreen, showStatus]);
  closeFileRef.current = closeFile;

  /** New Project: asks "Save changes?" for the open project, then starts a new, untitled project with one blank scene (see newScene). */
  const newFile = useCallback(async () => {
    if (!engine) return;
    if (!(await askToSaveAll("A new project closes the open project."))) return;
    await clearFile();
    newScene();
  }, [askToSaveAll, clearFile, engine, newScene]);

  /**
   * Opens a file in place of the open one (whose changes were asked about):
   * its scenes open in its tab order, its tracks come in stopped at the
   * first one, and its audio settings apply. The show starts at its first
   * scene.
   */
  const openFilePath = useCallback(async (path: string) => {
    if (!engine) return;
    const name = fileNameOf(path);
    const title = `Opening ${name}`;
    try {
      setLoading({ title, detail: "Unpacking the project…", progress: null });
      const opened = await openKaleidoFile(path);
      const manifest = readManifest(opened.manifest);
      tracks.pause();
      await clearFile();
      for (const [index, scene] of opened.scenes.entries()) {
        setLoading({ title, detail: `Scene ${index + 1} of ${opened.scenes.length}: ${fileNameOf(scene)}`, progress: index / opened.scenes.length });
        await openScenePath(scene);
      }
      setLoading({ title, detail: "Audio files and settings…", progress: 1 });
      /* The song analyses the file kept go first, so Song follow needs none for these tracks. */
      opened.analyses?.forEach((text, index) => { if (text && opened.tracks[index]) songFollow.preload(opened.tracks[index], text); });
      tracks.replace(opened.tracks);
      /* The lengths the file kept, so the Files footer has its play time at once. */
      if (manifest.trackSeconds) tracks.setLengths(manifest.trackSeconds);
      if (manifest.songFollow !== undefined) songFollow.setEnabled(manifest.songFollow);
      await audioInput.applySettings(manifest.audio);
      if (manifest.filesWidth) panelLayout.setFilesWidth(manifest.filesWidth);
      /**
       * A show starts at its beginning: the first scene and the first track. The scene is set to play from its
       * start, and waits for the music (see the music gate below); the music waits for Play.
       */
      const target = docsRef.current[0];
      if (target) startShow();
      else setStartScreen(true);
      markFileClean(target ? path : null);
      showStatus(`Opened ${name}`);
    } catch (error) {
      showError(`Could not open ${name}. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(null);
    }
  }, [clearFile, engine, markFileClean, openScenePath, showError, showStatus, startShow]);

  /** Open Project: asks "Save changes?" for the open project, then opens the picked one in its place (see openFilePath). */
  const openProject = useCallback(async (path: string) => {
    if (!engine) return;
    if (docsRef.current.length > 0 && !(await askToSaveAll("Opening a project closes the open project."))) return;
    await openFilePath(path);
  }, [askToSaveAll, engine, openFilePath]);

  /**
   * Import Scene(s): the scenes of each picked project go into the open
   * project, in order, after its scenes, each in a new tab. The picked
   * projects' audio files and audio settings do not come in, and their
   * files on disk do not change. A scene that is the same (byte for byte)
   * as a saved, unchanged scene of the project is skipped. When scenes have
   * the same name as scenes of the project, one question asks: Replace
   * (the new scene takes the old one's place), Keep Both, or Cancel.
   */
  const importScenes = useCallback(async (paths: string[]) => {
    if (!engine || paths.length === 0 || docsRef.current.length === 0) return;
    const title = paths.length === 1 ? `Importing scenes from ${fileNameOf(paths[0])}` : `Importing scenes from ${paths.length} files`;
    const sceneName = (path: string) => fileNameOf(path).replace(/\.ksage$/i, "");
    const docPath = (doc: SceneDoc) => doc.id === activeIdRef.current ? scenePathRef.current : doc.path;
    const docDirty = (doc: SceneDoc) => doc.id === activeIdRef.current ? fingerprint() !== savedFingerprintRef.current : doc.dirty;
    try {
      const unpacked: string[] = [];
      for (const [index, path] of paths.entries()) {
        setLoading({ title, detail: `Unpacking ${fileNameOf(path)}…`, progress: index / paths.length });
        /* The open project's unpacked scenes and tracks stay (see openKaleidoFile). */
        unpacked.push(...(await openKaleidoFile(path, { keepOthers: true })).scenes);
      }
      const saved = docsRef.current.flatMap((doc) => {
        const path = docPath(doc);
        return path !== null && !docDirty(doc) ? [path] : [];
      });
      const matches = await matchingScenes(unpacked, saved);
      const scenes = unpacked.filter((_, index) => matches[index] === null);
      const skipped = unpacked.length - scenes.length;
      /* The project's scenes by name (no case, no .ksage), for the scenes that have the same name. */
      const byName = new Map(docsRef.current.map((doc) => [docFileName(docPath(doc), doc.untitled).replace(/\.ksage$/i, "").toLowerCase(), doc.id]));
      const clashes = [...new Set(scenes.map(sceneName).filter((name) => byName.has(name.toLowerCase())))];
      let replace = false;
      if (clashes.length) {
        setLoading(null);
        const choice = await new Promise<"replace" | "both" | "cancel">((answer) => setImportQuestion({ names: clashes, answer }));
        if (choice === "cancel") return;
        replace = choice === "replace";
      }
      let replaced = 0;
      for (const [index, scene] of scenes.entries()) {
        setLoading({ title, detail: `Scene ${index + 1} of ${scenes.length}: ${sceneName(scene)}`, progress: index / scenes.length });
        const old = replace ? byName.get(sceneName(scene).toLowerCase()) : undefined;
        await openScenePath(scene);
        const added = activeIdRef.current;
        /* Replace: the new scene takes the old one's place in the list, and the old one goes. Each old scene is replaced once. */
        if (old === undefined || added === null || old === added || !docsRef.current.some((doc) => doc.id === old)) continue;
        byName.delete(sceneName(scene).toLowerCase());
        const newDoc = docsRef.current.find((doc) => doc.id === added)!;
        storedRef.current.delete(old);
        writeDocs(docsRef.current.filter((doc) => doc.id !== added).map((doc) => doc.id === old ? newDoc : doc), new Map([[old, added]]));
        replaced++;
      }
      const parts = [`Imported ${scenes.length === 1 ? "1 scene" : `${scenes.length} scenes`}`];
      if (replaced) parts.push(`${replaced} replaced`);
      if (skipped) parts.push(`${skipped} skipped (already in the project)`);
      showStatus(parts.join(", "), 5000);
    } catch (error) {
      showError(`Could not import the scenes. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(null);
    }
  }, [engine, fingerprint, openScenePath, showError, showStatus, writeDocs]);

  /** Puts the tabs in a new order (a drag in the tab bar). The scenes play in tab order, and the file keeps it. */
  const reorderDocs = useCallback((ids: number[]) => {
    const byId = new Map(docsRef.current.map((doc) => [doc.id, doc]));
    writeDocs(ids.flatMap((id) => byId.get(id) ?? []));
  }, [writeDocs]);

  /**
   * Rename (the scene list's right-click menu): gives the scene's copy a new
   * name in its temp folder. The file counts as changed, and its next save
   * keeps the new name.
   */
  const renameDoc = useCallback(async (id: number, name: string) => {
    const path = id === activeIdRef.current ? scenePathRef.current : docsRef.current.find((doc) => doc.id === id)?.path ?? null;
    if (!path || !isTauri()) return;
    const newName = name.toLowerCase().endsWith(`.${SCENE_EXTENSION}`) ? name : `${name}.${SCENE_EXTENSION}`;
    try {
      const newPath = await invoke<string>("rename_browse_entry", { path, newName });
      if (id === activeIdRef.current) setActivePath(newPath);
      else writeDocs(docsRef.current.map((doc) => doc.id === id ? { ...doc, path: newPath } : doc));
      showStatus(`Renamed to ${fileNameOf(newPath).replace(/\.ksage$/i, "")}`);
    } catch (error) {
      showError(`Could not rename the scene. ${String(error)}`);
    }
  }, [setActivePath, showError, showStatus, writeDocs]);

  /** Removes any tab's scene from the file, with no question (see closeScene). */
  const closeTab = useCallback((id: number) => {
    if (id !== activeIdRef.current) {
      if (!docsRef.current.some((candidate) => candidate.id === id)) return;
      storedRef.current.delete(id);
      writeDocs(docsRef.current.filter((candidate) => candidate.id !== id));
      return;
    }
    void closeScene();
  }, [closeScene, writeDocs]);

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
    if (!engine) return;
    /** Dev only: the open tabs as the reload keeper keeps them (see reloadKeeper.ts). */
    const takeKept = (): Kept => ({
      activeId: activeIdRef.current,
      file: {
        path: filePathRef.current,
        saved: fileSavedRef.current,
        tracks: tracks.list.map((track) => track.path),
        songFollow: songFollow.enabled,
        followEdits: songFollow.edits,
        analyses: keepAnalyses(tracks.list.map((track) => track.path), (path) => songFollow.analysisFor(path))
      },
      docs: docsRef.current.flatMap((doc) => {
        if (doc.id === activeIdRef.current) {
          const driver = driverRef.current;
          return [{
            id: doc.id, path: scenePathRef.current, untitled: doc.untitled, dirty: fingerprint() !== savedFingerprintRef.current,
            scene: serializeScene(engine.params, engine.state, { image: KEPT_IMAGE }),
            images: [keepImage(imagesRef.current[0]), keepImage(imagesRef.current[1])],
            driver: driver ? { video: driver.videoFile, name: driver.name } : null,
            picture: keepImage(pictureRef.current),
            terrain: keepTerrain(engine.terrain),
            openGroup: openGroupRef.current
          }];
        }
        const stored = storedRef.current.get(doc.id);
        if (!stored) return [];
        let scene = keptText.get(stored);
        if (!scene) {
          scene = serializeScene(stored.params, stored.state, { image: KEPT_IMAGE });
          keptText.set(stored, scene);
        }
        return [{
          id: doc.id, path: doc.path, untitled: doc.untitled, dirty: doc.dirty, scene,
          images: [keepImage(stored.images[0]), keepImage(stored.images[1])],
          driver: stored.driver ? { video: stored.driver.videoFile, name: stored.driver.name } : null,
          picture: keepImage(stored.picture),
          terrain: keepTerrain(stored.terrain),
          openGroup: stored.openGroup
        }];
      })
    });
    /* In dev, start-up effects run twice; the second run must not start keeping while the tabs still open. */
    if (startedRef.current) {
      if (!restoringKept) keepScenes(takeKept);
      return;
    }
    startedRef.current = true;
    markClean();
    const kept = readKept();
    if (!kept) {
      keepScenes(takeKept);
      return;
    }
    /**
     * After a reload, the tabs open again as they were: each scene with its
     * images, file and unsaved mark, and the selected tab selected. Undo
     * starts again from the scene as it is. Keeping starts only once they
     * are open, so the empty start-up state does not replace the snapshot.
     */
    const loadKeptImage = async (image: KeptImage | null): Promise<SlotImage | null> => {
      if (!image) return null;
      try {
        let loaded: { source: ImageSource; blob?: Blob; videoFile?: VideoFile };
        if (image.video) {
          loaded = await loadSceneMedia({ type: image.video.mime, video: image.video.id });
        } else {
          const blob = image.key ? await keptImageBytes(image.key) : null;
          if (!blob) return null;
          loaded = { source: await loadSceneSource(blob), blob };
        }
        const slot: SlotImage = { ...loaded, label: image.label, thumbnail: makeThumbnail(loaded.source), patternId: image.patternId, id: nextImageId++ };
        if (image.key) adoptImage(slot, image.key);
        return slot;
      } catch {
        return null;
      }
    };
    const restore = async () => {
      const loaded: { doc: SceneDoc; params: Params; state: PlayState; images: [SlotImage, SlotImage | null]; driver: DriverVideo | null; picture: SlotImage | null; terrain: TerrainData | null; openGroup: string | null }[] = [];
      for (const keptDoc of kept.docs) {
        const params = createParams();
        const state = createPlayState();
        try {
          applyScene(keptDoc.scene, params, state);
        } catch {
          continue;
        }
        /* A scene needs its first image. */
        const first = await loadKeptImage(keptDoc.images[0]);
        if (!first) continue;
        const second = await loadKeptImage(keptDoc.images[1]);
        let driver: DriverVideo | null = null;
        if (keptDoc.driver) {
          const media = await loadSceneMedia({ type: keptDoc.driver.video.mime, video: keptDoc.driver.video.id }).catch(() => null);
          if (media?.source instanceof HTMLVideoElement && media.videoFile) driver = { video: media.source, videoFile: media.videoFile, name: keptDoc.driver.name, id: nextImageId++ };
        }
        const picture = keptDoc.picture ? await loadKeptImage(keptDoc.picture) : null;
        const terrain = keptDoc.terrain ? await keptTerrain(keptDoc.terrain) : null;
        loaded.push({ doc: { id: keptDoc.id, path: keptDoc.path, untitled: keptDoc.untitled, dirty: keptDoc.dirty }, params, state, images: [first, second], driver, picture, terrain, openGroup: keptDoc.openGroup });
      }
      if (loaded.length === 0 || activeIdRef.current !== null) return;
      /* Each tab's Undo history is made on the engine's settings, as addDoc makes it, starting from that scene. */
      for (const { doc, params, state, images, driver, picture, terrain, openGroup } of loaded) {
        Object.assign(engine.params, structuredClone(params));
        Object.assign(engine.state, structuredClone(state));
        const history = new SettingsHistory(engine.params, engine.state);
        const savedFingerprint = doc.dirty ? "" : sceneFingerprint(params, state, [images[0].id, images[1]?.id ?? null, driver?.id ?? null, picture?.id ?? null, terrain?.id ?? null]);
        storedRef.current.set(doc.id, { params, state, images, driver, picture, terrain, savedFingerprint, history, openGroup });
      }
      writeDocs(loaded.map((entry) => entry.doc));
      nextDocId = Math.max(nextDocId, ...loaded.map((entry) => entry.doc.id + 1));
      const active = loaded.find((entry) => entry.doc.id === kept.activeId) ?? loaded[0];
      restoreDoc(active.doc.id);
      /* The open file comes back too: its name, its unsaved mark and its tracks (stopped). */
      if (kept.file) {
        /**
         * The song analyses (with their song maps and slice picks) go first,
         * so Song follow needs none for these tracks; then the tracks,
         * Song follow on or off, and the count of map edits, so the unsaved
         * mark is as it was.
         */
        for (const [path, key] of Object.entries(kept.file.analyses ?? {})) {
          const text = await keptAnalysisText(key).catch(() => null);
          if (text) songFollow.preload(path, text);
        }
        if (kept.file.tracks.length) tracks.replace(kept.file.tracks);
        if (kept.file.songFollow !== undefined) songFollow.setEnabled(kept.file.songFollow);
        if (kept.file.followEdits !== undefined) songFollow.edits = kept.file.followEdits;
        /* Dev only, for a bug hunt (2026-10-25): how many analyses the keeper had and how many Song follow took. */
        console.warn(`reload: ${kept.file.tracks.length} tracks, ${Object.keys(kept.file.analyses ?? {}).length} analyses kept, ${songFollow.analyzedCount(kept.file.tracks)} taken`);
        filePathRef.current = kept.file.path;
        setFilePath(kept.file.path);
        fileSavedRef.current = kept.file.saved;
      }
      setStartScreen(false);
      showStatus(loaded.length === 1 ? "Reopened the scene after the reload" : `Reopened ${loaded.length} scenes after the reload`);
    };
    restoringKept = true;
    void restore().catch((error: unknown) => console.error("Could not reopen the kept scenes", error)).finally(() => {
      restoringKept = false;
      keepScenes(takeKept);
    });
  }, [engine]);

  /** The engine's audio links follow the running sound source; with none, they have no effect. */
  useEffect(() => {
    if (!engine) return;
    const follow = () => { engine.audio = audioInput.analyzer; };
    follow();
    return audioInput.subscribe(follow);
  }, [engine]);

  /** Stop in the playlist starts the show again: the first scene, ready to play (see startShow). While Hold is on, the scene and Hold stay. */
  useEffect(() => tracks.onStop(() => {
    if (audioInput.settings.kind === "tracks" && docsRef.current.length > 0 && !sceneHeldRef.current) startShow();
  }), [startShow]);

  /**
   * The music gate: with the tracks as the input and Hold off, the playlist
   * leads, so the scene moves only while the music plays; it stays set to
   * play, and starts with the music. Hold gives the scene its own clock.
   */
  useEffect(() => {
    if (!engine) return;
    engine.musicGate = tracksActive && !sceneHeld ? () => tracks.playing : null;
  }, [engine, sceneHeld, tracksActive]);

  /**
   * With Song follow on and the tracks as the input, the picture follows
   * the track's script (see songFollow.ts) once it is analyzed. While Hold
   * is on, it follows the script as long as the music plays (the slice
   * loops, see below), so the held scene looks as it does in the show;
   * with the music paused, Hold gives the scene its own clock (see
   * holdScene), so it moves while the user edits it.
   */
  useEffect(() => {
    if (!engine) return;
    const apply = () => {
      const script = tracksActive && (!sceneHeld || tracks.playing) ? songFollow.script : null;
      engine.script = script && { script, time: () => songFollow.clock.time(), playing: () => tracks.playing };
    };
    apply();
    const stopFollow = songFollow.subscribe(apply);
    const stopTracks = tracks.subscribe(apply);
    /* A song added to the project gets its song map filled once its analysis is done (see fillAddedSongs). */
    const stopFill = songFollow.subscribe(() => fillAddedSongs(docsRef.current.length));
    return () => {
      stopFollow();
      stopTracks();
      stopFill();
    };
  }, [engine, sceneHeld, tracksActive]);

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
      void askToSaveAllRef.current("Kaleido Sage closes after this.").then((go) => {
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
    const check = () => void appWindow.isFullscreen().then(setFullscreen);
    check();
    /**
     * The page's own resize event, not the window's onResized: Tauri keeps a
     * window listener after a page reload (it removes them only when the
     * window closes), and the old page's listener then warns on each resize.
     */
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  /** Full screen shows only the picture; leaving it brings the panel back. */
  useEffect(() => { setPanelOpen(!fullscreen); }, [fullscreen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (aboutOpen || shortcutsOpen || welcome || openRequest || videoDialogOpen || searchSlot !== null || event.altKey || event.metaKey) return;
      /* "?" opens the keyboard shortcuts sheet, also on the start screen, but not while typing in a text field. */
      if (event.key === "?" && !(event.target instanceof HTMLInputElement && event.target.type === "text")) {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      /**
       * The start screen takes only Ctrl+O and Ctrl+N; the other keys act on
       * a scene that is not shown yet. Esc and F11 still leave full screen, as
       * the start screen covers the Exit full screen button.
       */
      if (startScreen) {
        const startAction = event.ctrlKey
          ? { o: openFile, n: newFile }[event.key.toLowerCase()]
          : ["escape", "f11"].includes(event.key.toLowerCase()) ? exitFullscreen : undefined;
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
        /* Ctrl+S saves the open project with all of its scenes, and Ctrl+Shift+S saves it with a new name. Ctrl+N adds a blank scene. */
        const sceneAction = { s: () => saveFile(event.shiftKey), o: openFile, n: newScene, w: closeScene }[key];
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
        /* Esc plays the ranges that MIDI stopped; with none stopped, it leaves VR, then full screen. */
        escape: () => {
          if (engine?.anyHeld) engine.resumeAll();
          else if (engine?.inVr) engine.exitVr();
          else void exitFullscreen();
        },
        h: () => setPanelOpen((open) => !open),
        m: toggleMidiPanel,
        a: toggleAudioPanel,
        p: () => setStatsOpen((open) => !open),
        /* With Song follow on (also while Hold is on, or while the song is analyzed), Space and Shift+Space run the song (the Playlist card's controls), not the scene. */
        " ": songFollow.enabled && audioInput.settings.kind === "tracks"
          ? (event.shiftKey ? () => tracks.stop() : () => {
            resumeKeepsHoldRef.current = !tracks.playing;
            tracks.toggle();
          })
          : event.shiftKey ? stop : togglePause,
        x: randomize
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
  }, [aboutOpen, shortcutsOpen, welcome, closeScene, crossfadeToDoc, engine, exitFullscreen, newFile, newScene, openRequest, videoDialogOpen, searchSlot, openFile, randomize, redo, saveFile, startScreen, stop, switchByStep, toggleAudioPanel, toggleFullscreen, toggleMidiPanel, togglePause, undo]);

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
      /**
       * The project (a Kaleido Sage file: every open scene, and the tracks),
       * then its scenes (Import Scene(s) adds another project's scenes,
       * Export Scene writes a copy to a project of its own, and Remove Scene
       * takes a scene out), then the picture's own commands (a PNG or a
       * video out). An image or video comes in through the Source card's
       * slots.
       */
      items: [
        { label: "New Project", icon: <FilePlus size={15} />, run: () => void newFile() },
        { label: "Open Project…", icon: <FolderOpen size={15} />, shortcut: "Ctrl+O", run: () => void openFile() },
        { label: "Save Project", disabled: startScreen, icon: <FloppyDisk size={15} />, shortcut: "Ctrl+S", run: () => void saveFile() },
        { label: "Save Project As…", disabled: startScreen, icon: <FloppyDisk size={15} />, shortcut: "Ctrl+Shift+S", run: () => void saveFile(true) },
        { label: "Close Project", icon: <X size={15} />, disabled: startScreen, run: () => void closeFile() },
        "separator",
        { label: "Add Blank Scene", icon: <Plus size={15} />, shortcut: "Ctrl+N", disabled: startScreen, run: newScene },
        { label: "Import Scene(s)…", icon: <FolderOpen size={15} />, disabled: startScreen, run: openImport },
        { label: "Export Scene…", disabled: startScreen, icon: <Export size={15} />, run: () => void exportScene() },
        { label: "Remove Scene", icon: <Trash size={15} />, shortcut: "Ctrl+W", disabled: startScreen, run: () => void closeScene() },
        "separator",
        { label: "Save PNG", disabled: startScreen, icon: <Camera size={15} />, run: () => void savePng() },
        { label: "Export Video…", icon: <FilmStrip size={15} />, run: openVideoDialog },
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
        /* The start screen has no picture to view: all of the View items are off. */
        { label: panelOpen ? "Hide Panels" : "Show Panels", icon: <SlidersHorizontal size={15} />, shortcut: "H", disabled: startScreen, run: () => setPanelOpen((open) => !open) },
        { label: filesCollapsed ? "Show Playlist" : "Hide Playlist", icon: <Playlist size={15} />, disabled: startScreen || !tracksActive || !panelOpen, run: () => panelLayout.setFilesCollapsed(!panelLayout.filesCollapsed) },
        { label: statsOpen ? "Hide Performance" : "Show Performance", icon: <Gauge size={15} />, shortcut: "P", disabled: startScreen, run: () => setStatsOpen((open) => !open) },
        { label: midiPanelOpen && bottomTab === "audio" ? "Hide Audio Panel" : "Show Audio Panel", icon: <SpeakerSimpleHigh size={16} />, shortcut: "A", disabled: startScreen, run: toggleAudioPanel },
        { label: midiPanelOpen && bottomTab === "midi" ? "Hide MIDI Panel" : "Show MIDI Panel", icon: <MidiIcon size={15} />, shortcut: "M", disabled: startScreen, run: toggleMidiPanel },
        "separator",
        { label: "Full Screen", icon: <ArrowsOut size={15} />, shortcut: "F", disabled: startScreen, run: () => void toggleFullscreen() },
        /* VR needs a headset that is ready: for a Quest, Quest Link or Air Link must be on. */
        { label: inVr ? "Exit VR" : "Enter VR", icon: <VirtualReality size={15} />, disabled: startScreen || (!vrReady && !inVr), run: toggleVr }
      ]
    },
    {
      id: "help",
      label: "Help",
      items: [
        { label: "Keyboard Shortcuts", icon: <Keyboard size={15} />, shortcut: "?", run: () => setShortcutsOpen(true) },
        { label: pointersOn ? "Disable Pointers" : "Enable Pointers", icon: <HandPointing size={15} />, run: () => helpSettings.set({ pointers: !pointersOn }) },
        "separator",
        { label: "About Kaleido Sage", icon: <Info size={15} />, run: () => setAboutOpen(true) }
      ]
    }
  ];

  /** A tab's label: the scene file's name, or "Untitled Scene", with a number after the first. */
  const docFileName = (path: string | null, untitled: number) =>
    path?.split(/[\\/]/).pop() ?? (untitled > 1 ? `Untitled Scene ${untitled}` : "Untitled Scene");
  /* The scenes are a list at the left, not tabs, while Files is the input: a show has many scenes. Hide Panels (H) hides the list with the rest of the left side. */
  const sceneListMode = tracksActive;
  const sceneListShown = !fullscreen && !startScreen && sceneListMode && panelOpen;
  /**
   * The audio Input menu: above the Playlist's play controls while Files is
   * the input and the Playlist shows, else above the scene's play controls.
   */
  const inputInPlaylist = sceneListShown && tracksActive && !filesCollapsed;
  const inputMenu = <AudioInputMenu tip={inputTip} onTipDone={() => setInputTip(false)} onPick={pickInput} />;
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
            fileName={startScreen ? null : filePath ? fileNameOf(filePath) : "Untitled Project"}
            dirty={fileDirty}
            sceneName={startScreen ? null : sceneFileName.replace(/.ksage$/i, "")}
          />
          <MenuBar menus={menus} />
        </>
      )}
      <div className="workspace">
        {loading && <LoadingOverlay loading={loading} />}
        {startScreen && <StartScreen version={appVersion} onNew={() => void newFile()} onOpen={openFile} />}
        {/**
          * The left side. With Files as the input, it is
          * one panel of columns: the audio files (Files only), the scenes (a
          * list in place of the tabs), then the left panel. While the
          * picture follows the songs, the Song Map sits under the scenes and
          * the left panel, as wide as both. Else the wrapper has no box of
          * its own (see .sidebar), and the left panel stands alone.
          */}
        <div className={`sidebar ${sceneListShown ? "with-scenes" : ""}`}>
          {sceneListShown && tracksActive && <FilesCard onAddTracks={() => void pickTracks()} input={inputInPlaylist ? inputMenu : null} addTip={filesTip} onAddTipDone={endFilesTip} />}
          <div className="sidebar-stack">
            <div className="sidebar-columns">
              {sceneListShown && <SceneList tabs={tabs} activeId={activeId} onSelect={(id) => void crossfadeToDoc(id)} onClose={closeTab} onReorder={reorderDocs} onRename={(id, name) => void renameDoc(id, name)} onPick={(id) => songFollow.pickScene(docsRef.current.findIndex((doc) => doc.id === id))} />}
              {/* The left panel: the Source section, then the Designer (the effects). */}
              {engine && !startScreen && panelOpen && (
                <ControlPanel
                  /* A change outside the panel (Randomize, Undo, a new scene) makes a new panel, so all of its state reloads. */
                  key={`controls-${revision}`}
                  engine={engine}
                  openGroup={openGroup}
                  onOpenGroup={openEffectGroup}
                  onWork={holdForWork}
                  onRandomize={randomize}
                  onNudge={nudge}
                  onReset={() => setResetAsked(true)}
                  onRandomizeGroup={randomizeOneGroup}
                  driverVideoName={driverVideoName}
                  onPickDriverVideo={() => setOpenRequest({ kind: "image", slot: 0, target: "driver" })}
                  pictureName={pictureName}
                  onPickPicture={() => setOpenRequest({ kind: "image", slot: 0, target: "picture" })}
                  onRemovePicture={() => setPicture(null)}
                  onNeedAudioInput={askForAudioInput}
                  onFirstEffect={firstEffect}
                  linksTip={linksTip}
                  onLinksTipDone={endLinksTip}
                  nextTip={nextTip}
                  onNextTipDone={endNextTip}
                  transport={<SceneTransport engine={engine} paused={paused} onTogglePause={togglePause} onStop={stop} show={holdUseful} autoNext={tracksActive && docs.length > 1} held={holdUseful && sceneHeld} onToggleHold={() => holdScene(!sceneHeldRef.current)} input={inputInPlaylist ? null : inputMenu} />}
                  source={(
                    <SourcePanel
                      engine={engine}
                      sceneName={sceneFileName.replace(/\.ksage$/i, "")}
                      dirty={dirty}
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
            </div>
            {sceneListShown && followOn && (
              <div className="song-map-dock">
                <SongMapPanel sceneCount={docs.length} activeScene={docs.findIndex((doc) => doc.id === activeId)} held={sceneHeld} onSlicePick={pickSlice} tip={songTip} onTip={setSongTip} />
              </div>
            )}
          </div>
        </div>
        {/* The picture under its document tab; full screen hides the tab. */}
        <div className="document">
          {!fullscreen && !startScreen && !sceneListMode && <DocumentTabs tabs={tabs} activeId={activeId} onSelect={(id) => void crossfadeToDoc(id)} onClose={closeTab} onReorder={reorderDocs} onRename={(id, name) => void renameDoc(id, name)} />}
          <main className={`stage ${cursorIdle ? "cursor-idle" : ""} ${inVr ? "in-vr" : ""}`}>
            <canvas ref={canvasRef} onDoubleClick={() => void toggleFullscreen()} />
            {engine && statsOpen && <StatsOverlay engine={engine} />}
            {engine && !startScreen && !fullscreen && (
              <StageControls onFullscreen={() => void toggleFullscreen()} onVr={vrReady || inVr ? toggleVr : null} inVr={inVr} />
            )}
            {fullscreen && (
              /* In full screen the title bar and toolbar are gone; these buttons show while the mouse moves. */
              <div className={`fullscreen-controls ${cursorIdle && !panelOpen ? "hidden" : ""}`}>
                <button
                  className={panelOpen ? "active" : ""}
                  onClick={() => setPanelOpen((open) => !open)}
                  data-tip="Settings `h`"
                  aria-label="Settings"
                  aria-pressed={panelOpen}
                >
                  <SlidersHorizontal size={18} />
                </button>
                <button onClick={() => void exitFullscreen()} data-tip="Exit full screen `Esc`" aria-label="Exit full screen">
                  <ArrowsIn size={18} />
                </button>
              </div>
            )}
            {fatalError && <div className="fatal-error selectable">{fatalError}</div>}
            {status && (
              <div className={`status-toast ${status.error ? "error" : ""} ${status.busy ? "busy" : ""}`} role={status.error ? "alert" : "status"}>
                {status.busy && <span className="status-spinner" aria-hidden="true" />}
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
            {bottomTab === "midi" ? <MidiPanel engine={engine} open={midiPanelOpen} />
              : <AudioPanel engine={engine} sceneName={sceneFileName} />}
          </div>
        </div>
      )}
      {/* The help line: the tip of the control under the mouse, always in view under the panels (not in full screen, not with the settings hidden). */}
      {!fullscreen && !startScreen && panelOpen && <HelpLine />}
      {panelTips.scene && !startScreen && (
        <PointerTip
          anchor={sceneCard}
          wide
          outline={sceneOutline}
          text="This is the scene SOURCE panel. It shows the scene name and controls the scene loop LENGTH. SLOT A holds a checkerboard pattern - good for testing FX. Hover over a slot to load a random image, search for a specific image, choose a pattern, or load your own image or video."
          onClose={() => setPanelTips((tips) => ({ ...tips, scene: false }))}
        />
      )}
      {panelTips.fx && !startScreen && (
        <PointerTip
          anchor={fxCard}
          wide
          outline={fxOutline}
          text="This is the FX panel. Click + New to add a new effect. Effects run top-to-bottom. Random ALL (dice icon) creates a new semi-random set of FX. Nudge ALL (wind icon) nudges all effect settings by a small amount. Clear ALL (trash icon) deletes all added effects. The speaker and MIDI icons show or hide audio or MIDI controls for each effect setting."
          onClose={() => setPanelTips((tips) => ({ ...tips, fx: false }))}
        />
      )}
      {panelTips.play && !startScreen && (
        <PointerTip
          anchor={playCard}
          outline={playOutline}
          text="This is the PLAY panel. INPUT enables audio reactivity. The play controls stop, start and pause the scene. The position slider loops according to Scene LENGTH."
          onClose={() => setPanelTips((tips) => ({ ...tips, play: false }))}
        />
      )}
      {effectTip === "effect" && !startScreen && (
        <PointerTip
          anchor={effectHeader}
          alignTop
          text="This is the editor for a single effect. Click the effect name to toggle its panel. The gray dice icon randomizes all settings for this effect. The X icon removes this effect. The grab handle lets you drag this effect up or down in the stack. FX are applied top-to-bottom."
          onClose={nextEffectTip}
        />
      )}
      {effectTip === "range" && !startScreen && (
        <PointerTip
          anchor={firstRangeName}
          side="above"
          text="This is a single effect setting. Use the slider to change the setting's value. The [] icon toggles this setting between static and ranged values. Ranged values animate according to the scene LENGTH or to an audio slice."
          onClose={nextEffectTip}
        />
      )}
      {rangedTip && !startScreen && (
        <PointerTip
          anchor={rangedRow}
          text="This is a ranged value slider. Drag the handles to set min and max values. Drag inside a range to move the range. Double click the setting name to set range to full. CTRL + drag a handle to move both equally. You can reverse the range, apply an animation easing curve or set a custom loop time for this setting."
          onClose={() => setRangedTip(null)}
        />
      )}
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
          title={openRequest.target === "driver" ? "Open Video for the Driver" : openRequest.target === "picture" ? "Open File for Image or Video" : openRequest.target === "import" ? "Import Scene(s)" : openRequest.kind === "scene" ? "Open Project" : openRequest.kind === "audio" ? "Add Audio Files" : openRequest.slot === 1 ? "Open Image or Video for Source B" : "Open Image or Video"}
          hint={openRequest.target === "import" ? "Choose one or more Kaleido Sage projects (.ksage). All of their scenes go into the open project, without their audio files." : undefined}
          onCancel={() => setOpenRequest(null)}
          onOpen={(path) => {
            setOpenRequest(null);
            if (openRequest.target === "driver") void openDriverVideo(path);
            else if (openRequest.target === "picture") void openPicturePath(path);
            else if (openRequest.target === "import") void importScenes([path]);
            else if (openRequest.kind === "scene") void openProject(path);
            else if (openRequest.kind === "audio") addTracks([path]);
            else void openImagePath(path, openRequest.slot);
          }}
          /* Import Scene(s) takes several projects; Open Project takes one. Several audio files go to the tracks. */
          onOpenMany={openRequest.target === "import" ? (paths) => {
            setOpenRequest(null);
            void importScenes(paths);
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
          screenSize={videoSize(screenAspect())}
          onCancel={() => setVideoDialogOpen(false)}
          onExport={(options) => void exportVideo(options)}
        />
      )}
      {/* The welcome card, over the whole window: the app waits for one of its two buttons. */}
      {welcome && !startScreen && (
        <div className="welcome-overlay" role="presentation">
          <div className="welcome-splash" role="dialog" aria-modal="true" aria-label="Welcome">
            <h2>Welcome to Kaleido Sage</h2>
            <p>Green pointers will show you around the app as you go. You can turn them off now, or later in the Help menu.</p>
            <div className="welcome-splash-buttons">
              <button
                className="button secondary"
                onClick={() => {
                  helpSettings.set({ pointers: false });
                  setWelcome(false);
                }}
              >
                Disable Pointers
              </button>
              <button
                className="button primary"
                onClick={() => {
                  setWelcome(false);
                  setPanelTips(ALL_PANEL_TIPS);
                }}
              >
                Show Me Around
              </button>
            </div>
          </div>
        </div>
      )}
      {shortcutsOpen && <ShortcutsDialog onClose={closeShortcuts} />}
      {aboutOpen && (
        <AboutDialog
          version={appVersion}
          initialUpdateInfo={startupUpdate}
          onClose={() => setAboutOpen(false)}
          beforeInstall={() => askToSaveAll("Kaleido Sage closes to install the update.")}
        />
      )}
      {importQuestion && (
        <ConfirmDialog
          title="Replace Scenes?"
          message={importQuestion.names.length === 1
            ? "The project has a scene with the same name. Replace it with the imported scene, or keep both?"
            : `The project has ${importQuestion.names.length} scenes with the same names. Replace them with the imported scenes, or keep both?`}
          details={<ul>{importQuestion.names.map((name) => <li key={name}>{name}</li>)}</ul>}
          confirmLabel="Replace"
          otherLabel="Keep Both"
          onConfirm={() => {
            importQuestion.answer("replace");
            setImportQuestion(null);
          }}
          onOther={() => {
            importQuestion.answer("both");
            setImportQuestion(null);
          }}
          onCancel={() => {
            importQuestion.answer("cancel");
            setImportQuestion(null);
          }}
        />
      )}
      {/* After the About dialog, so this question shows over it. */}
      {saveQuestion && (
        <ConfirmDialog
          title="Save Changes?"
          message={`${saveQuestion.name} has changes that are not saved. ${saveQuestion.reason}`}
          confirmLabel="Save"
          confirmIcon={<FloppyDisk size={16} weight="bold" />}
          otherLabel="Don't save"
          onConfirm={() => {
            const { answer, save } = saveQuestion;
            setSaveQuestion(null);
            void save().then(answer);
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
