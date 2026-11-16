import { describe, expect, it } from "vitest";
import { sortedSceneIds, type SortScene } from "./sceneSort";

const scene = (id: number, name: string, songs = 0, slices = 0, modified: number | null = null): SortScene => ({ id, name, songs, slices, modified });

describe("sortedSceneIds", () => {
  it("sorts by name as a person reads it", () => {
    expect(sortedSceneIds([scene(1, "Scene 10"), scene(2, "scene 2"), scene(3, "Alpha")], "name")).toEqual([3, 2, 1]);
  });

  it("sorts by use: most songs first, then most slices, then name", () => {
    const scenes = [scene(1, "B", 1, 9), scene(2, "A", 0, 0), scene(3, "C", 2, 2), scene(4, "D", 2, 5), scene(5, "E", 1, 9)];
    expect(sortedSceneIds(scenes, "use")).toEqual([4, 3, 1, 5, 2]);
  });

  it("sorts by date: newest first, and a scene with no date last", () => {
    const scenes = [scene(1, "B", 0, 0, 100), scene(2, "Z"), scene(3, "C", 0, 0, 300), scene(4, "A"), scene(5, "D", 0, 0, 300)];
    expect(sortedSceneIds(scenes, "modified")).toEqual([3, 5, 1, 4, 2]);
  });

  it("does not change the list it gets", () => {
    const scenes = [scene(1, "B"), scene(2, "A")];
    sortedSceneIds(scenes, "name");
    expect(scenes.map((each) => each.id)).toEqual([1, 2]);
  });
});
