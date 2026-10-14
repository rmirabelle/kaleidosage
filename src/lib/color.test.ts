import { describe, expect, it } from "vitest";
import { hexToHsv, hsvToHex, normalizeHex } from "./color";

describe("color picker math", () => {
  it("reads hex colors as hue, saturation and brightness", () => {
    expect(hexToHsv("#ff0000")).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv("#00ff00")).toEqual({ h: 120, s: 1, v: 1 });
    expect(hexToHsv("#000000")).toEqual({ h: 0, s: 0, v: 0 });
    expect(hexToHsv("not a color")).toBeNull();
  });

  it("goes back to the same hex color", () => {
    for (const hex of ["#ff7a1a", "#12ab9f", "#000080", "#ffffff", "#808080", "#c99bff"]) {
      expect(hsvToHex(hexToHsv(hex)!)).toBe(hex);
    }
  });

  it("accepts short and long typed colors, with or without #", () => {
    expect(normalizeHex("f80")).toBe("#ff8800");
    expect(normalizeHex("#FF8800")).toBe("#ff8800");
    expect(normalizeHex("#ff88")).toBeNull();
  });
});
