import { stampGlb, type ModelData } from "../engine/model";
import { loadModel } from "./model";

/**
 * 3D models from Sketchfab (sketchfab.com) for the 3D Object's Model
 * shape: a search of the models that their makers let anyone download,
 * and the download of one as a .glb file. The search needs no account. A
 * download needs the user's own Sketchfab API token (a free account gives
 * one); the app sends it only to Sketchfab's API, with the request for a
 * model's download address. Most models need a credit to their maker; the
 * credit goes into the model file (see stampGlb), so the scene keeps it.
 */
const API = "https://api.sketchfab.com/v3";
const TOKEN_KEY = "kaleidosage.sketchfab-token";

/** One model of a search. */
export interface FabModel {
  uid: string;
  name: string;
  author: string;
  /** The license's name, for example "CC Attribution". */
  license: string;
  triangles: number;
  /** The size of its .glb file. */
  bytes: number;
  /** A small picture of the model. */
  thumb: string;
  /** Its page on Sketchfab. */
  page: string;
}

/** Sketchfab's categories, by the names its search takes. */
export const FAB_CATEGORIES = [
  ["", "All categories"], ["science-technology", "Science & Technology"], ["characters-creatures", "Characters & Creatures"], ["cars-vehicles", "Cars & Vehicles"],
  ["weapons-military", "Weapons & Military"], ["architecture", "Architecture"], ["art-abstract", "Art & Abstract"], ["animals-pets", "Animals & Pets"],
  ["nature-plants", "Nature & Plants"], ["cultural-heritage-history", "Cultural Heritage & History"], ["electronics-gadgets", "Electronics & Gadgets"],
  ["furniture-home", "Furniture & Home"], ["fashion-style", "Fashion & Style"], ["food-drink", "Food & Drink"], ["music", "Music"], ["people", "People"],
  ["places-travel", "Places & Travel"], ["sports-fitness", "Sports & Fitness"]
] as const;
/** The licenses to search by. "All free licenses" has some that do not allow use for money or changed copies: each model shows its own. */
export const FAB_LICENSES = [["", "All free licenses"], ["by", "Credit needed (CC BY)"], ["cc0", "No credit needed (CC0)"]] as const;
export const FAB_ORDERS = [["-likeCount", "Most liked"], ["-viewCount", "Most viewed"], ["-publishedAt", "Newest"]] as const;

export interface FabSearch {
  words: string;
  category: string;
  license: string;
  order: string;
  /** Where the next page starts (from the search before), or null for the first page. */
  cursor: string | null;
}

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const amount = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const text = (value: unknown) => typeof value === "string" ? value : "";

/** The models of a search answer that have a .glb file, and where the next page starts (null at the end). */
export function readFabSearch(answer: unknown): { models: FabModel[]; next: string | null } {
  if (!isRecord(answer) || !Array.isArray(answer.results)) throw new Error("Sketchfab's answer could not be read.");
  const models: FabModel[] = [];
  for (const entry of answer.results) {
    if (!isRecord(entry) || typeof entry.uid !== "string" || !/^[0-9a-f]+$/i.test(entry.uid)) continue;
    const glb = isRecord(entry.archives) && isRecord(entry.archives.glb) ? entry.archives.glb : null;
    if (!glb) continue;
    /* The smallest picture that is at least 256 wide, or else the widest. */
    const pictures = (isRecord(entry.thumbnails) && Array.isArray(entry.thumbnails.images) ? entry.thumbnails.images : [])
      .filter((image): image is Json => isRecord(image) && typeof image.url === "string")
      .sort((a, b) => amount(a.width) - amount(b.width));
    const picture = pictures.find((image) => amount(image.width) >= 256) ?? pictures.at(-1);
    const user = isRecord(entry.user) ? entry.user : {};
    models.push({
      uid: entry.uid,
      name: text(entry.name) || "Model",
      author: text(user.displayName) || text(user.username) || "an unknown maker",
      license: isRecord(entry.license) ? text(entry.license.label) : "",
      triangles: amount(glb.faceCount) || amount(entry.faceCount),
      bytes: amount(glb.size),
      thumb: picture ? text(picture.url) : "",
      page: text(entry.viewerUrl) || `https://sketchfab.com/3d-models/${entry.uid}`
    });
  }
  const cursors = isRecord(answer.cursors) ? answer.cursors : {};
  return { models, next: typeof cursors.next === "string" && cursors.next ? cursors.next : null };
}

/** The address of a search: only models that anyone can download. */
export function fabSearchUrl({ words, category, license, order, cursor }: FabSearch): string {
  const query = new URLSearchParams({ type: "models", downloadable: "true", count: "24" });
  if (words.trim()) query.set("q", words.trim());
  if (category) query.set("categories", category);
  if (license) query.set("license", license);
  if (order) query.set("sort_by", order);
  if (cursor) query.set("cursor", cursor);
  return `${API}/search?${query}`;
}

export async function searchSketchfab(search: FabSearch, signal?: AbortSignal) {
  const response = await fetch(fabSearchUrl(search), { signal });
  if (!response.ok) throw new Error(`Sketchfab did not answer (${response.status}).`);
  return readFabSearch(await response.json());
}

/** The credit for a model: its name, maker, license and page. */
export const fabCredit = (model: FabModel) => `"${model.name}" by ${model.author}, ${model.license || "see its page for the license"}, ${model.page}`;

/** The user's Sketchfab API token, kept on this PC ("" when there is none). */
export function fabToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setFabToken(token: string) {
  try {
    if (token.trim()) localStorage.setItem(TOKEN_KEY, token.trim());
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* The token is then asked for again the next time. */ }
}

/** The error of a download that Sketchfab refused for the token: the browser then asks for the token again. */
export class FabTokenError extends Error {}

/**
 * Downloads a model's .glb file and makes it ready for the engine, with
 * its credit in the file. "onProgress" gets the part done, 0 to 1.
 */
export async function loadFabModel(model: FabModel, token: string, onProgress?: (done: number) => void, signal?: AbortSignal): Promise<ModelData> {
  const answer = await fetch(`${API}/models/${model.uid}/download`, { headers: { Authorization: `Token ${token}` }, signal });
  if (answer.status === 401 || answer.status === 403) throw new FabTokenError("Sketchfab did not accept the API token.");
  if (!answer.ok) throw new Error(`Sketchfab did not answer (${answer.status}).`);
  const files: unknown = await answer.json();
  const glb = isRecord(files) && isRecord(files.glb) ? files.glb : null;
  if (!glb || typeof glb.url !== "string") throw new Error("Sketchfab has no .glb file for this model.");
  /* The file is on Sketchfab's own servers or its Amazon storage. The token does not go with this request. */
  const { protocol, hostname } = new URL(glb.url);
  if (protocol !== "https:" || !/(^|\.)(sketchfab\.com|amazonaws\.com)$/.test(hostname)) throw new Error("The model's file is not on Sketchfab.");
  const response = await fetch(glb.url, { signal });
  if (!response.ok || !response.body) throw new Error(`The model's file did not load (${response.status}).`);
  const total = amount(glb.size) || Number(response.headers.get("content-length")) || model.bytes;
  const file = new Uint8Array(await new Response(new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = response.body!.getReader();
      let done = 0;
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        done += part.value.byteLength;
        onProgress?.(total > 0 ? Math.min(1, done / total) : 0);
        controller.enqueue(part.value);
      }
      controller.close();
    }
  })).arrayBuffer());
  return loadModel(stampGlb(file, fabCredit(model)), `${model.name}.glb`);
}
