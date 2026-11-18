import { describe, expect, it } from "vitest";
import { MODEL_STRIDE, packGlb, parseModel, stampGlb } from "./model";

/** A .glb file from a description and a binary block. */
function glb(json: object, bin: Uint8Array = new Uint8Array(0)): Uint8Array {
  const pad = (bytes: Uint8Array, fill: number) => {
    const out = new Uint8Array(Math.ceil(bytes.length / 4) * 4).fill(fill);
    out.set(bytes);
    return out;
  };
  const text = pad(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const data = pad(bin, 0);
  const file = new Uint8Array(12 + 8 + text.length + (data.length ? 8 + data.length : 0));
  const view = new DataView(file.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, file.length, true);
  view.setUint32(12, text.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  file.set(text, 20);
  if (data.length) {
    view.setUint32(20 + text.length, data.length, true);
    view.setUint32(24 + text.length, 0x004e4942, true);
    file.set(data, 28 + text.length);
  }
  return file;
}

/** One triangle in the x-y plane, with corner numbers (16-bit) after its places. */
function triangle(extra: object = {}, node: object = {}) {
  const bin = new Uint8Array(36 + 6);
  const view = new DataView(bin.buffer);
  [0, 0, 0, 2, 0, 0, 0, 2, 0].forEach((value, i) => view.setFloat32(i * 4, value, true));
  [0, 1, 2].forEach((value, i) => view.setUint16(36 + i * 2, value, true));
  return glb({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, ...node }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1], roughnessFactor: 0.25 }, alphaMode: "MASK" }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }],
    buffers: [{ byteLength: 42 }],
    ...extra
  }, bin);
}

describe("parseModel", () => {
  it("reads a triangle, fits it in a ball of radius 1, and makes its directions", () => {
    const model = parseModel(triangle());
    expect(model.triangles).toBe(1);
    expect(model.parts).toHaveLength(1);
    const { vertices, indices } = model.parts[0];
    expect([...indices]).toEqual([0, 1, 2]);
    expect(vertices).toHaveLength(3 * MODEL_STRIDE);
    /* The box's middle is (1, 1, 0) and the farthest corner is the square root of 2 away. */
    const far = Math.SQRT1_2;
    expect(vertices[0]).toBeCloseTo(-far);
    expect(vertices[1]).toBeCloseTo(-far);
    expect(vertices[MODEL_STRIDE]).toBeCloseTo(far);
    /* No directions in the file: the triangle's own, toward +z. */
    expect([vertices[3], vertices[4], vertices[5]]).toEqual([0, 0, 1]);
    /* The file's own zero point is the first corner. */
    expect(model.origin[0]).toBeCloseTo(vertices[0]);
    expect(model.origin[1]).toBeCloseTo(vertices[1]);
    expect(model.origin[2]).toBeCloseTo(0);
  });

  it("reads the material's color, roughness and cut-out level", () => {
    const [material] = parseModel(triangle()).materials;
    expect(material.color).toEqual([1, 0, 0, 1]);
    expect(material.roughness).toBe(0.25);
    expect(material.cutoff).toBe(0.5);
    expect(material.colorTexture).toBeNull();
  });

  it("works a node's turn and size into the corners", () => {
    /* A quarter turn around z and twice the size: the corner at (2, 0, 0) goes to (0, 4, 0). */
    const half = Math.SQRT1_2;
    const model = parseModel(triangle({}, { rotation: [0, 0, half, half], scale: [2, 2, 2] }));
    const { vertices } = model.parts[0];
    /* Corners (0,0,0), (0,4,0), (-4,0,0): the middle is (-2, 2, 0), and the size is 1 over the square root of 8. */
    const far = Math.SQRT1_2;
    expect(vertices[MODEL_STRIDE]).toBeCloseTo(far);
    expect(vertices[MODEL_STRIDE + 1]).toBeCloseTo(far);
    expect(vertices[2 * MODEL_STRIDE]).toBeCloseTo(-far);
    expect(vertices[2 * MODEL_STRIDE + 1]).toBeCloseTo(-far);
  });

  it("gives a part with no material the plain one", () => {
    const model = parseModel(triangle({ materials: [] }));
    expect(model.materials).toHaveLength(1);
    expect(model.parts[0].material).toBe(0);
    expect(model.materials[0].color).toEqual([0.8, 0.8, 0.8, 1]);
  });

  it("reads a picture inside the file, and leaves out one beside the file", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    const model = parseModel(triangle({
      images: [{ uri: "beside.png" }, { uri: png }],
      samplers: [{ wrapS: 33071 }],
      textures: [{ source: 0 }, { source: 1, sampler: 0 }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 1 } }, emissiveTexture: { index: 0 } }]
    }));
    expect(model.images).toHaveLength(1);
    expect(model.images[0].type).toBe("image/png");
    expect(model.textures).toEqual([{ image: 0, wrapS: 33071, wrapT: 10497 }]);
    expect(model.materials[0].colorTexture).toBe(0);
    expect(model.materials[0].emissiveTexture).toBeNull();
  });

  it("says why it cannot read a packed model, or a file that is not a model", () => {
    expect(() => parseModel(triangle({ extensionsRequired: ["KHR_draco_mesh_compression"] }))).toThrow(/Draco/);
    expect(() => parseModel(new Uint8Array(40))).toThrow(/not a \.glb/);
    expect(() => parseModel(glb({ asset: { version: "2.0" } }))).toThrow(/no triangles/);
  });
});

describe("packGlb", () => {
  it("packs a description and its loose files into one file that reads the same", () => {
    const data = new Uint8Array(42);
    const view = new DataView(data.buffer);
    [0, 0, 0, 2, 0, 0, 0, 2, 0].forEach((value, i) => view.setFloat32(i * 4, value, true));
    [0, 1, 2].forEach((value, i) => view.setUint16(36 + i * 2, value, true));
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const description = {
      asset: { version: "2.0" },
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      textures: [{ source: 0 }],
      images: [{ uri: "textures/my%20color.png" }],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
        { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }
      ],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }],
      buffers: [{ byteLength: 42, uri: "shape.bin" }]
    };
    const files = new Map([["shape.bin", data], ["textures/my color.png", png]]);
    const model = parseModel(packGlb(description, files));
    expect(model.triangles).toBe(1);
    expect([...model.parts[0].indices]).toEqual([0, 1, 2]);
    expect(model.images).toHaveLength(1);
    expect([...model.images[0].bytes]).toEqual([...png]);
    expect(model.images[0].type).toBe("image/png");
    expect(model.materials[0].colorTexture).toBe(0);
    /* The description itself is not changed. */
    expect(description.images[0].uri).toBe("textures/my%20color.png");
  });

  it("names a loose file that is missing", () => {
    expect(() => packGlb({ buffers: [{ uri: "gone.bin" }] }, new Map())).toThrow(/gone\.bin/);
  });
});

describe("stampGlb", () => {
  it("puts a credit in the file, and the file still reads the same", () => {
    expect(parseModel(triangle()).credit).toBeNull();
    const model = parseModel(stampGlb(triangle(), "\"Ship\" by Ann, CC Attribution"));
    expect(model.credit).toBe("\"Ship\" by Ann, CC Attribution");
    expect(model.triangles).toBe(1);
    expect([...model.parts[0].indices]).toEqual([0, 1, 2]);
  });

  it("reads the credit that a Sketchfab file carries", () => {
    const model = parseModel(triangle({ asset: { version: "2.0", extras: { title: "Ship", author: "Ann (https://sketchfab.com/ann)", license: "CC-BY-4.0", source: "https://sketchfab.com/3d-models/ship-1" } } }));
    expect(model.credit).toBe("\"Ship\" by Ann (https://sketchfab.com/ann), CC-BY-4.0, https://sketchfab.com/3d-models/ship-1");
  });
});
