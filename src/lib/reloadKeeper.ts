import type { VideoFile } from "./videos";

/**
 * Dev only: keeps the open scenes across a reload of the window. An edit of
 * the engine (src/engine/engine.ts or a module it imports) reloads the dev
 * window, and so does the crash screen's recovery; without this, every
 * open scene and its unsaved changes would be lost.
 *
 * About once a second, and when the page unloads, App's snapshot of its
 * tabs goes to sessionStorage (it lives as long as the window, so a new
 * start of the app begins as usual). The settings are small text; the
 * image bytes go to IndexedDB once per image, when the image first shows
 * up in a snapshot. After the reload, App reads the snapshot and opens the
 * tabs again (see the start-up effect in App.tsx).
 */

/** One image slot: a native video stream (it outlives the reload), or image or video bytes in IndexedDB. */
export interface KeptImage {
  key?: string;
  video?: VideoFile;
  label: string;
  patternId?: string;
}

/** One open tab: its file, unsaved mark, settings (scene text), images and Driver video. */
export interface KeptDoc {
  id: number;
  path: string | null;
  untitled: number;
  dirty: boolean;
  scene: string;
  images: [KeptImage | null, KeptImage | null];
  driver: { video: VideoFile; name: string } | null;
  /** The Image or Video effect's image or video; missing in a snapshot from before the Image or Video effect. */
  picture?: KeptImage | null;
  openGroup: string | null;
}

/**
 * The open Kaleido Sage file: its path (null while never saved), its saved
 * fingerprint, and its tracks (the open file's copies in the temp folder,
 * which outlive the reload). Song follow comes back too: on or off, the
 * count of song map edits, and each track's analysis (with its song map
 * and slice picks), whose text is in IndexedDB by key (see keepAnalyses).
 */
export interface KeptFile {
  path: string | null;
  saved: string;
  tracks: string[];
  songFollow?: boolean;
  followEdits?: number;
  analyses?: Record<string, string>;
}

export interface Kept {
  docs: KeptDoc[];
  activeId: number | null;
  /** Missing in a snapshot from before the one file type. */
  file?: KeptFile;
}

/** An image as App keeps it: what the keeper needs to store its bytes. */
interface ImageLike {
  source: unknown;
  blob?: Blob;
  videoFile?: VideoFile;
  label: string;
  patternId?: string;
}

const STORE_KEY = "kaleidosage.kept-scenes";
const DB_NAME = "kaleidosage-kept";
const BLOBS = "blobs";
const KEEP_MS = 1000;

const enabled = import.meta.env.DEV && typeof indexedDB !== "undefined";

let database: Promise<IDBDatabase> | null = null;
const openDatabase = () => database ??= new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(BLOBS);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

/** Runs one request on the blob store and waits for its transaction to finish. */
async function blobStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(BLOBS, mode);
    const request = run(transaction.objectStore(BLOBS));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
  });
}

/** The IndexedDB key of each image whose bytes are stored or being stored. */
const imageKeys = new WeakMap<object, string>();
/** The keys this page uses or made; pruning leaves them, since their snapshot may not be written yet. */
const keysHere = new Set<string>();

/** A restored image keeps the key of its stored bytes, so they are not stored again. */
export function adoptImage(image: object, key: string) {
  imageKeys.set(image, key);
  keysHere.add(key);
}

/** The bytes of an image: its file bytes, or a PNG of a drawn canvas (a test pattern). */
async function imageBytes(image: ImageLike): Promise<Blob | null> {
  if (image.blob) return image.blob;
  if (image.source instanceof HTMLCanvasElement) {
    const canvas = image.source;
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  }
  return null;
}

/** An image for the snapshot. The first time, its bytes start to go to IndexedDB in the background. */
export function keepImage(image: ImageLike | null): KeptImage | null {
  if (!image) return null;
  const kept: KeptImage = { label: image.label, patternId: image.patternId };
  if (image.videoFile) return { ...kept, video: image.videoFile };
  let key = imageKeys.get(image);
  if (!key) {
    key = crypto.randomUUID();
    adoptImage(image, key);
    const storing = key;
    void imageBytes(image)
      .then((blob) => blob && blobStore("readwrite", (store) => store.put(blob, storing)))
      .catch(() => { imageKeys.delete(image); });
  }
  return { ...kept, key };
}

/** The stored bytes of a kept image, or null when they never made it to IndexedDB. */
export async function keptImageBytes(key: string): Promise<Blob | null> {
  try {
    const blob = await blobStore<unknown>("readonly", (store) => store.get(key));
    return blob instanceof Blob ? blob : null;
  } catch {
    return null;
  }
}

/** Each track's stored analysis: the analysis and its song map as they were stored, and the key of their text. */
const analysisKeys = new Map<string, { analysis: object; edits: unknown; key: string }>();

/**
 * Each track's song analysis for the snapshot: its key in IndexedDB, by
 * path. An analysis can be megabytes, so its text is made and stored again
 * only when the analysis or its song map (mapEdits, which a map edit or a
 * slice pick replaces) is another one. The key of the text it replaces is
 * let go, so pruning can remove it.
 */
export function keepAnalyses(paths: readonly string[], analysisOf: (path: string) => { mapEdits?: unknown } | undefined): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const path of paths) {
    const analysis = analysisOf(path);
    if (!analysis) continue;
    let kept = analysisKeys.get(path);
    if (!kept || kept.analysis !== analysis || kept.edits !== analysis.mapEdits) {
      if (kept) keysHere.delete(kept.key);
      const key = crypto.randomUUID();
      keysHere.add(key);
      void blobStore("readwrite", (store) => store.put(new Blob([JSON.stringify(analysis)], { type: "application/json" }), key)).catch(() => {});
      kept = { analysis, edits: analysis.mapEdits, key };
      analysisKeys.set(path, kept);
    }
    keys[path] = kept.key;
  }
  return keys;
}

/** The text of a kept analysis, or null when it never made it to IndexedDB. */
export async function keptAnalysisText(key: string): Promise<string | null> {
  const blob = await keptImageBytes(key);
  return blob ? blob.text() : null;
}

/** The snapshot left by the page before this one, or null. */
export function readKept(): Kept | null {
  if (!enabled) return null;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "null") as Kept | null;
    return parsed && Array.isArray(parsed.docs) && parsed.docs.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

let snapshot: (() => Kept | null) | null = null;
let timer = 0;

const writeKept = () => {
  if (!snapshot) return;
  try {
    const kept = snapshot();
    if (kept) sessionStorage.setItem(STORE_KEY, JSON.stringify(kept));
  } catch {
    /* A snapshot that cannot be taken or stored keeps the one before it. */
  }
};

/**
 * Starts keeping App's tabs, or gives the keeper a new snapshot function
 * (App's effects run again after each hot update). Bytes of images that
 * no snapshot uses any more are removed now and then.
 */
export function keepScenes(take: () => Kept | null) {
  if (!enabled) return;
  snapshot = take;
  if (timer) return;
  timer = window.setInterval(writeKept, KEEP_MS);
  window.addEventListener("pagehide", writeKept);
  window.addEventListener("beforeunload", writeKept);
  window.setInterval(() => void pruneImages(), 60_000);
}

/** Removes the stored bytes that neither the latest snapshot nor this page uses (those of a page before this one). */
async function pruneImages() {
  const kept = readKept();
  const used = new Set([...keysHere, ...(kept?.docs ?? []).flatMap((doc) => doc.images.map((image) => image?.key)), ...Object.values(kept?.file?.analyses ?? {})].filter(Boolean));
  try {
    const keys = await blobStore<IDBValidKey[]>("readonly", (store) => store.getAllKeys());
    for (const key of keys) if (typeof key === "string" && !used.has(key)) await blobStore("readwrite", (store) => store.delete(key));
  } catch {
    /* The bytes stay until the next try. */
  }
}
