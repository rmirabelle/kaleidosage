import { describe, expect, it } from "vitest";
import { filterHavenModels, readHavenFiles, readHavenList } from "./polyHaven";

const LIST = {
  ArmChair_01: { name: "Arm Chair 01", categories: ["furniture", "seating", "collection: the_shed"], tags: ["victorian", "wood"], polycount: 5626, download_count: 33055, date_published: 1585605600 },
  fern_02: { name: "Fern 02", categories: ["nature", "plants"], tags: ["leaf"], polycount: 900 },
  broken: 5
};

describe("Poly Haven", () => {
  it("reads the list of models, without collections and broken entries", () => {
    const models = readHavenList(LIST);
    expect(models.map((model) => model.id)).toEqual(["ArmChair_01", "fern_02"]);
    expect(models[0].categories).toEqual(["furniture", "seating"]);
    expect(models[0].triangles).toBe(5626);
    expect(models[0].thumb).toContain("/ArmChair_01.png");
    expect(models[1].downloads).toBe(0);
  });

  it("finds models by every search word and by category", () => {
    const models = readHavenList(LIST);
    expect(filterHavenModels(models, "wood CHAIR", "").map((model) => model.id)).toEqual(["ArmChair_01"]);
    expect(filterHavenModels(models, "wood fern", "")).toEqual([]);
    expect(filterHavenModels(models, "", "plants").map((model) => model.id)).toEqual(["fern_02"]);
    expect(filterHavenModels(models, "", "")).toHaveLength(2);
  });

  it("reads a model's files at the asked picture size, or the nearest one", () => {
    const files = {
      gltf: {
        "1k": { gltf: { url: "https://dl.polyhaven.org/a_1k.gltf", size: 10, include: { "a.bin": { url: "https://dl.polyhaven.org/a.bin", size: 100 }, "textures/a_1k.jpg": { url: "https://dl.polyhaven.org/a_1k.jpg", size: 1000 } } } },
        "4k": { gltf: { url: "https://dl.polyhaven.org/a_4k.gltf", size: 10, include: {} } }
      }
    };
    expect(readHavenFiles(files, "1k")).toEqual({ url: "https://dl.polyhaven.org/a_1k.gltf", include: [["a.bin", "https://dl.polyhaven.org/a.bin"], ["textures/a_1k.jpg", "https://dl.polyhaven.org/a_1k.jpg"]], bytes: 1110 });
    /* No 2k: the nearest smaller size. */
    expect(readHavenFiles(files, "2k").url).toBe("https://dl.polyhaven.org/a_1k.gltf");
    expect(readHavenFiles(files, "4k").url).toBe("https://dl.polyhaven.org/a_4k.gltf");
    expect(() => readHavenFiles({ blend: {} }, "2k")).toThrow(/no glTF/);
  });
});
