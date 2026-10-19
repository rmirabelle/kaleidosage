/**
 * Whether the settings show their MIDI and audio buttons (the column at the
 * left of each setting; see ControlPanel). Kept here, not in the panel's
 * state, because the panel is made again after each change outside it (a
 * scene tab, Undo, Randomize), and the buttons must stay as the user left
 * them; and so other panels can turn them on (the Audio panel's "Show
 * speakers").
 */

export type SettingButtons = "midi" | "audio";

const shown: Record<SettingButtons, boolean> = { midi: false, audio: false };
const listeners = new Set<() => void>();

export const settingButtons = {
  shown: (kind: SettingButtons) => shown[kind],
  set(kind: SettingButtons, on: boolean) {
    if (shown[kind] === on) return;
    shown[kind] = on;
    for (const listener of listeners) listener();
  },
  /** Calls the listener after each change. Returns a function that removes it. */
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }
};
