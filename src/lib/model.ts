import { invoke } from "@tauri-apps/api/core";
import { parseModel, type ModelData } from "../engine/model";
import { blobToSceneImage, sceneImageToBlob, type SceneModel } from "../engine/scene";

/** A model's pictures are made no larger than this on their longer side: larger ones cost much graphics memory and show no more on a screen. */
const MAX_PICTURE = 4096;
const MODEL_TYPE = "model/gltf-binary";

let nextModelId = 1;

/**
 * A model from the bytes of a .glb file (see engine/model.ts), with its
 * pictures decoded. A picture that the browser cannot read is left out
 * (its material shows its plain color). A file that cannot be read throws
 * an Error with a plain message.
 */
export async function loadModel(file: Uint8Array, name: string): Promise<ModelData> {
  const shape = parseModel(file);
  const pictures = await Promise.all(shape.images.map(async ({ bytes, type }, index) => {
    const decode = async (blob: Blob, useOptions: boolean) => {
      /* The colors as they are in the file, and the cover apart from the color (a cut-out reads it). */
      const options = useOptions ? ({ colorSpaceConversion: "none", premultiplyAlpha: "none" } as const) : undefined;
      const bitmap = options ? await createImageBitmap(blob, options) : await createImageBitmap(blob);
      const most = Math.max(bitmap.width, bitmap.height);
      if (most <= MAX_PICTURE) return bitmap;
      const scale = MAX_PICTURE / most;
      const resize = { ...(options ?? {}), resizeWidth: Math.round(bitmap.width * scale), resizeHeight: Math.round(bitmap.height * scale), resizeQuality: "high" as const };
      const small = await createImageBitmap(blob, resize);
      bitmap.close();
      return small;
    };
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type });
    try {
      return await decode(blob, true);
    } catch {
      try {
        return await decode(blob, false);
      } catch (error) {
        console.warn(`3D model "${name}": could not decode image #${index} (${type}, ${bytes.byteLength} bytes):`, error);
        return null;
      }
    }
  }));
  return { id: nextModelId++, name, file, shape, pictures };
}

/** The model in a .glb file the user picked. */
export async function loadModelFile(path: string): Promise<ModelData> {
  const bytes = await invoke<ArrayBuffer>("read_model_file", { path });
  return loadModel(new Uint8Array(bytes), path.split(/[\\/]/).pop() ?? "Model");
}

/** A loaded model as a scene file keeps it: its file, as it was picked. */
export async function modelToScene(model: ModelData): Promise<SceneModel> {
  const saved = await blobToSceneImage(new Blob([model.file as Uint8Array<ArrayBuffer>], { type: MODEL_TYPE }));
  return { name: model.name, data: saved.data! };
}

/** A scene file's model, ready for the engine. A broken file throws. */
export async function modelFromScene(saved: SceneModel): Promise<ModelData> {
  const bytes = await sceneImageToBlob({ type: MODEL_TYPE, data: saved.data }).arrayBuffer();
  return loadModel(new Uint8Array(bytes), saved.name);
}
