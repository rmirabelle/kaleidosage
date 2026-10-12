import { useEffect, useRef, useState } from "react";
import { ArrowsOut, Camera, CaretDown, Checkerboard, FilmSlate, FloppyDisk, FolderOpen, Gauge, Shuffle } from "@phosphor-icons/react";
import { PATTERNS, type Pattern } from "../lib/patterns";

interface Props {
  onRandomImage: () => void;
  onOpenImage: () => void;
  onPattern: (pattern: Pattern) => void;
  onSave: () => void;
  onOpenScene: () => void;
  onSaveScene: () => void;
  statsOpen: boolean;
  onToggleStats: () => void;
  onFullscreen: () => void;
}

/**
 * The app toolbar under the title bar. Image sources have text labels; the
 * other actions are icon buttons, with their names in the tooltips.
 */
export function Toolbar(props: Props) {
  return (
    <nav className="toolbar">
      <button className="toolbar-button" onClick={props.onRandomImage} title="Load a random photo (R)"><Shuffle size={15} /> Random image</button>
      <button className="toolbar-button" onClick={props.onOpenImage} title="Open an image file (O)"><FolderOpen size={15} /> Open image…</button>
      <PatternMenu onPattern={props.onPattern} />
      <div className="toolbar-divider" />
      <button className="toolbar-button icon" onClick={props.onOpenScene} title="Open scene… (Ctrl+O)" aria-label="Open scene"><FilmSlate size={16} /></button>
      <button className="toolbar-button icon" onClick={props.onSaveScene} title="Save scene… — all settings and the image, in a .ksage file (Ctrl+S)" aria-label="Save scene"><FloppyDisk size={16} /></button>
      <button className="toolbar-button icon" onClick={props.onSave} title="Save PNG to Pictures\Kaleido Sage (S)" aria-label="Save PNG"><Camera size={16} /></button>
      <div className="toolbar-spacer" />
      <button
        className={`toolbar-button icon ${props.statsOpen ? "active" : ""}`}
        onClick={props.onToggleStats}
        title="Performance: frame rate and GPU time (P)"
        aria-label="Performance"
        aria-pressed={props.statsOpen}
      >
        <Gauge size={16} />
      </button>
      <button className="toolbar-button icon" onClick={props.onFullscreen} title="Full screen (F)" aria-label="Full screen"><ArrowsOut size={16} /></button>
    </nav>
  );
}

/** A drop-down list of the built-in test patterns, in two groups. */
function PatternMenu({ onPattern }: { onPattern: (pattern: Pattern) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  /** A click outside the menu, or Escape, closes it. */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const groups = ["Repeating", "Not repeating"] as const;
  return (
    <div className="toolbar-menu" ref={rootRef}>
      <button
        className={`toolbar-button ${open ? "active" : ""}`}
        onClick={() => setOpen(!open)}
        title="Use a built-in test pattern as the image"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Checkerboard size={15} /> Patterns <CaretDown size={11} weight="bold" className="toolbar-caret" />
      </button>
      {open && (
        <div className="toolbar-dropdown" role="menu">
          {groups.map((group) => (
            <div key={group} className="toolbar-dropdown-group">
              <div className="toolbar-dropdown-heading">{group}</div>
              {PATTERNS.filter((pattern) => pattern.group === group).map((pattern) => (
                <button
                  key={pattern.id}
                  role="menuitem"
                  className="toolbar-dropdown-item"
                  onClick={() => {
                    setOpen(false);
                    onPattern(pattern);
                  }}
                >
                  {pattern.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
