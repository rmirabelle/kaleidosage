/**
 * What the user turned off in help (see docs/HELP.md, rule 3: every part
 * can be turned off, and stays off). Kept in localStorage.
 */

interface HelpSettings {
  /** False after Help, Disable Pointers: the tips that point at a control (see PointerTip) do not show. On at first. */
  pointers: boolean;
}

const STORE_KEY = "kaleidosage.help";

function load(): HelpSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Partial<HelpSettings>;
    return { pointers: saved.pointers !== false };
  } catch {
    return { pointers: true };
  }
}

let settings = load();
const listeners = new Set<() => void>();

export const helpSettings = {
  get: () => settings,
  set(next: Partial<HelpSettings>) {
    settings = { ...settings, ...next };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* The setting is back to its default at the next start. */ }
    for (const listener of listeners) listener();
  },
  /** Calls the listener after each change. Returns a function that removes it. */
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }
};
