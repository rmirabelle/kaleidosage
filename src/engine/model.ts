/**
 * The 3D Object's Model shape: a 3D model file (glTF 2.0 in its one-file
 * binary form, .glb) read into triangles, materials and pictures that the
 * renderer draws (see docs/SOLIDS.md, "A model from a file").
 *
 * What is read: every mesh of the file's scene, at its place (each node's
 * move, turn and size are worked into the corners), as triangles, with
 * each corner's direction, its places in the material's pictures (up to two
 * UV sets per material), and vertex colors (COLOR_0). Of a material: its
 * color and color picture (both pbrMetallicRoughness and legacy
 * KHR_materials_pbrSpecularGlossiness), its bump picture (the normal map),
 * its roughness/metal or specular/glossiness values and picture, its UV
 * transforms (KHR_texture_transform), its own light (with emissive
 * strength), unlit flag (KHR_materials_unlit), and its cut-out level. Not
 * read: bones and motion (the model stands as it was made), morph shapes,
 * and packed files (Draco, Meshopt, KTX2), which give a clear error.
 *
 * The model is moved and sized to fit a ball of radius 1 around the middle
 * of its box, as the other shapes do.
 */

/** A material's picture: which image, and how it repeats past its edges each way (the WebGL wrap value: repeat, clamp or mirrored repeat). */
export interface ModelTexture {
  image: number;
  wrapS: number;
  wrapT: number;
}

/** Column-major 3 by 3 UV transform matrix (KHR_texture_transform). */
export type UvMatrix = readonly [number, number, number, number, number, number, number, number, number];
const IDENTITY_UV: UvMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** A material. A texture is an index in ModelShape.textures, or null for none. */
export interface ModelMaterial {
  /** The color (red, green, blue, cover), 0 to 1; a color picture is multiplied by it. */
  color: [number, number, number, number];
  colorTexture: number | null;
  normalTexture: number | null;
  normalScale: number;
  /** For metallic-roughness: green is roughness and blue is metal. For specGloss: RGB is specular and alpha is glossiness. */
  roughTexture: number | null;
  /** Roughness factor (0 to 1), or glossiness factor when specGloss is true. */
  roughness: number;
  metallic: number;
  /** True when the material comes from KHR_materials_pbrSpecularGlossiness. */
  specGloss: boolean;
  /** Specular color factor (RGB, 0 to 1) when specGloss is true. */
  specular: [number, number, number];
  /** True when the material uses KHR_materials_unlit (ignores scene lighting). */
  unlit: boolean;
  emissive: [number, number, number];
  emissiveTexture: number | null;
  /** A cover below this is not drawn (leaves, fences); 0 draws all. */
  cutoff: number;
  /** Which vertex UV set (0 or 1) each texture reads: color, normal, rough, emissive. */
  uvSets: [0 | 1, 0 | 1, 0 | 1, 0 | 1];
  /** Column-major 3 by 3 UV transform for each texture: color, normal, rough, emissive. */
  uvTransforms: [UvMatrix, UvMatrix, UvMatrix, UvMatrix];
}

/** The triangles of one material: 14 numbers per corner (place 3, direction 3, uv0 2, uv1 2, color 4), and 3 corner numbers per triangle. */
export interface ModelPart {
  material: number;
  vertices: Float32Array;
  indices: Uint32Array;
}

/** An image file inside the model (PNG, JPEG or WebP), as its bytes. */
export interface ModelImage {
  bytes: Uint8Array;
  type: string;
}

export interface ModelShape {
  parts: ModelPart[];
  materials: ModelMaterial[];
  textures: ModelTexture[];
  images: ModelImage[];
  triangles: number;
  /** The file's own zero point (the pivot its maker set, often at the base), in the frame of the corners: the model's box has its middle at 0, 0, 0. */
  origin: [number, number, number];
  /** Who made the model and its license, when the file says so (see modelCredit); null when it does not. */
  credit: string | null;
}

/**
 * A loaded model, as the scene owns it and the renderer draws it: the
 * file's bytes (the scene file keeps them), what was read from them, and
 * each image decoded (null for one that the browser cannot read). "id" is
 * for the unsaved-changes check.
 */
export interface ModelData {
  id: number;
  name: string;
  file: Uint8Array;
  shape: ModelShape;
  pictures: (ImageBitmap | null)[];
}

/** Numbers per corner in ModelPart.vertices: pos(3), normal(3), uv0(2), uv1(2), color(4). */
export const MODEL_STRIDE = 14;

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const REPEAT = 10497;

/** The extensions a file can require that change nothing here, or only looks that are not read. */
const KNOWN_EXTENSION = /^(KHR_mesh_quantization|KHR_texture_transform|KHR_lights_punctual|KHR_materials_\w+|EXT_texture_webp|EXT_texture_avif|KHR_xmp_json_ld)$/;
const PACKED: Record<string, string> = {
  KHR_draco_mesh_compression: "Draco",
  EXT_meshopt_compression: "Meshopt",
  KHR_texture_basisu: "KTX2"
};

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const list = (value: unknown): Json[] => Array.isArray(value) ? value.filter(isRecord) : [];
const whole = (value: unknown): number | null => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
const numbers = (value: unknown, count: number): number[] | null =>
  Array.isArray(value) && value.length === count && value.every((each) => typeof each === "number" && Number.isFinite(each)) ? value as number[] : null;
const number = (value: unknown, otherwise: number) => typeof value === "number" && Number.isFinite(value) ? value : otherwise;

/** A 4 by 4 matrix, column by column (as glTF and WebGL write it). */
type Matrix = number[];
const IDENTITY: Matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a: Matrix, b: Matrix): Matrix {
  const out = new Array<number>(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[column * 4 + k];
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

/** A node's own matrix: the one it gives, or its move, turn (a quaternion) and size. */
function nodeMatrix(node: Json): Matrix {
  const given = numbers(node.matrix, 16);
  if (given) return given;
  const [tx, ty, tz] = numbers(node.translation, 3) ?? [0, 0, 0];
  const [x, y, z, w] = numbers(node.rotation, 4) ?? [0, 0, 0, 1];
  const [sx, sy, sz] = numbers(node.scale, 3) ?? [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1
  ];
}

/** The parts of a .glb file: its JSON text as an object, and its binary block (empty when it has none). */
function splitGlb(bytes: Uint8Array): { json: Json; bin: Uint8Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) throw new Error("This is not a .glb model file.");
  if (view.getUint32(4, true) !== 2) throw new Error("Only glTF version 2 models can be read.");
  let json: Json | null = null;
  let bin = new Uint8Array(0);
  let at = 12;
  while (at + 8 <= bytes.byteLength) {
    const length = view.getUint32(at, true);
    const kind = view.getUint32(at + 4, true);
    const start = at + 8;
    if (start + length > bytes.byteLength) throw new Error("The model file is cut short.");
    if (kind === CHUNK_JSON && !json) {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + length)));
      if (!isRecord(parsed)) throw new Error("The model file's description is broken.");
      json = parsed;
    } else if (kind === CHUNK_BIN && bin.byteLength === 0) {
      bin = bytes.subarray(start, start + length);
    }
    at = start + length + ((4 - (length % 4)) % 4);
  }
  if (!json) throw new Error("The model file has no description.");
  return { json, bin };
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
/** Each number type: its bytes, how to read one, and the largest value (for types that stand for 0 to 1 or -1 to 1). */
const TYPES: Record<number, { bytes: number; read: (view: DataView, at: number) => number; most: number }> = {
  5120: { bytes: 1, read: (view, at) => view.getInt8(at), most: 127 },
  5121: { bytes: 1, read: (view, at) => view.getUint8(at), most: 255 },
  5122: { bytes: 2, read: (view, at) => view.getInt16(at, true), most: 32767 },
  5123: { bytes: 2, read: (view, at) => view.getUint16(at, true), most: 65535 },
  5125: { bytes: 4, read: (view, at) => view.getUint32(at, true), most: 4294967295 },
  5126: { bytes: 4, read: (view, at) => view.getFloat32(at, true), most: 1 }
};

/** Reads the model file's lists of numbers (its "accessors"). */
class Reader {
  private readonly accessors: Json[];
  private readonly views: Json[];
  private readonly buffers: (Uint8Array | null)[];

  constructor(json: Json, bin: Uint8Array) {
    this.accessors = list(json.accessors);
    this.views = list(json.bufferViews);
    /* Only the file's own binary block and data: URIs are read; a file beside the model is not. */
    this.buffers = list(json.buffers).map((buffer, index) => {
      if (typeof buffer.uri !== "string") return index === 0 ? bin : null;
      return dataUri(buffer.uri)?.bytes ?? null;
    });
  }

  /** The bytes of a buffer view, or null when it is missing or out of range. */
  viewBytes(index: unknown): Uint8Array | null {
    const view = this.views[whole(index) ?? -1];
    if (!view) return null;
    const buffer = this.buffers[whole(view.buffer) ?? -1];
    const start = whole(view.byteOffset ?? 0);
    const length = whole(view.byteLength);
    if (!buffer || start === null || length === null || start + length > buffer.byteLength) return null;
    return buffer.subarray(start, start + length);
  }

  /**
   * A list as plain numbers, "width" numbers per item (missing ones are 0),
   * or null when the file has no such list. A list with no data is all 0,
   * as the format says.
   */
  read(index: unknown, width: number, forceNormalize = false): { values: Float32Array | Uint32Array; count: number; parts: number } | null {
    const accessor = this.accessors[whole(index) ?? -1];
    if (!accessor) return null;
    const count = whole(accessor.count);
    const type = TYPES[whole(accessor.componentType) ?? -1];
    const parts = COMPONENTS[String(accessor.type)];
    if (count === null || !type || !parts) throw new Error("The model file has a list of numbers of an unknown kind.");
    const values = type.bytes === 4 && type.most !== 1 ? new Uint32Array(count * width) : new Float32Array(count * width);
    if (accessor.bufferView === undefined) return { values, count, parts };
    const view = this.views[whole(accessor.bufferView) ?? -1];
    const bytes = this.viewBytes(accessor.bufferView);
    if (!view || !bytes) throw new Error("The model file's data is missing or cut short.");
    const stride = whole(view.byteStride) || type.bytes * parts;
    const start = whole(accessor.byteOffset ?? 0) ?? 0;
    if (count > 0 && start + (count - 1) * stride + type.bytes * parts > bytes.byteLength) throw new Error("The model file's data is cut short.");
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const scale = (accessor.normalized === true || forceNormalize) && type.most !== 1 ? 1 / type.most : 1;
    const take = Math.min(width, parts);
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < take; k++) {
        const value = type.read(data, start + i * stride + k * type.bytes);
        values[i * width + k] = scale === 1 ? value : Math.max(-1, value * scale);
      }
    }
    return { values, count, parts };
  }
}

/** The bytes and type of a data: URI in base64, or null for any other address. */
function dataUri(uri: string): ModelImage | null {
  const match = /^data:([^;,]*)(;base64)?,/.exec(uri);
  if (!match || !match[2]) return null;
  const text = atob(uri.slice(match[0].length));
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return { bytes, type: match[1] };
}

/** An image's MIME type from its magic bytes, or null when not recognized. */
function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.byteLength >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.byteLength >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  if (bytes.byteLength >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70 && bytes[8] === 0x61 && bytes[9] === 0x76 && bytes[10] === 0x69 && (bytes[11] === 0x66 || bytes[11] === 0x73)) return "image/avif";
  if (bytes.byteLength >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
  if (bytes.byteLength >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
  return null;
}

/** An image's type from its first bytes, for a file that does not name it. */
function imageType(bytes: Uint8Array): string {
  return sniffImageType(bytes) ?? "image/jpeg";
}

function normalizeMime(mime: unknown): string {
  if (typeof mime !== "string") return "";
  const trimmed = mime.trim().toLowerCase();
  return trimmed === "image/jpg" ? "image/jpeg" : trimmed;
}

/** Linear 0..1 color channel to sRGB 0..1 (glTF stores COLOR_0 in linear light). */
function linearToSrgb(value: number): number {
  const c = Math.max(0, Math.min(1, value));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

interface RawSlot {
  index: number | null;
  texCoord: number;
  transform: UvMatrix;
}

/** Column-major 3 by 3 matrix from a KHR_texture_transform block (translation * rotation * scale). */
function uvTransform(ext: Json): UvMatrix {
  const [ox, oy] = numbers(ext.offset, 2) ?? [0, 0];
  const [sx, sy] = numbers(ext.scale, 2) ?? [1, 1];
  const r = number(ext.rotation, 0);
  if (ox === 0 && oy === 0 && sx === 1 && sy === 1 && r === 0) return IDENTITY_UV;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c * sx || 0, s * sx || 0, 0, -s * sy || 0, c * sy || 0, 0, ox, oy, 1];
}

function readTextureSlot(info: unknown, textureCount: number): RawSlot {
  if (!isRecord(info)) return { index: null, texCoord: 0, transform: IDENTITY_UV };
  const index = whole(info.index);
  if (index === null || index >= textureCount) return { index: null, texCoord: 0, transform: IDENTITY_UV };
  const tr = isRecord(info.extensions) && isRecord(info.extensions.KHR_texture_transform) ? info.extensions.KHR_texture_transform : null;
  const texCoord = (tr ? whole(tr.texCoord) : null) ?? whole(info.texCoord) ?? 0;
  return { index, texCoord, transform: tr ? uvTransform(tr) : IDENTITY_UV };
}

function readMaterial(material: Json, textureCount: number, placed: (index: number | null) => number | null): { material: ModelMaterial; uvChannels: [number, number] } {
  const ext = isRecord(material.extensions) ? material.extensions : null;
  const specGloss = ext && isRecord(ext.KHR_materials_pbrSpecularGlossiness) ? ext.KHR_materials_pbrSpecularGlossiness : null;
  const unlit = Boolean(ext && isRecord(ext.KHR_materials_unlit));
  const emissiveStrength = ext && isRecord(ext.KHR_materials_emissive_strength) ? Math.max(0, number(ext.KHR_materials_emissive_strength.emissiveStrength, 1)) : 1;
  const pbr = isRecord(material.pbrMetallicRoughness) ? material.pbrMetallicRoughness : {};
  const color = specGloss
    ? numbers(specGloss.diffuseFactor, 4) ?? [1, 1, 1, 1]
    : numbers(pbr.baseColorFactor, 4) ?? [1, 1, 1, 1];
  const specular = specGloss ? numbers(specGloss.specularFactor, 3) ?? [1, 1, 1] : [1, 1, 1];
  const emissive = numbers(material.emissiveFactor, 3) ?? [0, 0, 0];
  const mode = material.alphaMode;
  const rawSlots: [RawSlot, RawSlot, RawSlot, RawSlot] = [
    readTextureSlot(specGloss ? specGloss.diffuseTexture : pbr.baseColorTexture, textureCount),
    readTextureSlot(material.normalTexture, textureCount),
    readTextureSlot(specGloss ? specGloss.specularGlossinessTexture : pbr.metallicRoughnessTexture, textureCount),
    readTextureSlot(material.emissiveTexture, textureCount)
  ];
  const resolved = rawSlots.map((slot) => ({ ...slot, index: placed(slot.index) }));
  /* Up to two distinct TEXCOORD_* channels per material go into the vertex buffer (a_place and a_place2). */
  const distinct: number[] = [];
  for (const slot of resolved) {
    if (slot.index !== null && !distinct.includes(slot.texCoord)) distinct.push(slot.texCoord);
  }
  const chan0 = distinct[0] ?? 0;
  const chan1 = distinct[1] ?? chan0;
  const uvSetOf = (slot: RawSlot): 0 | 1 => (slot.index !== null && slot.texCoord === chan1 && chan1 !== chan0 ? 1 : 0);
  return {
    uvChannels: [chan0, chan1],
    material: {
      color: [color[0], color[1], color[2], color[3]],
      colorTexture: resolved[0].index,
      normalTexture: resolved[1].index,
      normalScale: isRecord(material.normalTexture) ? number(material.normalTexture.scale, 1) : 1,
      roughTexture: resolved[2].index,
      roughness: Math.min(1, Math.max(0, number(specGloss ? specGloss.glossinessFactor : pbr.roughnessFactor, 1))),
      metallic: specGloss ? 0 : Math.min(1, Math.max(0, number(pbr.metallicFactor, 1))),
      specGloss: Boolean(specGloss),
      specular: [specular[0], specular[1], specular[2]],
      unlit,
      emissive: [emissive[0] * emissiveStrength, emissive[1] * emissiveStrength, emissive[2] * emissiveStrength],
      emissiveTexture: resolved[3].index,
      /* A see-through material is not blended: only its nearly clear parts are left out. */
      cutoff: mode === "MASK" ? number(material.alphaCutoff, 0.5) : mode === "BLEND" ? 0.05 : 0,
      uvSets: [uvSetOf(resolved[0]), uvSetOf(resolved[1]), uvSetOf(resolved[2]), uvSetOf(resolved[3])],
      uvTransforms: [resolved[0].transform, resolved[1].transform, resolved[2].transform, resolved[3].transform]
    }
  };
}

/** The material of a part that names none: plain light gray. */
const PLAIN: ModelMaterial = {
  color: [0.8, 0.8, 0.8, 1], colorTexture: null, normalTexture: null, normalScale: 1, roughTexture: null,
  roughness: 0.6, metallic: 0, specGloss: false, specular: [1, 1, 1], unlit: false,
  emissive: [0, 0, 0], emissiveTexture: null, cutoff: 0,
  uvSets: [0, 0, 0, 0], uvTransforms: [IDENTITY_UV, IDENTITY_UV, IDENTITY_UV, IDENTITY_UV]
};

/**
 * The credit a model file carries: its copyright text, or (a file from
 * Sketchfab) its title, maker, license and address.
 */
function modelCredit(json: Json): string | null {
  const asset = isRecord(json.asset) ? json.asset : {};
  if (typeof asset.copyright === "string" && asset.copyright.trim()) return asset.copyright.trim();
  const extras = isRecord(asset.extras) ? asset.extras : {};
  const { title, author, license, source } = extras;
  if (typeof author !== "string" || !author) return null;
  return [`${typeof title === "string" && title ? `"${title}" ` : ""}by ${author}`, typeof license === "string" ? license : "", typeof source === "string" ? source : ""].filter(Boolean).join(", ");
}

/** Reads a .glb file. It throws an Error with a plain message for a file that cannot be read. */
export function parseModel(file: Uint8Array): ModelShape {
  const { json, bin } = splitGlb(file);
  for (const name of Array.isArray(json.extensionsRequired) ? json.extensionsRequired : []) {
    if (typeof name !== "string" || KNOWN_EXTENSION.test(name)) continue;
    if (PACKED[name]) throw new Error(`This model is packed with ${PACKED[name]}, which Kaleido Sage cannot read. Export it again without it.`);
    throw new Error(`This model needs "${name}", which Kaleido Sage cannot read.`);
  }
  const reader = new Reader(json, bin);

  const images: ModelImage[] = [];
  /* Each image of the file to its place in "images"; -1 for one that is not inside the file. */
  const imageAt = list(json.images).map((image) => {
    const inside = typeof image.uri === "string" ? dataUri(image.uri) : null;
    const bytes = inside?.bytes ?? reader.viewBytes(image.bufferView);
    if (!bytes || bytes.byteLength === 0) return -1;
    const type = sniffImageType(bytes) ?? (normalizeMime(image.mimeType) || normalizeMime(inside?.type) || "image/jpeg");
    images.push({ bytes, type });
    return images.length - 1;
  });
  const samplers = list(json.samplers);
  const textures: ModelTexture[] = [];
  /* Each texture of the file to its place in "textures"; -1 for one with no image. */
  const textureAt = list(json.textures).map((texture) => {
    const ext = isRecord(texture.extensions) ? texture.extensions : null;
    const candidates = [
      texture.source,
      ext && isRecord(ext.EXT_texture_webp) ? ext.EXT_texture_webp.source : undefined,
      ext && isRecord(ext.EXT_texture_avif) ? ext.EXT_texture_avif.source : undefined
    ];
    let image = -1;
    for (const candidate of candidates) {
      const found = imageAt[whole(candidate) ?? -1] ?? -1;
      if (found >= 0) {
        image = found;
        break;
      }
    }
    if (image < 0) return -1;
    const sampler = samplers[whole(texture.sampler) ?? -1] ?? {};
    textures.push({ image, wrapS: whole(sampler.wrapS) ?? REPEAT, wrapT: whole(sampler.wrapT) ?? REPEAT });
    return textures.length - 1;
  });
  const fileTextures = textureAt.length;
  const placed = (index: number | null) => index === null || textureAt[index] < 0 ? null : textureAt[index];
  const materialUvChannels: [number, number][] = [];
  const materials = list(json.materials).map((material) => {
    const read = readMaterial(material, fileTextures, placed);
    materialUvChannels.push(read.uvChannels);
    return read.material;
  });
  const plain = materials.length;

  /* The corners and triangles of each material, piece by piece. */
  const pieces = new Map<number, { vertices: Float32Array; indices: Uint32Array }[]>();
  const meshes = list(json.meshes);
  const nodes = list(json.nodes);
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];

  const addMesh = (mesh: Json, matrix: Matrix) => {
    /* Directions turn by the matrix's cofactors, which keeps them square to the surface under uneven sizes. */
    const m = matrix;
    const turn = [
      m[5] * m[10] - m[6] * m[9], m[6] * m[8] - m[4] * m[10], m[4] * m[9] - m[5] * m[8],
      m[2] * m[9] - m[1] * m[10], m[0] * m[10] - m[2] * m[8], m[1] * m[8] - m[0] * m[9],
      m[1] * m[6] - m[2] * m[5], m[2] * m[4] - m[0] * m[6], m[0] * m[5] - m[1] * m[4]
    ];
    for (const primitive of list(mesh.primitives)) {
      const mode = primitive.mode === undefined ? 4 : primitive.mode;
      if (mode !== 4 && mode !== 5 && mode !== 6) continue;
      const attributes = isRecord(primitive.attributes) ? primitive.attributes : {};
      const places = reader.read(attributes.POSITION, 3);
      if (!places || places.count === 0) continue;
      const count = places.count;
      const named = whole(primitive.material);
      const material = named !== null && named < materials.length ? named : plain;
      const [chan0, chan1] = materialUvChannels[material] ?? [0, 0];
      const directions = reader.read(attributes.NORMAL, 3);
      const uv0 = reader.read(attributes[`TEXCOORD_${chan0}`], 2) ?? (chan0 !== 0 ? reader.read(attributes.TEXCOORD_0, 2) : null);
      const uv1 = chan1 !== chan0 ? (reader.read(attributes[`TEXCOORD_${chan1}`], 2) ?? uv0) : uv0;
      const colors = reader.read(attributes.COLOR_0, 4, true);
      const given = reader.read(primitive.indices, 1);
      let corners: Uint32Array;
      if (given) corners = Uint32Array.from(given.values);
      else corners = Uint32Array.from({ length: count }, (_, i) => i);
      /* A strip or a fan becomes single triangles. */
      if (mode !== 4) {
        const single: number[] = [];
        for (let i = 2; i < corners.length; i++) {
          if (mode === 6) single.push(corners[0], corners[i - 1], corners[i]);
          else if (i % 2 === 0) single.push(corners[i - 2], corners[i - 1], corners[i]);
          else single.push(corners[i - 1], corners[i - 2], corners[i]);
        }
        corners = Uint32Array.from(single);
      }
      corners = corners.subarray(0, corners.length - (corners.length % 3));
      if (corners.some((corner) => corner >= count)) throw new Error("The model file names a corner that it does not have.");

      const vertices = new Float32Array(count * MODEL_STRIDE);
      const hasColor = colors !== null && colors.count === count;
      for (let i = 0; i < count; i++) {
        const [x, y, z] = [places.values[i * 3], places.values[i * 3 + 1], places.values[i * 3 + 2]];
        const at = i * MODEL_STRIDE;
        for (let axis = 0; axis < 3; axis++) {
          const value = m[axis] * x + m[4 + axis] * y + m[8 + axis] * z + m[12 + axis];
          vertices[at + axis] = value;
          if (value < low[axis]) low[axis] = value;
          if (value > high[axis]) high[axis] = value;
        }
        if (directions && directions.count === count) {
          const [nx, ny, nz] = [directions.values[i * 3], directions.values[i * 3 + 1], directions.values[i * 3 + 2]];
          for (let axis = 0; axis < 3; axis++) vertices[at + 3 + axis] = turn[axis] * nx + turn[3 + axis] * ny + turn[6 + axis] * nz;
        }
        if (uv0 && uv0.count === count) {
          vertices[at + 6] = uv0.values[i * 2];
          vertices[at + 7] = uv0.values[i * 2 + 1];
        }
        if (uv1 && uv1.count === count) {
          vertices[at + 8] = uv1.values[i * 2];
          vertices[at + 9] = uv1.values[i * 2 + 1];
        }
        if (hasColor) {
          vertices[at + 10] = linearToSrgb(colors.values[i * 4]);
          vertices[at + 11] = linearToSrgb(colors.values[i * 4 + 1]);
          vertices[at + 12] = linearToSrgb(colors.values[i * 4 + 2]);
          vertices[at + 13] = colors.parts >= 4 ? Math.max(0, Math.min(1, colors.values[i * 4 + 3])) : 1;
        } else {
          vertices[at + 10] = 1;
          vertices[at + 11] = 1;
          vertices[at + 12] = 1;
          vertices[at + 13] = 1;
        }
      }
      if (!directions || directions.count !== count) {
        /* No directions in the file: each corner takes the sum of its triangles' directions (larger triangles count more). */
        for (let i = 0; i < corners.length; i += 3) {
          const [a, b, c] = [corners[i] * MODEL_STRIDE, corners[i + 1] * MODEL_STRIDE, corners[i + 2] * MODEL_STRIDE];
          const u = [vertices[b] - vertices[a], vertices[b + 1] - vertices[a + 1], vertices[b + 2] - vertices[a + 2]];
          const v = [vertices[c] - vertices[a], vertices[c + 1] - vertices[a + 1], vertices[c + 2] - vertices[a + 2]];
          const face = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
          for (const corner of [a, b, c]) for (let axis = 0; axis < 3; axis++) vertices[corner + 3 + axis] += face[axis];
        }
      }
      for (let at = 0; at < vertices.length; at += MODEL_STRIDE) {
        const length = Math.hypot(vertices[at + 3], vertices[at + 4], vertices[at + 5]);
        if (length > 1e-20) for (let axis = 3; axis < 6; axis++) vertices[at + axis] /= length;
        else vertices[at + 4] = 1;
      }
      if (!pieces.has(material)) pieces.set(material, []);
      pieces.get(material)!.push({ vertices, indices: corners });
    }
  };

  /* The file's scene: each root node and the nodes under it. A file with no scene shows every mesh as it is. */
  const scenes = list(json.scenes);
  const scene = scenes[whole(json.scene) ?? 0];
  const seen = new Set<number>();
  const walk = (index: number, parent: Matrix) => {
    const node = nodes[index];
    if (!node || seen.has(index)) return;
    seen.add(index);
    const matrix = multiply(parent, nodeMatrix(node));
    const mesh = meshes[whole(node.mesh) ?? -1];
    if (mesh) addMesh(mesh, matrix);
    for (const child of Array.isArray(node.children) ? node.children : []) if (whole(child) !== null) walk(child as number, matrix);
  };
  if (scene) {
    for (const root of Array.isArray(scene.nodes) ? scene.nodes : []) if (whole(root) !== null) walk(root as number, IDENTITY);
  } else {
    for (const mesh of meshes) addMesh(mesh, IDENTITY);
  }

  if (pieces.size === 0) throw new Error("This model has no triangles to draw.");
  if (pieces.has(plain)) materials.push(PLAIN);

  /* To a ball of radius 1 around the middle of the model's box. */
  const middle = [0, 1, 2].map((axis) => (low[axis] + high[axis]) / 2);
  let reach = 0;
  for (const each of pieces.values()) {
    for (const { vertices } of each) {
      for (let at = 0; at < vertices.length; at += MODEL_STRIDE) {
        reach = Math.max(reach, Math.hypot(vertices[at] - middle[0], vertices[at + 1] - middle[1], vertices[at + 2] - middle[2]));
      }
    }
  }
  const size = reach > 0 ? 1 / reach : 1;

  const parts: ModelPart[] = [];
  let triangles = 0;
  for (const [material, each] of [...pieces].sort((a, b) => a[0] - b[0])) {
    const vertices = new Float32Array(each.reduce((sum, piece) => sum + piece.vertices.length, 0));
    const indices = new Uint32Array(each.reduce((sum, piece) => sum + piece.indices.length, 0));
    let vertexAt = 0;
    let indexAt = 0;
    for (const piece of each) {
      const first = vertexAt / MODEL_STRIDE;
      vertices.set(piece.vertices, vertexAt);
      for (let i = 0; i < piece.indices.length; i++) indices[indexAt + i] = piece.indices[i] + first;
      vertexAt += piece.vertices.length;
      indexAt += piece.indices.length;
    }
    for (let at = 0; at < vertices.length; at += MODEL_STRIDE) {
      for (let axis = 0; axis < 3; axis++) vertices[at + axis] = (vertices[at + axis] - middle[axis]) * size;
    }
    triangles += indices.length / 3;
    parts.push({ material, vertices, indices });
  }
  return { parts, materials, textures, images, triangles, origin: [-middle[0] * size, -middle[1] * size, -middle[2] * size], credit: modelCredit(json) };
}

/**
 * One .glb file from a model that comes as a description (a .gltf file's
 * JSON) with loose files beside it: its data blocks and its pictures, each
 * by the name the description gives it. The scene file keeps one file per
 * model, so a model from the internet is packed this way first (see
 * lib/polyHaven.ts). A file that the description names and "files" does
 * not have throws.
 */
export function packGlb(description: unknown, files: ReadonlyMap<string, Uint8Array>): Uint8Array {
  if (!isRecord(description)) throw new Error("The model's description is broken.");
  const json = structuredClone(description);
  const named = (uri: string): Uint8Array => {
    const inside = dataUri(uri);
    if (inside) return inside.bytes;
    let name = uri;
    try {
      name = decodeURIComponent(uri);
    } catch { /* The name as it is written. */ }
    const bytes = files.get(name) ?? files.get(uri) ?? files.get(name.replace(/^\.\//, ""));
    if (!bytes) throw new Error(`The model's file "${name}" is missing.`);
    return bytes;
  };
  const blocks: Uint8Array[] = [];
  let length = 0;
  /* Adds a block at the next place that 4 divides, and returns that place. */
  const add = (bytes: Uint8Array) => {
    const at = length;
    blocks.push(bytes);
    length += bytes.byteLength;
    const gap = (4 - (length % 4)) % 4;
    if (gap) {
      blocks.push(new Uint8Array(gap));
      length += gap;
    }
    return at;
  };
  const starts = list(json.buffers).map((buffer) => typeof buffer.uri === "string" ? add(named(buffer.uri)) : null);
  const views = Array.isArray(json.bufferViews) ? json.bufferViews as unknown[] : [];
  for (const view of views) {
    if (!isRecord(view)) continue;
    const start = starts[whole(view.buffer) ?? -1];
    if (start === null || start === undefined) throw new Error("The model's description names data that it does not have.");
    view.buffer = 0;
    view.byteOffset = (whole(view.byteOffset ?? 0) ?? 0) + start;
  }
  for (const image of list(json.images)) {
    if (typeof image.uri !== "string") continue;
    const bytes = named(image.uri);
    views.push({ buffer: 0, byteOffset: add(bytes), byteLength: bytes.byteLength });
    image.bufferView = views.length - 1;
    if (typeof image.mimeType !== "string") image.mimeType = imageType(bytes);
    delete image.uri;
  }
  json.bufferViews = views;
  json.buffers = [{ byteLength: length }];

  return writeGlb(json, blocks, length);
}

/** A .glb file from a description and its binary blocks, which are "length" bytes together (0 for none). */
function writeGlb(json: Json, blocks: readonly Uint8Array[], length: number): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const textLength = text.byteLength + ((4 - (text.byteLength % 4)) % 4);
  const binLength = length + ((4 - (length % 4)) % 4);
  const file = new Uint8Array(12 + 8 + textLength + (binLength ? 8 + binLength : 0));
  const view = new DataView(file.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, file.byteLength, true);
  view.setUint32(12, textLength, true);
  view.setUint32(16, CHUNK_JSON, true);
  /* The description ends with spaces up to a place that 4 divides, as the format asks. */
  file.fill(0x20, 20, 20 + textLength);
  file.set(text, 20);
  if (!binLength) return file;
  view.setUint32(20 + textLength, binLength, true);
  view.setUint32(24 + textLength, CHUNK_BIN, true);
  let at = 28 + textLength;
  for (const block of blocks) {
    file.set(block, at);
    at += block.byteLength;
  }
  return file;
}

/**
 * The same .glb file with "credit" as its copyright text (the format's
 * own field for it), so the credit of a model from the internet stays
 * with the model in the scene file. parseModel reads it back.
 */
export function stampGlb(file: Uint8Array, credit: string): Uint8Array {
  const { json, bin } = splitGlb(file);
  json.asset = { ...(isRecord(json.asset) ? json.asset : { version: "2.0" }), copyright: credit };
  return writeGlb(json, [bin], bin.byteLength);
}
