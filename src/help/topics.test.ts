import { describe, expect, it } from "vitest";
import { HELP_ICONS, HELP_TOPICS, HELP_TOPIC_IDS } from "./topics";

/** Every component's source text, by path ("../components/AudioPanel.tsx"). */
const sources = import.meta.glob("../**/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** The topic ids that the source marks with help("id"), and where. */
const marks = Object.entries(sources).flatMap(([path, text]) =>
  [...text.matchAll(/\bhelp\("([^"]+)"\)/g)].map((match) => ({ path, id: match[1] })));

/**
 * The panels and controls that must have a help mark (see docs/HELP.md):
 * each one's file, and the topic it names. A new panel adds a line here.
 */
const REQUIRED: readonly (readonly [string, string])[] = [
  ["../components/DocumentTabs.tsx", "scene.tabs"],
  ["../components/SourcePanel.tsx", "source"],
  ["../components/ControlPanel.tsx", "fx"],
  ["../components/ControlPanel.tsx", "fx.group"],
  ["../components/useParamRows.tsx", "row"],
  ["../components/AudioPanel.tsx", "audio.input"],
  ["../components/AudioPanel.tsx", "audio.levels"],
  ["../components/AudioPanel.tsx", "audio.files"],
  ["../components/AudioPanel.tsx", "audio.sensors"],
  ["../components/AudioLinkButton.tsx", "audio.sensors"],
  ["../components/MidiPanel.tsx", "midi"],
  ["../components/StageControls.tsx", "play"],
  ["../components/TitleBar.tsx", "playlist"],
  ["../components/ExportVideoDialog.tsx", "export"]
];

describe("help topics", () => {
  it("each have a title, a short text, up to eight one-thing tips, and search words", () => {
    for (const id of HELP_TOPIC_IDS) {
      const topic = HELP_TOPICS[id];
      expect(topic.title, id).not.toBe("");
      /* One or two sentences (a third is allowed for a list of choices). */
      expect(topic.text.split(/(?<=[.!?])\s+/).length, `${id}: text`).toBeLessThanOrEqual(3);
      expect(topic.tips.length, `${id}: tips`).toBeLessThanOrEqual(8);
      for (const tip of topic.tips) {
        expect(tip, id).not.toMatch(/\n/);
        /* An icon mark shows as one icon, about one letter wide. */
        expect(tip.replace(/\{[a-z-]+\}/g, "#").length, `${id}: "${tip}"`).toBeLessThanOrEqual(90);
      }
      expect(topic.keywords.length, `${id}: keywords`).toBeGreaterThan(0);
    }
  });

  it("name only icons that the help card can draw", () => {
    for (const id of HELP_TOPIC_IDS) {
      const { text, tips } = HELP_TOPICS[id];
      for (const line of [text, ...tips]) {
        for (const [, icon] of line.matchAll(/\{([^}]*)\}/g)) {
          expect(HELP_ICONS as readonly string[], `${id}: "${line}"`).toContain(icon);
        }
      }
    }
  });

  it("are each named by a mark, and every mark names a topic", () => {
    const named = new Set(marks.map(({ id }) => id));
    for (const id of HELP_TOPIC_IDS) expect(named.has(id), `no control names "${id}"`).toBe(true);
    for (const { path, id } of marks) expect(HELP_TOPIC_IDS as readonly string[], `${path} names "${id}"`).toContain(id);
  });

  it("are named by every panel and control that needs one", () => {
    for (const [path, id] of REQUIRED) {
      expect(sources[path], `${path} is missing`).toBeDefined();
      expect(marks.some((mark) => mark.path === path && mark.id === id), `${path} has no help("${id}")`).toBe(true);
    }
  });
});
