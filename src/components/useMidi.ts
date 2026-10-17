import { useSyncExternalStore } from "react";
import { midi } from "../lib/midi";

/** The MIDI view (learn mode, the armed slider, the mapped sliders); the component draws again when it changes. */
export const useMidi = () => useSyncExternalStore(midi.subscribe, midi.getView);
