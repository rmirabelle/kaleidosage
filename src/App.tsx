import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { ArrowClockwise, ArrowCounterClockwise, ArrowsIn, ArrowsOut, Camera, FilmSlate, FilmStrip, FloppyDisk, Gauge, Info, SignOut, SlidersHorizontal, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AboutDialog } from "./components/AboutDialog";
import { ColorFolder } from "./components/ColorFolder";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ControlPanel } from "./components/ControlPanel";
import { ExportVideoDialog } from "./components/ExportVideoDialog";
import { SourcePanel } from "./components/SourcePanel";
import { StartScreen } from "./components/StartScreen";
import { MenuBar, type Menu } from "./components/MenuBar";
import { OpenDialog, type OpenKind } from "./components/OpenDialog";
import { StatsOverlay } from "./components/StatsOverlay";
import { TitleBar } from "./components/TitleBar";
import { Toolbar } from "./components/Toolbar";
import { Engine } from "./engine/engine";
import { createParams, createPlayState, nudgeParams, randomizeParams, resetEffects } from "./engine/params";
import { SettingsHistory } from "./engine/history";
import { SCENE_EXTENSION, applyScene, blobToSceneImage, sceneFingerprint, serializeScene, type SceneImage } from "./engine/scene";
import { loadSceneMedia, readScene, writeScene } from "./lib/scenes";
import type { ImageSource } from "./engine/renderer";
import {
  makeThumbnail,
  loadImageBlob,
  loadImageFile,
  loadRandomImage
} from "./lib/images";
import { chooseExportPath, fileNameOf, writeExport } from "./lib/exports";
import { PATTERNS, drawPattern, type Pattern } from "./lib/patterns";
import { revealMainWindow } from "./lib/splash";
import { isVideoPath, isVideoType, loadVideoBlob, loadVideoFile, stageVideoBlob, type VideoFile } from "./lib/videos";
import { checkForUpdate, getAppVersion, type UpdateInfo } from "./lib/updater";
import { encodeVideo, videoSize, type VideoOptions } from "./lib/videoExport";

interface Status {
  message: string;
  action?: { label: string; run: () => void };
  /** How long the message stays; 0 keeps it until the next message. */
  duration: number;
  /** Errors stay until closed, and their text can be selected and copied. */
  error?: boolean;
}

const CURSOR_IDLE_MS = 2000;

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

/** The open Open dialog: what it opens, and for an image, which slot gets it. */
interface OpenRequest {
  kind: OpenKind;
  slot: ImageSlot;
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
  const [engine, setEngine] = useState<Engine | null>(null);
  /** Loads started by a closed scene must not reopen it when they finish. */
  const sceneGenerationRef = useRef(0);
  const [sceneGeneration, setSceneGeneration] = useState(0);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
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
  const [status, setStatus] = useState<Status | null>(null);
  const [cursorIdle, setCursorIdle] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [openRequest, setOpenRequest] = useState<OpenRequest | null>(null);
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
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
  const [closeAsked, setCloseAsked] = useState(false);
  const [resetAsked, setResetAsked] = useState(false);
  /**
   * The open "Save changes?" question before an action that replaces the
   * scene (opening a scene, installing an update): its title, the reason,
   * and the answer, true to go on with the action.
   */
  const [saveQuestion, setSaveQuestion] = useState<{ title: string; reason: string; answer: (go: boolean) => void } | null>(null);
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

  const setImage = useCallback((source: ImageSource, { message, blob, videoFile, name, patternId, fromScene }: SetImageOptions = {}, slot: ImageSlot = 0) => {
    if (!engine || sceneGeneration !== sceneGenerationRef.current) return;
    try {
      /**
       * A new second image starts a full fade: dissolve by brightness, over the
       * whole blend range, from image A. Replacing a second image keeps the settings.
       */
      if (slot === 1 && !imagesRef.current[1] && !fromScene) {
        const blend = engine.params.imageBlend;
        Object.assign(blend, { on: true, low: blend.min, high: blend.max });
        engine.startRangeNow("imageBlend");
        engine.state.blendMode = 1;
        setRevision((value) => value + 1);
      }
      engine.setImage(source, slot);
      /* A pattern keeps the image under it; a pattern over a pattern keeps the same image. */
      const previous = imagesRef.current[slot];
      const under = patternId && previous ? (previous.patternId ? previous.under : previous) : undefined;
      const image: SlotImage = { source, blob, videoFile, label: name ?? "Image", thumbnail: makeThumbnail(source), patternId, under, id: nextImageId++ };
      setSlotImage(slot, image);
      setStartScreen(false);
      if (message) showStatus(message);
    } catch (error) {
      showError(`Could not use that image. ${String(error)}`);
    }
  }, [engine, sceneGeneration, setSlotImage, showError, showStatus]);

  const randomImage = useCallback(async (slot: ImageSlot = 0) => {
    showStatus(slot === 0 ? "Loading a random image…" : "Loading a random second image…", 0);
    setRandomLoading(slot);
    try {
      const loaded = await loadRandomImage();
      setImage(loaded.image, { message: loaded.title, blob: loaded.blob, name: loaded.title }, slot);
    } catch (error) {
      const reason = error instanceof Error && error.message.startsWith("The image service") ? error.message : "Check the internet connection.";
      showError(`Could not load a random image. ${reason}`, { label: "Retry", run: () => void randomImageRef.current(slot) });
    } finally {
      setRandomLoading(null);
    }
  }, [setImage, showError, showStatus]);
  /** The Retry button calls the latest copy, so it uses the engine as it is now. */
  const randomImageRef = useRef(randomImage);
  randomImageRef.current = randomImage;

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
      showError(`Could not open the image. ${String(error)}`);
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
    return sceneFingerprint(engine.params, engine.state, [first?.id ?? null, second?.id ?? null]);
  }, [engine]);

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
    const id = window.setInterval(() => setDirty(fingerprint() !== savedFingerprintRef.current), 500);
    return () => window.clearInterval(id);
  }, [engine, fingerprint]);

  /**
   * Save writes to the open scene file without asking; Save As (or a scene
   * that was never saved) asks for a file name first. Returns true when the
   * scene was saved.
   */
  const saveScene = useCallback(async (saveAs = false): Promise<boolean> => {
    if (!engine || !isTauri()) return false;
    const [first, second] = imagesRef.current;
    if (!first) {
      showError("There is no image to save in the scene.");
      return false;
    }
    const sceneMedia = async (image: SlotImage): Promise<SceneImage> => {
      if (!image.videoFile && image.blob && isVideoType(image.blob.type)) {
        image.videoFile = await stageVideoBlob(image.blob);
      }
      if (image.videoFile) return { type: image.videoFile.mime, video: image.videoFile.id };
      const blob = image.blob ?? (image.source instanceof HTMLCanvasElement
        ? await new Promise<Blob | null>((resolve) => (image.source as HTMLCanvasElement).toBlob(resolve, "image/png")) : null);
      if (!blob) throw new Error("There is no image to save in the scene.");
      return blobToSceneImage(blob);
    };
    const current = scenePathRef.current;
    const path = !saveAs && current
      ? current
      : await saveDialog({ defaultPath: current ?? "Scene.ksage", filters: [{ name: "Kaleido Sage scene", extensions: [SCENE_EXTENSION] }] });
    if (!path) return false;
    try {
      /* The fingerprint is taken before the file is written, so a change made while it writes still shows as unsaved. */
      const saved = fingerprint();
      // Capture settings before copying media, so edits during Save remain dirty.
      const scene = JSON.parse(serializeScene(engine.params, engine.state, { image: { type: "image/png", data: "pending" } }));
      showStatus("Saving scene and embedding media…", 0);
      scene.image = await sceneMedia(first);
      if (second) scene.image2 = await sceneMedia(second);
      await writeScene(path, JSON.stringify(scene));
      savedFingerprintRef.current = saved;
      setDirty(fingerprint() !== saved);
      setScenePath(path);
      showStatus(`Saved ${path.split(/[\\/]/).pop()}`);
      return true;
    } catch (error) {
      showError(`Could not save the scene. ${String(error)}`);
      return false;
    }
  }, [engine, fingerprint, showError, showStatus]);

  /* Opening a scene replaces this one, so unsaved changes are saved or given up first. */
  const openScene = useCallback(async () => {
    if (!engine || !isTauri()) return;
    if (!(await askToSave("Save changes before opening a scene?", "Opening another scene replaces it."))) return;
    setOpenRequest({ kind: "scene", slot: 0 });
  }, [askToSave, engine]);

  /**
   * Reads the scene picked in the Open dialog into fresh settings first, and
   * uses them only when the file and its image are both good, so a bad file
   * changes nothing.
   */
  const openScenePath = useCallback(async (path: string) => {
    if (!engine) return;
    const generation = sceneGenerationRef.current;
    try {
      const text = await readScene(path);
      const params = createParams();
      const state = createPlayState();
      const images = applyScene(text, params, state);
      const image = await loadSceneMedia(images.image);
      const image2 = images.image2 ? await loadSceneMedia(images.image2) : null;
      if (generation !== sceneGenerationRef.current) return;
      Object.assign(engine.params, params);
      Object.assign(engine.state, state, { paused: engine.state.paused, locks: engine.state.locks });
      const name = path.split(/[\\/]/).pop();
      setImage(image.source, { message: name, blob: image.blob, videoFile: image.videoFile, name });
      if (image2) setImage(image2.source, { blob: image2.blob, videoFile: image2.videoFile, name: `${name} (second image)`, fromScene: true }, 1);
      else removeSecondImage();
      setRevision((value) => value + 1);
      setScenePath(path);
      markClean();
      historyRef.current?.clear();
    } catch (error) {
      showError(`Could not open the scene. ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [engine, markClean, removeSecondImage, setImage, showError]);

  const randomize = useCallback(() => {
    if (!engine) return;
    randomizeParams(engine.params, engine.state);
    setRevision((value) => value + 1);
    showStatus("New random settings");
  }, [engine, showStatus]);

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
   * down, so a whole slider drag is one step.
   */
  const historyRef = useRef<SettingsHistory | null>(null);
  useEffect(() => {
    if (!engine) return;
    const history = new SettingsHistory(engine.params, engine.state);
    historyRef.current = history;
    let pointerDown = false;
    const down = () => { pointerDown = true; };
    const up = () => { pointerDown = false; };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    window.addEventListener("blur", up);
    const id = window.setInterval(() => { if (!pointerDown) history.commit(); }, 250);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      window.removeEventListener("blur", up);
      historyRef.current = null;
    };
  }, [engine]);

  const undo = useCallback(() => {
    if (historyRef.current?.undo()) setRevision((value) => value + 1);
    else showStatus("Nothing to undo");
  }, [showStatus]);

  const redo = useCallback(() => {
    if (historyRef.current?.redo()) setRevision((value) => value + 1);
    else showStatus("Nothing to redo");
  }, [showStatus]);

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

  const closingSceneRef = useRef(false);
  const closeScene = useCallback(async () => {
    if (!engine || startScreen || closingSceneRef.current) return;
    closingSceneRef.current = true;
    try {
      if (!(await askToSave("Save changes before closing the scene?", "Closing returns to the start screen."))) return;
      if (fullscreen) await exitFullscreen();
      const pattern = PATTERNS.find((candidate) => candidate.id === "checker-large") ?? PATTERNS[0];
      const source = drawPattern(pattern);
      sceneGenerationRef.current++;
      setSceneGeneration(sceneGenerationRef.current);
      engine.stop();
      engine.bypassedGroups.clear();
      engine.soloGroup = null;
      Object.assign(engine.params, createParams());
      Object.assign(engine.state, createPlayState());
      resetEffects(engine.params, engine.state);
      engine.setImage(source);
      engine.clearSecondImage();
      engine.resetTrails();
      setSlotImage(0, { source, label: pattern.label, thumbnail: makeThumbnail(source), patternId: pattern.id, id: nextImageId++ });
      setSlotImage(1, null);
      scenePathRef.current = null;
      setScenePath(null);
      setPaused(false);
      setOpenGroup(null);
      setRandomLoading(null);
      setStatus(null);
      setStartScreen(true);
      setRevision(value => value + 1);
      historyRef.current?.clear();
      markClean();
    } catch (error) {
      showError(`Could not close the scene. ${String(error)}`);
    } finally {
      closingSceneRef.current = false;
    }
  }, [askToSave, engine, exitFullscreen, fullscreen, markClean, setSlotImage, showError, startScreen]);

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
   * Cancel). In a plain browser, the browser's own question shows instead.
   */
  useEffect(() => {
    if (!isTauri()) {
      const onBeforeUnload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) event.preventDefault(); };
      window.addEventListener("beforeunload", onBeforeUnload);
      return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }
    const unlisten = getCurrentWindow().onCloseRequested((event) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      setCloseAsked(true);
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
      if (aboutOpen || openRequest || videoDialogOpen || event.altKey || event.metaKey) return;
      /* The start screen takes only Ctrl+O; the other keys act on a scene that is not shown yet. */
      if (startScreen) {
        if (event.ctrlKey && event.key.toLowerCase() === "o") {
          event.preventDefault();
          void openScene();
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
        const sceneAction = { s: () => saveScene(event.shiftKey), o: openScene, w: closeScene }[key];
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
      const run: Record<string, () => void> = {
        f: () => void toggleFullscreen(),
        f11: () => void toggleFullscreen(),
        escape: () => void exitFullscreen(),
        h: () => setPanelOpen((open) => !open),
        p: () => setStatsOpen((open) => !open),
        " ": event.shiftKey ? stop : togglePause,
        r: () => void randomImage(),
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
  }, [aboutOpen, closeScene, exitFullscreen, nudge, openImage, openRequest, videoDialogOpen, openScene, randomImage, randomize, redo, savePng, saveScene, startScreen, stop, toggleFullscreen, togglePause, undo]);

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
        { label: "Open Image…", icon: <ColorFolder size={18} />, shortcut: "O", run: () => void openImage() },
        { label: "Open Scene…", icon: <FilmSlate size={15} />, shortcut: "Ctrl+O", run: () => void openScene() },
        "separator",
        { label: "Save Scene", disabled: startScreen, icon: <FloppyDisk size={15} />, shortcut: "Ctrl+S", run: () => void saveScene() },
        { label: "Save Scene As…", icon: <FloppyDisk size={15} />, shortcut: "Ctrl+Shift+S", run: () => void saveScene(true) },
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
        "separator",
        { label: "Full Screen", icon: <ArrowsOut size={15} />, shortcut: "F", run: () => void toggleFullscreen() }
      ]
    },
    {
      id: "help",
      label: "Help",
      items: [
        { label: "About Kaleido Sage", icon: <Info size={15} />, run: () => setAboutOpen(true) }
      ]
    }
  ];

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
            fileName={scenePath ? scenePath.split(/[\\/]/).pop() ?? "Untitled" : "Untitled"}
            dirty={dirty}
          />
          <MenuBar menus={menus} />
          {!startScreen && (
            <Toolbar
              onSaveScene={() => void saveScene()}
              statsOpen={statsOpen}
              onToggleStats={() => setStatsOpen((open) => !open)}
              onFullscreen={() => void toggleFullscreen()}
            />
          )}
        </>
      )}
      <div className="workspace">
        {startScreen && <StartScreen onNewScene={() => setStartScreen(false)} onOpenScene={() => void openScene()} />}
        {engine && !startScreen && panelOpen && (
          <SourcePanel
            key={revision}
            engine={engine}
            images={images}
            randomLoading={randomLoading}
            onOpenImage={(slot) => void openImage(slot)}
            onRandomImage={(slot) => void randomImage(slot)}
            onPatternImage={loadPattern}
            onRemoveSecondImage={removeSecondImage}
            onSwapImages={swapImages}
            onRestoreImage={restoreUnderImage}
          />
        )}
        <main className={`stage ${cursorIdle ? "cursor-idle" : ""}`}>
          <canvas ref={canvasRef} onDoubleClick={() => void toggleFullscreen()} />
          {engine && statsOpen && <StatsOverlay engine={engine} />}
          {fullscreen && (
            /* In full screen the title bar and toolbar are gone; these buttons show while the mouse moves. */
            <div className={`fullscreen-controls ${cursorIdle && !panelOpen ? "hidden" : ""}`}>
              <button
                className={panelOpen ? "active" : ""}
                onClick={() => setPanelOpen((open) => !open)}
                title="Settings (H)"
                aria-label="Settings"
                aria-pressed={panelOpen}
              >
                <SlidersHorizontal size={18} />
              </button>
              <button onClick={() => void exitFullscreen()} title="Exit full screen (Esc)" aria-label="Exit full screen">
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
                <button className="status-close" onClick={() => setStatus(null)} aria-label="Close" title="Close">
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
          {dragging && <div className="drop-overlay">Drop the image here</div>}
        </main>
        {engine && !startScreen && panelOpen && (
          <ControlPanel
            /* A change outside the panel (Randomize, Undo, a new scene) makes a new panel, so all of its state reloads. */
            key={`controls-${revision}`}
            engine={engine}
            openGroup={openGroup}
            onOpenGroup={setOpenGroup}
            paused={paused}
            onRandomize={randomize}
            onNudge={nudge}
            onTogglePause={togglePause}
            onStop={stop}
            onReset={() => setResetAsked(true)}
            hasVideo={images.some((image) => image?.source instanceof HTMLVideoElement)}
          />
        )}
      </div>
      {closeAsked && (
        <ConfirmDialog
          title="Save changes before closing?"
          message={`${scenePath ? scenePath.split(/[\\/]/).pop() : "This scene"} has changes that are not saved.`}
          confirmLabel="Save"
          otherLabel="Don't save"
          onConfirm={() => {
            setCloseAsked(false);
            void saveScene().then((saved) => { if (saved) void getCurrentWindow().destroy(); });
          }}
          onOther={() => void getCurrentWindow().destroy()}
          onCancel={() => setCloseAsked(false)}
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
          title={openRequest.kind === "scene" ? "Open Scene" : openRequest.slot === 1 ? "Open Second Image" : "Open Image"}
          onCancel={() => setOpenRequest(null)}
          onOpen={(path) => {
            setOpenRequest(null);
            if (openRequest.kind === "scene") void openScenePath(path);
            else void openImagePath(path, openRequest.slot);
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
      {aboutOpen && (
        <AboutDialog
          version={appVersion}
          initialUpdateInfo={startupUpdate}
          onClose={() => setAboutOpen(false)}
          beforeInstall={() => askToSave("Save changes before updating?", "Kaleido Sage closes to install the update.")}
        />
      )}
      {/* After the About dialog, so this question shows over it. */}
      {saveQuestion && (
        <ConfirmDialog
          title={saveQuestion.title}
          message={`${scenePath ? scenePath.split(/[\\/]/).pop() : "This scene"} has changes that are not saved. ${saveQuestion.reason}`}
          confirmLabel="Save"
          otherLabel="Don't save"
          onConfirm={() => {
            const { answer } = saveQuestion;
            setSaveQuestion(null);
            void saveScene().then(answer);
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
