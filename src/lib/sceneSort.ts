/** The ways the Scenes list's Sort menu puts the scenes in order. */
export type SceneSort = "name" | "use" | "modified";

/** What the sort needs to know of one scene. */
export interface SortScene {
  id: number;
  /** The scene's name, without .ksage. */
  name: string;
  /** The number of songs of the playlist that use the scene, and the number of slices in them that play it. */
  songs: number;
  slices: number;
  /** When the scene last changed, in ms (see SceneDoc.modified); null when not known. */
  modified: number | null;
}

/** Names in A–Z order, as a person reads them: "Scene 2" before "Scene 10", and case does not count. */
export const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare;

/**
 * The scenes' ids in a sort order. "name": A–Z. "use": the scene that the
 * most songs use first, then the one with the most slices. "modified": the
 * scene that changed last first; a scene with no known date goes last.
 * Scenes that are equal go A–Z by name.
 */
export function sortedSceneIds(scenes: readonly SortScene[], sort: SceneSort): number[] {
  const order = (a: SortScene, b: SortScene) => {
    if (sort === "use") return b.songs - a.songs || b.slices - a.slices;
    if (sort === "modified") return (b.modified ?? -Infinity) === (a.modified ?? -Infinity) ? 0 : (b.modified ?? -Infinity) > (a.modified ?? -Infinity) ? 1 : -1;
    return 0;
  };
  return [...scenes].sort((a, b) => order(a, b) || byName(a.name, b.name)).map((scene) => scene.id);
}
