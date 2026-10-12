import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { ArrowsIn, SlidersHorizontal, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AboutDialog } from "./components/AboutDialog";
import { ControlPanel } from "./components/ControlPanel";
import { StatsOverlay } from "./components/StatsOverlay";
import { TitleBar } from "./components/TitleBar";
import { Toolbar } from "./components/Toolbar";
import { Engine } from "./engine/engine";
import { createParams, createPlayState, randomizeParams } from "./engine/params";
import { SCENE_EXTENSION, applyScene, blobToSceneImage, sceneImageToBlob, serializeScene } from "./engine/scene";
import type { ImageSource } from "./engine/renderer";
import {
  IMAGE_EXTENSIONS,
  fallbackImage,
  loadImageBlob,
  loadImageFile,
  loadRandomImage,
  saveSnapshot
} from "./lib/images";
import { drawPattern, type Pattern } from "./lib/patterns";
import { checkForUpdate, getAppVersion, type UpdateInfo } from "./lib/updater";

interface Status {
  message: string;
  action?: { label: string; run: () => void };
  /** How long the message stays; 0 keeps it until the next message. */
  duration: number;
  /** Errors stay until closed, and their text can be selected and copied. */
  error?: boolean;
}

const CURSOR_IDLE_MS = 2000;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** The current image's original file bytes (or the built-in pattern), for Save scene. */
  const imageSourceRef = useRef<Blob | HTMLCanvasElement | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [statsOpen, setStatsOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<Status | null>(null);
  const [cursorIdle, setCursorIdle] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const [startupUpdate, setStartupUpdate] = useState<UpdateInfo | null>(null);

  const showStatus = useCallback((message: string, duration = 2500, action?: Status["action"]) => {
    setStatus({ message, duration, action });
  }, []);

  const showError = useCallback((message: string) => {
    setStatus({ message, duration: 0, error: true });
  }, []);

  useEffect(() => {
    if (!status?.duration) return;
    const id = window.setTimeout(() => setStatus(null), status.duration);
    return () => window.clearTimeout(id);
  }, [status]);

  const setImage = useCallback((source: ImageSource, message?: string, original?: Blob) => {
    if (!engine) return;
    try {
      engine.setImage(source);
      imageSourceRef.current = original ?? (source instanceof HTMLCanvasElement ? source : null);
      if (message) showStatus(message);
    } catch (error) {
      showError(`Could not use that image. ${String(error)}`);
    }
  }, [engine, showError, showStatus]);

  const randomImage = useCallback(async () => {
    showStatus("Loading a random image…", 0);
    try {
      const loaded = await loadRandomImage();
      setImage(loaded.image, "New image", loaded.blob);
    } catch {
      showError("Could not load a random image. Check the internet connection.");
    }
  }, [setImage, showError, showStatus]);

  const openImage = useCallback(async () => {
    if (!isTauri()) return;
    const path = await open({ multiple: false, directory: false, filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }] });
    if (typeof path !== "string") return;
    try {
      const loaded = await loadImageFile(path);
      setImage(loaded.image, path.split(/[\\/]/).pop(), loaded.blob);
    } catch (error) {
      showError(`Could not open the image. ${String(error)}`);
    }
  }, [setImage, showError, showStatus]);

  /** Draws a test pattern at 4K. The status shows first, because drawing takes a moment. */
  const loadPattern = useCallback((pattern: Pattern) => {
    showStatus(`Drawing ${pattern.label.toLowerCase()}…`, 0);
    requestAnimationFrame(() => setTimeout(() => setImage(drawPattern(pattern), pattern.label), 0));
  }, [setImage, showStatus]);

  const loadBlob = useCallback(async (blob: Blob | null | undefined, name?: string) => {
    if (!blob || !blob.type.startsWith("image/")) return;
    try {
      setImage(await loadImageBlob(blob), name || "Image loaded", blob);
    } catch {
      showError("Could not read that image.");
    }
  }, [setImage, showError, showStatus]);

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
      const path = await saveSnapshot(blob);
      showStatus("Saved to Pictures\\Kaleido Sage", 5000, {
        label: "Show",
        run: () => void invoke("reveal_file", { path }).catch((error) => showError(String(error)))
      });
    } catch (error) {
      showError(`Could not save the PNG. ${String(error)}`);
    }
  }, [engine, showError, showStatus]);

  const saveScene = useCallback(async () => {
    if (!engine || !isTauri()) return;
    const original = imageSourceRef.current;
    const blob = original instanceof HTMLCanvasElement
      ? await new Promise<Blob | null>((resolve) => original.toBlob(resolve, "image/png"))
      : original;
    if (!blob) {
      showError("There is no image to save in the scene.");
      return;
    }
    const path = await saveDialog({ defaultPath: "Scene.ksage", filters: [{ name: "Kaleido Sage scene", extensions: [SCENE_EXTENSION] }] });
    if (!path) return;
    try {
      const contents = serializeScene(engine.params, engine.state, await blobToSceneImage(blob));
      await invoke("save_scene", { path, contents });
      showStatus(`Saved ${path.split(/[\\/]/).pop()}`);
    } catch (error) {
      showError(`Could not save the scene. ${String(error)}`);
    }
  }, [engine, showError, showStatus]);

  /**
   * Reads the scene into fresh settings first, and uses them only when the
   * file and its image are both good, so a bad file changes nothing.
   */
  const openScene = useCallback(async () => {
    if (!engine || !isTauri()) return;
    const path = await open({ multiple: false, directory: false, filters: [{ name: "Kaleido Sage scene", extensions: [SCENE_EXTENSION] }] });
    if (typeof path !== "string") return;
    try {
      const text = await invoke<string>("read_scene", { path });
      const params = createParams();
      const state = createPlayState();
      const blob = sceneImageToBlob(applyScene(text, params, state));
      const image = await loadImageBlob(blob);
      Object.assign(engine.params, params);
      Object.assign(engine.state, state, { paused: engine.state.paused });
      setImage(image, path.split(/[\\/]/).pop(), blob);
      setRevision((value) => value + 1);
    } catch (error) {
      showError(`Could not open the scene. ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [engine, setImage, showError]);

  const randomize = useCallback(() => {
    if (!engine) return;
    randomizeParams(engine.params, engine.state);
    setRevision((value) => value + 1);
    showStatus("New random settings");
  }, [engine, showStatus]);

  const stop = useCallback(() => {
    if (!engine) return;
    engine.rewind();
    setPaused(true);
    showStatus("Stopped: every range is at its minimum");
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

  /** Start the engine with a placeholder pattern, then load a random photo. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let created: Engine;
    try {
      created = new Engine(canvas);
    } catch (error) {
      setFatalError(String(error instanceof Error ? error.message : error));
      return;
    }
    const placeholder = fallbackImage();
    created.setImage(placeholder);
    imageSourceRef.current = placeholder;
    created.start();
    setEngine(created);
    return () => created.stop();
  }, []);

  useEffect(() => {
    /* Only once, when the engine is ready; randomImage changes with engine. */
    if (engine) void randomImage();
  }, [engine]);

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
      if (aboutOpen || event.altKey || event.metaKey) return;
      if (event.ctrlKey) {
        const sceneAction = { s: saveScene, o: openScene }[event.key.toLowerCase()];
        if (sceneAction) {
          event.preventDefault();
          void sceneAction();
        }
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "SELECT") return;
      const key = event.key.toLowerCase();
      const run: Record<string, () => void> = {
        f: () => void toggleFullscreen(),
        f11: () => void toggleFullscreen(),
        escape: () => void exitFullscreen(),
        h: () => setPanelOpen((open) => !open),
        p: () => setStatsOpen((open) => !open),
        " ": togglePause,
        r: () => void randomImage(),
        o: () => void openImage(),
        x: randomize,
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
  }, [aboutOpen, exitFullscreen, openImage, openScene, randomImage, randomize, savePng, saveScene, toggleFullscreen, togglePause]);

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

  return (
    <div
      className={`app ${fullscreen ? "fullscreen" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => { if (!event.relatedTarget) setDragging(false); }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        void loadBlob(file, file?.name);
      }}
    >
      {!fullscreen && (
        <>
          <TitleBar updateAvailable={Boolean(startupUpdate)} onAbout={() => setAboutOpen(true)} />
          <Toolbar
            onRandomImage={() => void randomImage()}
            onOpenImage={() => void openImage()}
            onPattern={loadPattern}
            onSave={() => void savePng()}
            onOpenScene={() => void openScene()}
            onSaveScene={() => void saveScene()}
            statsOpen={statsOpen}
            onToggleStats={() => setStatsOpen((open) => !open)}
            onFullscreen={() => void toggleFullscreen()}
          />
        </>
      )}
      <main className={`stage ${cursorIdle ? "cursor-idle" : ""}`}>
        <canvas ref={canvasRef} onDoubleClick={() => void toggleFullscreen()} />
        {engine && panelOpen && (
          <ControlPanel engine={engine} revision={revision} paused={paused} onRandomize={randomize} onTogglePause={togglePause} onStop={stop} />
        )}
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
        {dragging && <div className="drop-overlay">Drop the image here</div>}
      </main>
      {aboutOpen && (
        <AboutDialog version={appVersion} initialUpdateInfo={startupUpdate} onClose={() => setAboutOpen(false)} />
      )}
    </div>
  );
}
