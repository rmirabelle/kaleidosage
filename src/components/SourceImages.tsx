import { ArrowCounterClockwise, ArrowsLeftRight, MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { ColorFolder } from "./ColorFolder";
import { ColorPattern } from "./ColorPattern";
import { RedDice } from "./RedDice";
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
  /** Opens the photo search for the slot. */
  onSearchImage: (slot: ImageSlot) => void;
  onPatternImage: (pattern: Pattern, slot: ImageSlot) => void;
  /** Removes one of the images. B moves up when A is removed. */
  onRemoveImage: (slot: ImageSlot) => void;
  onSwapImages: () => void;
  /** Takes a pattern off a slot and shows the image under it again. */
  onRestoreImage: (slot: ImageSlot) => void;
  /** Whether a source video loops seamlessly (PlayState.videoCrossfade): the Loop check box under each video slot. */
  videoLoop: boolean;
  onVideoLoop: (on: boolean) => void;
}

/**
 * The two source images, side by side: A, which the toolbar also loads, and
 * B, which the picture can fade to. Each card can load a file, a random
 * photo, a searched photo or a test pattern, and takes a dropped file. B can be removed, and A
 * too when B is there to take its place. With both images, a swap button
 * between them trades their places. A slot with a video has a Loop check
 * box under it, in a row of its own, so the cards and the swap button stay
 * in line.
 */
export function SourceImages({ images, randomLoading, onOpenImage, onRandomImage, onSearchImage, onPatternImage, onRemoveImage, onSwapImages, onRestoreImage, videoLoop, onVideoLoop }: SourceImagesProps) {
  const removable = (slot: ImageSlot) => slot === 1 || Boolean(images[1]);
  const card = (slot: ImageSlot) => (
    <ImageCard
      slot={slot}
      image={images[slot]}
      loading={randomLoading === slot}
      onOpen={() => onOpenImage(slot)}
      onRandom={() => onRandomImage(slot)}
      onSearch={() => onSearchImage(slot)}
      onPattern={(pattern) => onPatternImage(pattern, slot)}
      onRemove={removable(slot) ? () => onRemoveImage(slot) : undefined}
      onRestore={() => onRestoreImage(slot)}
    />
  );
  return (
    <div className="source-images">
      {card(0)}
      {/* With one image there is nothing to swap, so the button is off. */}
      <button
        className="source-swap"
        disabled={!images[0] || !images[1]}
        onClick={onSwapImages}
        data-tip={images[0] && images[1] ? "Swap A and B" : "Load both sources to swap them"}
        aria-label="Swap sources A and B"
      >
        <ArrowsLeftRight size={16} weight="bold" />
      </button>
      {card(1)}
      {([0, 1] as const).map((slot) => images[slot]?.source instanceof HTMLVideoElement && (
        <label
          key={slot}
          className="source-loop panel-check-inline"
          style={{ gridColumn: slot === 0 ? 1 : 3 }}
          data-tip="The video fades its end into its start, so it loops with no jump. Off, it starts again at the start of each loop. A seamless video export always fades."
        >
          <input type="checkbox" checked={videoLoop} onChange={(event) => onVideoLoop(event.target.checked)} />
          Loop
        </label>
      ))}
    </div>
  );
}

function ImageCard({ slot, image, loading, onOpen, onRandom, onSearch, onPattern, onRemove, onRestore }: {
  slot: ImageSlot;
  image: SlotImage | null;
  loading: boolean;
  onOpen: () => void;
  onRandom: () => void;
  onSearch: () => void;
  onPattern: (pattern: Pattern) => void;
  onRemove?: () => void;
  onRestore: () => void;
}) {
  const letter = slot === 0 ? "A" : "B";
  return (
    /* App reads data-image-slot to send a dropped file to this slot. */
    <div className="source-card" data-image-slot={slot}>
      {/* The file name, above the image; an empty slot keeps the line's height, so both cards line up. */}
      <div className="source-label" data-tip={image?.label}>{image?.label ?? " "}</div>
      <div className={`source-thumb ${image ? "" : "empty"}`}>
        {image?.under ? (
          /* A pattern over an image: the image's left half, then the pattern's right half. A click on the image half takes the pattern off. */
          <>
            <button
              className="source-half under"
              style={{ backgroundImage: `url(${image.under.thumbnail})` }}
              onClick={onRestore}
              data-tip={`Back to ${image.under.label}`}
              aria-label={`Take the pattern off and show ${image.under.label} again`}
            >
              <ArrowCounterClockwise size={16} weight="bold" />
            </button>
            <div className="source-half pattern" style={{ backgroundImage: `url(${image.thumbnail})` }} />
          </>
        ) : image ? (
          <img src={image.thumbnail} alt="" />
        ) : (
          <span className="source-empty"><Plus size={12} weight="bold" /> Image / Video</span>
        )}
        <span className="source-letter">{letter}</span>
        {onRemove && image && (
          <button className="source-remove" onClick={onRemove} data-tip={`Remove source ${letter}`} aria-label={slot === 0 ? "Remove source A; source B moves up" : "Remove source B"}>
            <X size={13} weight="bold" />
          </button>
        )}
        {/* The slot's four buttons, over the bottom of its image: shown while the mouse is over the slot. */}
        <div className="source-actions">
          <button onClick={onRandom} data-tip="Load a random 4K photo: architecture, patterns or fractal art" aria-label={`Load a random photo as source ${letter}`}>
            <RedDice size={17} className={loading ? "spin" : undefined} />
          </button>
          <button onClick={onSearch} data-tip="Search 4K photos on Wikimedia Commons" aria-label={`Search for a photo as source ${letter}`}>
            <MagnifyingGlass size={16} weight="bold" />
          </button>
          <PatternMenu letter={letter} selected={image?.patternId} onPattern={onPattern} />
          {isTauri() && (
            <button onClick={onOpen} data-tip="Open an image or video file" aria-label={`Open an image or video file as source ${letter}`}>
              <ColorFolder size={18} />
            </button>
          )}
        </div>
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
        data-tip="Use a test pattern"
        aria-label={`Use a test pattern as source ${letter}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
      >
        <ColorPattern size={17} />
      </button>
      {position && createPortal(
        <div ref={menuRef} className="toolbar-dropdown source-pattern-menu" role="menu" aria-label={`Patterns for source ${letter}`} style={position}>
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
