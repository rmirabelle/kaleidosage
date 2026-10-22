import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SpeakerSimpleHigh } from "@phosphor-icons/react";
import type { Engine } from "../engine/engine";
import type { ParamKey } from "../engine/params";
import { FAMILY_NAMES, familyOf } from "../engine/songScript";
import { audioInput } from "../lib/audioInput";
import { help } from "../help/topics";

const subscribe = (listener: () => void) => audioInput.subscribe(listener);
const isListening = () => audioInput.status.state === "on";

/**
 * The audio switch of one setting, in the column at the left of the
 * setting, beside its slider (the MIDI button is beside the name). A click
 * turns it on or off; a right-click turns it off. While it is on, the
 * sound moves the setting by its family (see docs/AUDIO.md, part 3): from
 * the song's plan while the picture follows a song, or from the live
 * sound. The icon is a speaker either way (only the tip says which), so it
 * does not change when Hold gives the scene its own clock. The lit icon
 * glows with how far the sound moves the setting now.
 */
export function AudioLinkButton({ engine, paramKey, label }: { engine: Engine; paramKey: ParamKey; label: string }) {
  const [on, setOn] = useState(engine.soundOn(paramKey));
  useEffect(() => engine.onParamChange((key) => {
    if (key === paramKey) setOn(engine.soundOn(paramKey));
  }), [engine, paramKey]);
  const listening = useSyncExternalStore(subscribe, isListening);
  /** True while the picture follows a song, for the tip. Only a change renders again (React skips a set to the same value). */
  const [song, setSong] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  /* The lit icon glows with the sound's push, in each frame, not through React state. */
  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    const stop = engine.onFrame(() => {
      setSong(engine.script !== null);
      button.style.setProperty("--audio-push", (on ? engine.audioPush(paramKey) : 0).toFixed(3));
    });
    return () => {
      stop();
      button.style.removeProperty("--audio-push");
    };
  }, [engine, on, paramKey]);

  const follows = FAMILY_NAMES[familyOf(paramKey)];
  const title = !on
    ? `Make this setting move with the sound: ${follows}`
    : song
      ? `Follows the song: ${follows}. Click to turn it off.`
      : `Moves with the sound: ${follows}.${listening ? "" : " No input is listening (Audio panel, A)."} Click to turn it off.`;
  return (
    <button
      ref={buttonRef}
      className={`audio-link ${on ? "on" : ""}`}
      {...help("audio.sensors")}
      data-tip={title}
      aria-label={`${label}: move with the sound`}
      aria-pressed={on}
      onClick={() => engine.setSound(paramKey, !on)}
      onContextMenu={(event) => {
        event.preventDefault();
        if (on) engine.setSound(paramKey, false);
      }}
    >
      <SpeakerSimpleHigh size={14} weight={on ? "fill" : "regular"} />
    </button>
  );
}
