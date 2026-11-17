import type { ComponentType } from "react";
import { GettingStarted } from "./chapters/GettingStarted";
import { Projects } from "./chapters/Projects";
import { SceneCard } from "./chapters/SceneCard";
import { FxList } from "./chapters/FxList";
import { MovingSettings } from "./chapters/MovingSettings";
import { EffectsSpace } from "./chapters/EffectsSpace";
import { EffectsLight } from "./chapters/EffectsLight";
import { EffectsTexture } from "./chapters/EffectsTexture";
import { Audio } from "./chapters/Audio";
import { Playlist } from "./chapters/Playlist";
import { SongMap } from "./chapters/SongMap";
import { Playing } from "./chapters/Playing";
import { Midi } from "./chapters/Midi";
import { CastVr } from "./chapters/CastVr";
import { ExportMedia } from "./chapters/ExportMedia";
import { Updates } from "./chapters/Updates";

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
  { id: "projects", part: "Basics", title: "Projects and scenes", body: Projects },
  { id: "scene-card", part: "Basics", title: "The Scene card", body: SceneCard },
  { id: "fx-list", part: "Effects", title: "The FX list", body: FxList },
  { id: "settings", part: "Effects", title: "Settings that move", body: MovingSettings },
  { id: "fx-space", part: "Effects", title: "Effects that shape space", body: EffectsSpace },
  { id: "fx-light", part: "Effects", title: "Effects that draw light", body: EffectsLight },
  { id: "fx-texture", part: "Effects", title: "Effects for time, texture and color", body: EffectsTexture },
  { id: "audio", part: "Music", title: "Audio input and audio links", body: Audio },
  { id: "playlist", part: "Music", title: "The Playlist and the Scenes list", body: Playlist },
  { id: "song-map", part: "Music", title: "Song follow and the Song Map", body: SongMap },
  { id: "playing", part: "Performing", title: "Playing a show", body: Playing },
  { id: "midi", part: "Performing", title: "MIDI controllers", body: Midi },
  { id: "cast-vr", part: "Performing", title: "Cast and VR", body: CastVr },
  { id: "export", part: "Output", title: "Save PNG and Export Video", body: ExportMedia },
  { id: "updates", part: "Output", title: "Updates and shortcuts", body: Updates }
];
