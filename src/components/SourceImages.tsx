import { ArrowCounterClockwise, ArrowsDownUp, Checkerboard, DiceFive, FolderOpen, Plus, X } from "@phosphor-icons/react";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ImageSlot, SlotImage } from "../App";
import { PATTERNS, type Pattern } from "../lib/patterns";

export interface SourceImagesProps {
  images: [SlotImage | null, SlotImage | null];
  /** The slot that a random photo is downloading for. */
  randomLoading: ImageSlot | null;
  onOpenImage: (slot: ImageSlot) => void;
  onRandomImage: (slot: ImageSlot) => void;
  onPatternImage: (pattern: Pattern, slot: ImageSlot) => void;
  onRemoveSecondImage: () => void;
  onSwapImages: () => void;
  /** Takes a pattern off a slot and shows the image under it again. */
  onRestoreImage: (slot: ImageSlot) => void;
}

/**
 * The two source images, one above the other: A, which the toolbar also loads, and
 * B, which the picture can fade to. Each card can load a file, a random
 * photo or a test pattern, and takes a dropped file. B can be removed, and
 * the swap button between them trades their places.
 */
export function SourceImages({ images, randomLoading, onOpenImage, onRandomImage, onPatternImage, onRemoveSecondImage, onSwapImages, onRestoreImage }: SourceImagesProps) {
  const card = (slot: ImageSlot) => (
    <ImageCard
      slot={slot}
      image={images[slot]}
      loading={randomLoading === slot}
      onOpen={() => onOpenImage(slot)}
      onRandom={() => onRandomImage(slot)}
      onPattern={(pattern) => onPatternImage(pattern, slot)}
      onRemove={slot === 1 ? onRemoveSecondImage : undefined}
      onRestore={() => onRestoreImage(slot)}
    />
  );
  return (
    <div className="source-images">
      {card(0)}
      <button
        className="source-swap"
        disabled={!images[0] || !images[1]}
        onClick={onSwapImages}
        title="Swap A and B"
        aria-label="Swap the first and second images"
      >
        <ArrowsDownUp size={18} />
      </button>
      {card(1)}
    </div>
  );
}

function ImageCard({ slot, image, loading, onOpen, onRandom, onPattern, onRemove, onRestore }: {
  slot: ImageSlot;
  image: SlotImage | null;
  loading: boolean;
  onOpen: () => void;
  onRandom: () => void;
  onPattern: (pattern: Pattern) => void;
  onRemove?: () => void;
  onRestore: () => void;
}) {
  const letter = slot === 0 ? "A" : "B";
  return (
    /* App reads data-image-slot to send a dropped file to this slot. */
    <div className="source-card" data-image-slot={slot}>
      <div className={`source-thumb ${image ? "" : "empty"}`}>
        {image?.under ? (
          /* A pattern over an image: the image's left half, then the pattern's right half. A click on the image half takes the pattern off. */
          <>
            <button
              className="source-half under"
              style={{ backgroundImage: `url(${image.under.thumbnail})` }}
              onClick={onRestore}
              title={`Back to ${image.under.label}`}
              aria-label={`Take the pattern off and show ${image.under.label} again`}
            >
              <ArrowCounterClockwise size={16} weight="bold" />
            </button>
            <div className="source-half pattern" style={{ backgroundImage: `url(${image.thumbnail})` }} />
          </>
        ) : image ? (
          <img src={image.thumbnail} alt="" />
        ) : (
          <span className="source-empty"><Plus size={12} weight="bold" /> Add image</span>
        )}
        <span className="source-letter">{letter}</span>
        {onRemove && image && (
          <button className="source-remove" onClick={onRemove} title="Remove image B" aria-label="Remove the second image">
            <X size={13} weight="bold" />
          </button>
        )}
      </div>
      <div className="source-label" title={image?.label}>{image?.label ?? "Drop or pick an image"}</div>
      <div className="source-actions">
        {isTauri() && (
          <button onClick={onOpen} title="Open an image file" aria-label={`Open an image file as image ${letter}`}>
            <FolderOpen size={18} />
          </button>
        )}
        <button onClick={onRandom} title="Load a random photo" aria-label={`Load a random photo as image ${letter}`}>
          <DiceFive size={18} className={loading ? "spin" : undefined} />
        </button>
        <PatternMenu letter={letter} selected={image?.patternId} onPattern={onPattern} />
      </div>
    </div>
  );
}

/**
 * The test pattern list for one card, styled like the toolbar's Patterns
 * menu. It opens on the page body under the button, so the narrow panel
 * does not cut it off, and stays open while patterns are tried. A click
 * outside it, Esc or the button closes it. The pattern in use is marked.
 */
function PatternMenu({ letter, selected, onPattern }: {
  letter: string;
  selected?: string;
  onPattern: (pattern: Pattern) => void;
}) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    /* Capture, so Esc closes the menu and does not also leave full screen. */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", close);
    };
  }, [position]);

  /** Moves the menu up when it would go past the bottom of the window. */
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!position || !menu) return;
    const bottom = position.top + menu.offsetHeight;
    if (bottom > window.innerHeight - 8) setPosition({ ...position, top: Math.max(8, window.innerHeight - 8 - menu.offsetHeight) });
  }, [position]);

  const toggle = () => {
    if (position) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current!.getBoundingClientRect();
    setPosition({ left: rect.left, top: rect.bottom + 4 });
  };

  const groups = ["Repeating", "Not repeating"] as const;
  return (
    <>
      <button
        ref={buttonRef}
        className={position ? "active" : undefined}
        onClick={toggle}
        title="Use a test pattern"
        aria-label={`Use a test pattern as image ${letter}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
      >
        <Checkerboard size={18} />
      </button>
      {position && createPortal(
        <div ref={menuRef} className="toolbar-dropdown source-pattern-menu" role="menu" aria-label={`Patterns for image ${letter}`} style={position}>
          {groups.map((group) => (
            <div key={group} className="toolbar-dropdown-group">
              <div className="toolbar-dropdown-heading">{group}</div>
              {PATTERNS.filter((pattern) => pattern.group === group).map((pattern) => (
                <button
                  key={pattern.id}
                  role="menuitemradio"
                  aria-checked={selected === pattern.id}
                  className={`toolbar-dropdown-item ${selected === pattern.id ? "selected" : ""}`}
                  onClick={() => onPattern(pattern)}
                >
                  {pattern.label}
                </button>
              ))}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
