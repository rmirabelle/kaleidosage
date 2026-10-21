/**
 * The left side's Playlist column (see FilesCard): its width in px, which
 * the user sets by dragging the line at its right edge, and whether it is
 * collapsed to a narrow strip. Both are kept in localStorage; a playlist
 * keeps the width too (playlist.json, see playlistFile.ts), so a playlist
 * opens with the width it was saved with.
 */

const STORE_KEY = "kaleidosage.audio-files-width";
const COLLAPSED_KEY = "kaleidosage.playlist-collapsed";
export const FILES_WIDTH = { default: 300, min: 200, max: 720 } as const;

const clamp = (width: number) => Math.round(Math.min(FILES_WIDTH.max, Math.max(FILES_WIDTH.min, width)));

function load(): number {
  try {
    const saved = Number(localStorage.getItem(STORE_KEY));
    return saved > 0 ? clamp(saved) : FILES_WIDTH.default;
  } catch {
    return FILES_WIDTH.default;
  }
}

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

class PanelLayout {
  filesWidth = load();
  filesCollapsed = loadCollapsed();
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  setFilesWidth(width: number) {
    const next = clamp(width);
    if (next === this.filesWidth) return;
    this.filesWidth = next;
    try { localStorage.setItem(STORE_KEY, String(next)); } catch { /* The width then lasts until the app closes. */ }
    this.changed();
  }

  setFilesCollapsed(collapsed: boolean) {
    if (collapsed === this.filesCollapsed) return;
    this.filesCollapsed = collapsed;
    try { localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0"); } catch { /* It then lasts until the app closes. */ }
    this.changed();
  }

  private changed() {
    for (const listener of this.listeners) listener();
  }
}

export const panelLayout = new PanelLayout();
