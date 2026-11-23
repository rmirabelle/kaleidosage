import { describe, expect, it } from "vitest";
import { splitTitle } from "./thumbnail";

describe("splitTitle", () => {
  it("makes the last word the main line", () => {
    expect(splitTitle("Into the Light")).toEqual({ topLine: "Into the", mainLine: "Light" });
  });
  it("keeps one word as the main line", () => {
    expect(splitTitle("  Nemesis ")).toEqual({ topLine: "", mainLine: "Nemesis" });
  });
  it("gives empty lines for an empty title", () => {
    expect(splitTitle("")).toEqual({ topLine: "", mainLine: "" });
  });
});
