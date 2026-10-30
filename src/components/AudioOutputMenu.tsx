import { useEffect, useSyncExternalStore } from "react";
import { audioInput } from "../lib/audioInput";
import { audioOutput } from "../lib/audioOutput";
import { Dropdown } from "./Dropdown";

/** The Output menu's first choice: the Windows default device. */
const DEFAULT = "";

const subscribe = (listener: () => void) => audioOutput.subscribe(listener);
const version = () => audioOutput.version;
const subscribeInput = (listener: () => void) => audioInput.subscribe(listener);
const inputVersion = () => audioInput.version;

/**
 * The Output menu, under the Input menu in the Playlist's toolbar: the
 * speaker that plays the audio files (see audioOutput.ts). Default output
 * follows Windows; any other choice is one speaker, for example a virtual
 * cable that a stream sends to another room.
 */
export function AudioOutputMenu() {
  useSyncExternalStore(subscribe, version);
  /* The Rust device list names the Windows default device. */
  useSyncExternalStore(subscribeInput, inputVersion);
  useEffect(() => { void audioOutput.refresh(); }, []);
  const defaultName = audioInput.devices.find((device) => device.kind === "output" && device.default)?.name;
  const options: [string, string][] = [[DEFAULT, defaultName ? `Default output (${defaultName})` : "Default output"]];
  for (const speaker of audioOutput.speakers) options.push([speaker.name, speaker.name]);
  const picked = audioOutput.device ?? DEFAULT;
  if (!options.some(([value]) => value === picked)) options.push([picked, `${picked} (not connected)`]);
  return (
    <>
      <div className="scene-input-row" data-tip="Select the speaker that plays the audio files.">
        <span className="panel-row-name">Output</span>
        <Dropdown value={picked} options={options} noWrap label="Output" onChange={(value) => void audioOutput.set(value === DEFAULT ? null : value)} />
      </div>
      {audioOutput.error && <p className="audio-error selectable">{audioOutput.error}</p>}
    </>
  );
}
