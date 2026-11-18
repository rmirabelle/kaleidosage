import { describe, expect, it } from "vitest";
import { fabCredit, fabSearchUrl, readFabSearch } from "./sketchfab";

const ANSWER = {
  cursors: { next: "24", previous: null },
  results: [
    {
      uid: "1cdd1db557b8428892af4773bdada913", name: "Spaceship Corridor", faceCount: 125571,
      viewerUrl: "https://sketchfab.com/3d-models/none-1cdd1db557b8428892af4773bdada913",
      license: { label: "CC Attribution" },
      user: { username: "the_table", displayName: "The Table" },
      archives: { glb: { size: 35701076, faceCount: 125000 }, gltf: { size: 1 } },
      thumbnails: { images: [{ width: 1920, url: "https://media.sketchfab.com/big.jpeg" }, { width: 64, url: "https://media.sketchfab.com/tiny.jpeg" }, { width: 720, url: "https://media.sketchfab.com/mid.jpeg" }] }
    },
    { uid: "abc123", name: "No glb", archives: { gltf: { size: 1 } } },
    { uid: "../bad", name: "Bad id", archives: { glb: { size: 1 } } }
  ]
};

describe("Sketchfab", () => {
  it("reads the models that have a .glb file, and where the next page starts", () => {
    const { models, next } = readFabSearch(ANSWER);
    expect(next).toBe("24");
    expect(models).toHaveLength(1);
    expect(models[0]).toEqual({
      uid: "1cdd1db557b8428892af4773bdada913", name: "Spaceship Corridor", author: "The Table", license: "CC Attribution", triangles: 125000, bytes: 35701076,
      thumb: "https://media.sketchfab.com/mid.jpeg", page: "https://sketchfab.com/3d-models/none-1cdd1db557b8428892af4773bdada913"
    });
    expect(fabCredit(models[0])).toBe("\"Spaceship Corridor\" by The Table, CC Attribution, https://sketchfab.com/3d-models/none-1cdd1db557b8428892af4773bdada913");
    expect(readFabSearch({ results: [], cursors: { next: null } }).next).toBeNull();
  });

  it("asks only for models that anyone can download, with the picked filters", () => {
    const url = new URL(fabSearchUrl({ words: " space ship ", category: "science-technology", license: "by", order: "-likeCount", cursor: "24" }));
    expect(Object.fromEntries(url.searchParams)).toEqual({ type: "models", downloadable: "true", count: "24", q: "space ship", categories: "science-technology", license: "by", sort_by: "-likeCount", cursor: "24" });
    expect(new URL(fabSearchUrl({ words: "", category: "", license: "", order: "", cursor: null })).search).toBe("?type=models&downloadable=true&count=24");
  });
});
