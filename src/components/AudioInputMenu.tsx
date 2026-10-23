import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";
import { audioInput, type DeviceKind, type InputKind } from "../lib/audioInput";
import { tracks } from "../lib/tracks";
import { Dropdown } from "./Dropdown";

/** A source in the Input menu: the kind, a colon, and the device id (nothing after the colon for the kind's default device). */
const sourceValue = (kind: DeviceKind, device: string | null) => `${kind}:${device ?? ""}`;
const KIND_HEADINGS: Record<DeviceKind, string> = { output: "PC (loopback)", input: "Microphones and line inputs" };
const KIND_DEFAULTS: Record<DeviceKind, string> = { output: "Default output", input: "Default input" };

/** The Input menu's first choice: the app does not listen. */
const NONE = "none:";
/** The Input menu's last choice: the app plays the tracks and listens to them. */
const TRACKS = "tracks:";

const subscribe = (listener: () => void) => audioInput.subscribe(listener);
const version = () => audioInput.version;
const subscribeTracks = (listener: () => void) => tracks.subscribe(listener);
const tracksVersion = () => tracks.version;

/**
 * The tip at the right of the Input menu, with an arrow to it: the FX audio
 * button was turned on while the app listens to nothing. It follows the
 * menu while the panels around it change size.
 */
function InputTip({ anchor, onClose }: { anchor: RefObject<HTMLDivElement | null>; onClose: () => void }) {
  const tipRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    let frame = 0;
    const place = () => {
      const label = anchor.current?.getBoundingClientRect();
      const tip = tipRef.current;
      if (label && tip) {
        tip.style.left = `${label.right + 12}px`;
        tip.style.top = `${label.top + label.height / 2 - tip.offsetHeight / 2}px`;
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [anchor]);
  return createPortal(
    <div ref={tipRef} className="input-tip" role="status">
      <span>Pick an Input first. Then the settings can move with the sound.</span>
      <button className="help-card-close" onClick={onClose} aria-label="Close the tip" data-tip="Close">
        <X size={14} />
      </button>
    </div>,
    document.body
  );
}

/**
 * The audio Input menu, in the scene's play toolbar: Nothing, then the PC
 * sound of each output device (in loopback), then each microphone or line
 * input, then the audio files. The input belongs to the app, not to the
 * scene (see docs/AUDIO.md). Picking Files only shows the Playlist; Add
 * File(s) there asks for the files.
 */
export function AudioInputMenu({ tip, onTipDone }: {
  /** Shows the tip at the menu, until an input is picked or the tip is closed. */
  tip: boolean;
  onTipDone: () => void;
}) {
  useSyncExternalStore(subscribe, version);
  useSyncExternalStore(subscribeTracks, tracksVersion);
  const { settings, devices } = audioInput;
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => { void audioInput.refreshDevices(); }, []);
  /* A picked input does what the tip asks, so the tip goes. */
  useEffect(() => {
    if (tip && settings.kind !== "none") onTipDone();
  }, [tip, settings.kind, onTipDone]);
  const options: [string, string][] = [[NONE, "Nothing (do not listen)"]];
  const headings = new Map<string, string>();
  for (const kind of ["output", "input"] as const) {
    const ofKind = devices.filter((device) => device.kind === kind);
    const defaultName = ofKind.find((device) => device.default)?.name;
    headings.set(sourceValue(kind, null), KIND_HEADINGS[kind]);
    options.push([sourceValue(kind, null), defaultName ? `${KIND_DEFAULTS[kind]} (${defaultName})` : KIND_DEFAULTS[kind]]);
    for (const device of ofKind) options.push([sourceValue(kind, device.id), device.name]);
  }
  headings.set(TRACKS, "Audio files");
  const count = tracks.list.length;
  options.push([TRACKS, count === 0 ? "Files" : `Files (${count === 1 ? "1 file" : `${count} files`})`]);
  const picked = settings.kind === "none" ? NONE : settings.kind === "tracks" ? TRACKS : sourceValue(settings.kind, settings.device);
  if (!options.some(([value]) => value === picked)) options.push([picked, "A device that is not connected"]);
  return (
    <div ref={rowRef} className="scene-input-row" data-tip="Select an input to listen and react to.">
      <span className="panel-row-name">Input</span>
      <Dropdown
        value={picked}
        options={options}
        headings={headings}
        noWrap
        label="Input"
        onChange={(value) => {
          const split = value.indexOf(":");
          audioInput.setSource(value.slice(0, split) as InputKind, value.slice(split + 1) || null);
        }}
      />
      {tip && settings.kind === "none" && <InputTip anchor={rowRef} onClose={onTipDone} />}
    </div>
  );
}
