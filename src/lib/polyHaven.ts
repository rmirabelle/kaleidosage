import { packGlb, type ModelData } from "../engine/model";
import { loadModel } from "./model";

/**
 * Free 3D models from Poly Haven (polyhaven.com) for the 3D Object's Model
 * shape: the list of its models, and the download of one. Every Poly Haven
 * model is CC0: free for any use, with no credit needed. Its API is open
 * to the app, with no key. No detail of the user or the project goes in a
 * request.
 */
const API = "https://api.polyhaven.com";

/** One model of the list. */
export interface HavenModel {
  id: string;
  name: string;
  /** Poly Haven's categories, without its collections ("props", "furniture", "plants"). */
  categories: string[];
  /** The name, the categories and the tags in small letters, for the search. */
  words: string;
  triangles: number;
  downloads: number;
  /** When it came out, in seconds since 1970. */
  published: number;
  /** A small square picture of the model. */
  thumb: string;
}

/** How large the model's pictures are: 1024, 2048 or 4096 pixels wide. */
export type HavenSize = "1k" | "2k" | "4k";
export const HAVEN_SIZES: readonly HavenSize[] = ["1k", "2k", "4k"];

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const texts = (value: unknown): string[] => Array.isArray(value) ? value.filter((each): each is string => typeof each === "string") : [];
const amount = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;

/** The list from Poly Haven's answer; an entry that is not a model description is left out. */
export function readHavenList(answer: unknown): HavenModel[] {
  if (!isRecord(answer)) throw new Error("Poly Haven's list of models could not be read.");
  const models: HavenModel[] = [];
  for (const [id, entry] of Object.entries(answer)) {
    if (!isRecord(entry) || typeof entry.name !== "string") continue;
    const categories = texts(entry.categories).filter((category) => !category.startsWith("collection:"));
    models.push({
      id,
      name: entry.name,
      categories,
      words: [entry.name, id, ...categories, ...texts(entry.tags)].join(" ").toLowerCase(),
      triangles: amount(entry.polycount),
      downloads: amount(entry.download_count),
      published: amount(entry.date_published),
      thumb: `https://cdn.polyhaven.com/asset_img/thumbs/${encodeURIComponent(id)}.png?width=256&height=256&format=webp`
    });
  }
  return models;
}

let listed: Promise<HavenModel[]> | null = null;

/** Every model of Poly Haven. The list is asked for once; a failed try is asked for again. */
export function listHavenModels(): Promise<HavenModel[]> {
  listed ??= (async () => {
    const response = await fetch(`${API}/assets?t=models`);
    if (!response.ok) throw new Error(`Poly Haven did not answer (${response.status}).`);
    return readHavenList(await response.json());
  })();
  listed.catch(() => { listed = null; });
  return listed;
}

/** The models that have every word of "search" (in the name, a category or a tag) and are in "category" ("" for all). */
export function filterHavenModels(models: readonly HavenModel[], search: string, category: string): HavenModel[] {
  const wanted = search.toLowerCase().split(/\s+/).filter(Boolean);
  return models.filter((model) => (!category || model.categories.includes(category)) && wanted.every((word) => model.words.includes(word)));
}

/** The files of a model's glTF form at one picture size: the description's address, and each loose file's address by its name. */
export function readHavenFiles(answer: unknown, size: HavenSize): { url: string; include: [string, string][]; bytes: number } {
  const sizes = isRecord(answer) && isRecord(answer.gltf) ? answer.gltf : {};
  /* The asked size, or the nearest smaller one, or the nearest larger one. */
  const order = [...HAVEN_SIZES.slice(0, HAVEN_SIZES.indexOf(size) + 1).reverse(), ...HAVEN_SIZES.slice(HAVEN_SIZES.indexOf(size) + 1)];
  const entry = order.map((each) => sizes[each]).find((each) => isRecord(each) && isRecord(each.gltf));
  const gltf = isRecord(entry) && isRecord(entry.gltf) ? entry.gltf : null;
  if (!gltf || typeof gltf.url !== "string") throw new Error("Poly Haven has no glTF file for this model.");
  const include: [string, string][] = [];
  let bytes = amount(gltf.size);
  for (const [name, file] of Object.entries(isRecord(gltf.include) ? gltf.include : {})) {
    if (!isRecord(file) || typeof file.url !== "string") continue;
    include.push([name, file.url]);
    bytes += amount(file.size);
  }
  return { url: gltf.url, include, bytes };
}

/** Only Poly Haven's own file servers are read. */
function checked(url: string): string {
  const { protocol, hostname } = new URL(url);
  if (protocol !== "https:" || !/(^|\.)polyhaven\.(org|com)$/.test(hostname)) throw new Error("The model's file is not on Poly Haven.");
  return url;
}

/**
 * Downloads a model with pictures of "size" and makes it ready for the
 * engine: its files are packed into one .glb (see packGlb), which the
 * scene file keeps. "onProgress" gets the part done, 0 to 1.
 */
export async function loadHavenModel(model: Pick<HavenModel, "id" | "name">, size: HavenSize, onProgress?: (done: number) => void, signal?: AbortSignal): Promise<ModelData> {
  const answer = await fetch(`${API}/files/${encodeURIComponent(model.id)}`, { signal });
  if (!answer.ok) throw new Error(`Poly Haven did not answer (${answer.status}).`);
  const { url, include, bytes: total } = readHavenFiles(await answer.json(), size);
  let done = 0;
  const download = async (address: string) => {
    const response = await fetch(checked(address), { signal });
    if (!response.ok) throw new Error(`A file of the model did not load (${response.status}).`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    done += bytes.byteLength;
    onProgress?.(total > 0 ? Math.min(1, done / total) : 0);
    return bytes;
  };
  const [description, ...loose] = await Promise.all([download(url), ...include.map(([, address]) => download(address))]);
  const files = new Map(include.map(([name], index) => [name, loose[index]] as const));
  const glb = packGlb(JSON.parse(new TextDecoder().decode(description)), files);
  return loadModel(glb, `${model.name}.glb`);
}
