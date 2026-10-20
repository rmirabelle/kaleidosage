import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageSquare, Plus } from "@phosphor-icons/react";
import type { FxStep } from "../engine/renderer";
import { EFFECT_NAMES } from "../engine/submodes";

/** One short line on what each effect does, under its name on its card. */
const EFFECT_NOTES: Record<FxStep, string> = {
  kaleidoscope: "Mirrors the picture into wedges or tiles.",
  map: "Bends space with a math map: spirals, tunnels, Möbius.",
  warp: "Noise, ripples, waves and swirls push the picture around.",
  blur: "Blurs the picture through a mask.",
  trails: "Earlier frames stay behind and fade.",
  smear: "Parts of the picture show an earlier moment.",
  contours: "Draws lines along areas of equal brightness.",
  relief: "Gives the picture raised edges and depth.",
  driver: "A moving pattern bends, reveals or lights the picture.",
  camera: "Flies a camera over the picture as a landscape.",
  sort: "Sorts pixels by brightness into streaks.",
  particles: "Bright areas send out moving particles.",
  rays: "Light rays stream out from bright areas.",
  bloom: "Bright areas glow.",
  sharpen: "Makes edges and fine detail crisper.",
  color: "Tints the whole picture with a color.",
  levels: "Sets the exposure and the black level."
};

/**
 * The card thumbnails, 16:9 (320 x 180), in src/assets/fx: <effect>.jpg for
 * an effect with one look, or <effect>-<n>-<type>.jpg for each type of an
 * effect with types, numbered in the order of its Type menu. A card with no
 * file shows a placeholder.
 */
const THUMBNAILS: Partial<Record<string, string[]>> = {};
for (const [path, url] of Object.entries(import.meta.glob<string>("../assets/fx/*.{jpg,webp,png}", { eager: true, query: "?url", import: "default" })).sort(([a], [b]) => a.localeCompare(b))) {
  const step = path.replace(/^.*\//, "").split(/[-.]/)[0];
  (THUMBNAILS[step] ??= []).push(url);
}

/** The cards in each row of the grid, for Up and Down. The CSS grid has the same count. */
const COLUMNS = 5;

/** An effect with types shows the next type's thumbnail after this time. */
const TYPE_MS = 1000;

/**
 * The + New button at the end of the FX title bar. It opens the Add effect
 * menu at the right of the button: a card for each effect, with a
 * thumbnail, its name and a short note. Effects that are in the list
 * already show dimmed and cannot be picked. A pick adds that effect and
 * closes the menu. Keys: the arrow keys move, Enter or Space picks, Esc
 * closes. A click outside closes it.
 */
export function AddEffectMenu({ taken, onAdd }: {
  /** The effects that are in the list already. */
  taken: readonly FxStep[];
  onAdd: (step: FxStep) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const free = EFFECT_NAMES.some(([step]) => !taken.includes(step));
  return (
    <>
      <div className="panel-buttons panel-title-buttons add-effect">
        <button
          ref={buttonRef}
          className={`panel-button ${open ? "active" : ""}`}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={!free}
          data-tip={free ? "Add an effect at the end of the list" : "Every effect is in the list"}
          onClick={() => setOpen(!open)}
        >
          <Plus size={16} weight="bold" /> New
        </button>
      </div>
      {open && createPortal(
        <AddEffectCards
          button={buttonRef.current!}
          taken={taken}
          onPick={(step) => {
            setOpen(false);
            onAdd(step);
          }}
          onClose={() => setOpen(false)}
        />,
        document.body
      )}
    </>
  );
}

function AddEffectCards({ button, taken, onPick, onClose }: {
  /** The New button that opened the menu: the menu opens at its right. */
  button: HTMLButtonElement;
  taken: readonly FxStep[];
  onPick: (step: FxStep) => void;
  onClose: () => void;
}) {
  const canPick = (index: number) => !taken.includes(EFFECT_NAMES[index][0]);
  const [active, setActive] = useState(() => Math.max(0, EFFECT_NAMES.findIndex((_, index) => canPick(index))));
  const activeRef = useRef(active);
  activeRef.current = active;
  const menuRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [tick, setTick] = useState(0);

  /**
   * At the right of the button, top edges in line. When the menu would go
   * past the bottom of the window, it opens upward, bottom edges in line.
   */
  useLayoutEffect(() => {
    const anchor = button.getBoundingClientRect();
    const menu = menuRef.current!.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor.right + 8, window.innerWidth - 8 - menu.width));
    const top = anchor.top + menu.height > window.innerHeight - 8 ? Math.max(8, anchor.bottom - menu.height) : anchor.top;
    setPosition({ left, top });
  }, [button]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), TYPE_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (position) cardRefs.current[active]?.focus();
  }, [active, position]);

  useEffect(() => {
    /** The next card that can be picked, in steps of `by`, or the same card when there is none. */
    const move = (by: number) => {
      for (let index = activeRef.current + by; index >= 0 && index < EFFECT_NAMES.length; index += by) {
        if (canPick(index)) return setActive(index);
      }
    };
    /* The button toggles the menu itself, so a press on it does not count as outside. */
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !button.contains(target)) onClose();
    };
    /* Capture, so these keys do not also reach the app's shortcuts (Space pauses, Esc leaves full screen). */
    const onKeyDown = (event: KeyboardEvent) => {
      const keys: Record<string, () => void> = {
        Escape: onClose,
        ArrowRight: () => move(1),
        ArrowLeft: () => move(-1),
        ArrowDown: () => move(COLUMNS),
        ArrowUp: () => move(-COLUMNS),
        Enter: () => canPick(activeRef.current) && onPick(EFFECT_NAMES[activeRef.current][0]),
        " ": () => canPick(activeRef.current) && onPick(EFFECT_NAMES[activeRef.current][0])
      };
      const action = keys[event.key];
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      action();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [button, taken, onPick, onClose]);

  return (
    <div
      ref={menuRef}
      className="add-effect-menu"
      role="menu"
      aria-labelledby="add-effect-title"
      style={position ?? { visibility: "hidden" }}
    >
      <h2 id="add-effect-title" className="add-effect-title">Add an effect</h2>
      <div className="add-effect-grid">
        {EFFECT_NAMES.map(([step, name], index) => {
          const inList = !canPick(index);
          const thumbnails = THUMBNAILS[step] ?? [];
          /** An effect in the list already stays on its first type. */
          const shownType = inList ? 0 : tick % thumbnails.length;
          return (
            <button
              key={step}
              ref={(element) => { cardRefs.current[index] = element; }}
              role="menuitem"
              className={`add-effect-card ${index === active ? "active" : ""}`}
              disabled={inList}
              tabIndex={index === active ? 0 : -1}
              onPointerEnter={() => !inList && setActive(index)}
              onClick={() => onPick(step)}
            >
              <span className="add-effect-thumb">
                {thumbnails.length ? thumbnails.map((url, shown) => (
                  <img key={url} src={url} alt="" draggable={false} className={shown === shownType ? "shown" : ""} />
                )) : <ImageSquare size={24} />}
                {thumbnails.length > 1 && <span className="add-effect-badge types">{thumbnails.length} Types</span>}
                {inList && <span className="add-effect-badge in-list">Already added</span>}
              </span>
              <span className="add-effect-name">{name}</span>
              <span className="add-effect-note">{EFFECT_NOTES[step]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
