import { describe, expect, it } from "vitest";
import { ALL_SHORTCUT_KEYS, SHORTCUT_GROUPS } from "./shortcuts";

/** The menus' source text: their shortcuts are written as shortcut: "Ctrl+S" (also in a choice, ? "Ctrl+S" :). */
const app = Object.values(import.meta.glob("../App.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;
const menuShortcuts = [...new Set([...app.matchAll(/\bshortcut: (?:[^,"}]*\? )?"([^"]+)"/g)].map((match) => match[1]))];

describe("the keyboard shortcuts sheet", () => {
  it("lists every shortcut that a menu shows", () => {
    expect(menuShortcuts.length).toBeGreaterThan(10);
    for (const keys of menuShortcuts) expect(ALL_SHORTCUT_KEYS, `the sheet has no "${keys}"`).toContain(keys);
  });

  it("has a key and a short text for each line, and no line twice", () => {
    const seen = new Set<string>();
    for (const group of SHORTCUT_GROUPS) {
      for (const { keys, does } of group.shortcuts) {
        expect(keys.length, does).toBeGreaterThan(0);
        expect(does.length, does).toBeLessThanOrEqual(80);
        const line = `${group.title}|${keys.join("|")}`;
        expect(seen.has(line), line).toBe(false);
        seen.add(line);
      }
    }
  });
});
