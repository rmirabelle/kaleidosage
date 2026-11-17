import type { ComponentType } from "react";
import { GettingStarted } from "./chapters/GettingStarted";
import { Projects } from "./chapters/Projects";

/**
 * One help chapter: `id` is its address (`help_open` can select it),
 * `title` shows in the list, under the name of its `part`.
 */
export interface Chapter {
  id: string;
  part: string;
  title: string;
  body: ComponentType;
}

/** The help chapters, in reading order. */
export const CHAPTERS: Chapter[] = [
  { id: "getting-started", part: "Basics", title: "Getting started", body: GettingStarted },
  { id: "projects", part: "Basics", title: "Projects and scenes", body: Projects }
];
