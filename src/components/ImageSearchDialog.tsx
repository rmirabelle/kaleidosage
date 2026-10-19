import { CircleNotch, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { QUALITY, searchCommons, type CommonsPhoto } from "../lib/images";

const STORE_KEY = "kaleidosage.image-search";

function loadStored(): { words: string; quality: boolean } {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as { words?: unknown; quality?: unknown };
    return { words: typeof stored.words === "string" ? stored.words : "", quality: stored.quality !== false };
  } catch {
    return { words: "", quality: true };
  }
}

/**
 * A search for a source photo on Wikimedia Commons. Every result is a JPEG
 * photo at least 4K wide; "Quality images only" also keeps only photos that
 * Commons reviewers marked as good. A click on a result loads it into the
 * slot. Esc, the close button or a click outside the dialog closes it.
 */
export function ImageSearchDialog({ letter, onPick, onCancel }: {
  letter: string;
  onPick: (photo: CommonsPhoto) => void;
  onCancel: () => void;
}) {
  const stored = useRef(loadStored()).current;
  const [words, setWords] = useState(stored.words);
  const [quality, setQuality] = useState(stored.quality);
  const [photos, setPhotos] = useState<CommonsPhoto[]>([]);
  const [next, setNext] = useState<number | undefined>();
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** Each search gets a number; the answer of an older search is ignored. */
  const searchId = useRef(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const search = async (offset = 0) => {
    const text = words.trim();
    if (!text) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ words: text, quality }));
    } catch { /* The words are then not kept for the next search. */ }
    const id = ++searchId.current;
    setSearching(true);
    setMessage(null);
    if (offset === 0) setPhotos([]);
    try {
      const found = await searchCommons(quality ? `${QUALITY} ${text}` : text, { offset });
      if (id !== searchId.current) return;
      setPhotos((previous) => offset === 0 ? found.photos : [...previous, ...found.photos]);
      setNext(found.next);
      if (offset === 0 && found.photos.length === 0) {
        setMessage(quality ? "No 4K photos found. Try other words, or turn off Quality images only." : "No 4K photos found. Try other words.");
      }
    } catch (error) {
      if (id === searchId.current) setMessage(`The search did not work. ${error instanceof Error ? error.message : "Check the internet connection."}`);
    } finally {
      if (id === searchId.current) setSearching(false);
    }
  };

  return (
    <div className="about-dialog-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className="about-dialog video-dialog image-search-dialog" role="dialog" aria-modal="true" aria-labelledby="image-search-title">
        <header className="video-dialog-header">
          <div className="open-dialog-title-icon"><MagnifyingGlass size={22} weight="duotone" /></div>
          <div>
            <h2 id="image-search-title">Search Photos for Source {letter}</h2>
            <p>4K photos from Wikimedia Commons. Detailed architecture, patterns and abstract pictures work best.</p>
          </div>
          <button className="about-dialog-close" onClick={onCancel} aria-label="Close" data-tip="Close"><X size={18} /></button>
        </header>
        <div className="video-dialog-body">
          <div className="image-search-bar">
            <input
              className="video-input"
              type="text"
              value={words}
              placeholder="For example: mosque ceiling, rose window, fractal"
              autoFocus
              spellCheck={false}
              onChange={(event) => setWords(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void search(); }}
            />
            <button className="button primary" onClick={() => void search()} disabled={!words.trim() || searching}>Search</button>
          </div>
          <label className="video-radio">
            <input type="checkbox" checked={quality} onChange={(event) => setQuality(event.target.checked)} />
            Quality images only
          </label>
          <div className="image-search-results" aria-busy={searching}>
            {photos.map((photo) => (
              <button key={photo.title} className="image-search-result" data-tip={`${photo.label} (${photo.width} × ${photo.height})`} onClick={() => onPick(photo)}>
                <img src={photo.thumb} alt={photo.label} loading="lazy" />
              </button>
            ))}
            {message && <p className="video-note image-search-message">{message}</p>}
            {searching && <div className="image-search-message"><CircleNotch size={20} className="spin" /></div>}
          </div>
          {next !== undefined && !searching && photos.length > 0 && (
            <button className="button secondary image-search-more" onClick={() => void search(next)}>Show more</button>
          )}
        </div>
      </div>
    </div>
  );
}
