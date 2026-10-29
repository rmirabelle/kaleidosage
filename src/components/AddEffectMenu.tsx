import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "@phosphor-icons/react";
import type { FxStep } from "../engine/renderer";
import { EFFECT_COLUMNS, EFFECT_NAMES, EFFECT_TYPES, effectName } from "../engine/submodes";

/** One short line on what each effect does, in its preview. */
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
  terrain: "Flies a camera over the picture as a landscape.",
  camera: "Flies a camera over the flat picture.",
  solid: "Puts the picture on a turning 3D shape.",
  sort: "Sorts pixels by brightness into streaks.",
  particles: "Bright areas send out moving particles.",
  cycles: "Light cycles race and leave lines in the picture's colors.",
  rays: "Light rays stream out from bright areas.",
  lasers: "A fan of laser beams sweeps from one point.",
  outlines: "Glowing rings, squares, triangles or stars draw themselves, or a snake crawls.",
  picture: "Lays an image or a video over the picture.",
  bloom: "Bright areas glow.",
  sharpen: "Makes edges and fine detail crisper.",
  color: "Tints the whole picture with a color.",
  levels: "Sets the exposure and the black level.",
  mask: "A radial gradient of grays fades parts of the picture out."
};

/**
 * The preview thumbnails, 16:9 (320 x 180), in src/assets/fx: <effect>.jpg
 * for an effect with one look, or <effect>-<n>-<type>.jpg for each type of
 * an effect with types, numbered in the order of its Type menu. A preview
 * with no file shows only the name and the note.
 */
const THUMBNAILS: Partial<Record<string, string[]>> = {};
for (const [path, url] of Object.entries(import.meta.glob<string>("../assets/fx/*.{jpg,webp,png}", { eager: true, query: "?url", import: "default" })).sort(([a], [b]) => a.localeCompare(b))) {
  const step = path.replace(/^.*\//, "").split(/[-.]/)[0];
  (THUMBNAILS[step] ??= []).push(url);
}

/** The menu's effects in key order: the left column top to bottom, then the right column. */
const ORDER: readonly FxStep[] = EFFECT_COLUMNS.flat();

/** An effect with types shows the next type's thumbnail after this time. */
const TYPE_MS = 1000;

/**
 * The + New button at the end of the FX title bar. It opens the Add effect
 * menu at the right of the button: two columns of effect names, A to Z
 * (see EFFECT_COLUMNS). The highlighted name shows a preview frame
 * at the right of both columns, with its thumbnails (one per type, in
 * turn) and a short note. Effects that are in the list already show dimmed
 * and cannot be picked. A pick adds that effect and closes the menu. Keys:
 * Up and Down move (from the bottom of the left column to the top of the
 * right one), Left and Right go to the nearest name in the other column,
 * Enter or Space picks, Esc closes. A click outside closes it.
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
        <AddEffectList
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

function AddEffectList({ button, taken, onPick, onClose }: {
  /** The New button that opened the menu: the menu opens at its right. */
  button: HTMLButtonElement;
  taken: readonly FxStep[];
  onPick: (step: FxStep) => void;
  onClose: () => void;
}) {
  const canPick = (index: number) => !taken.includes(ORDER[index]);
  /** The highlighted name, as an index in ORDER. The pointer can highlight an effect in the list already, to show its preview; the keys skip it. */
  const [active, setActive] = useState(() => Math.max(0, ORDER.findIndex((_, index) => canPick(index))));
  const activeRef = useRef(active);
  activeRef.current = active;
  const menuRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [previewPosition, setPreviewPosition] = useState<{ left: number; top: number } | null>(null);
  /** Changes when the list scrolls, so the preview follows its name. */
  const [scroll, setScroll] = useState(0);
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

  /**
   * At the right of the list, top edge in line with the highlighted name,
   * and inside the window. When there is no room at the right, at the left.
   */
  useLayoutEffect(() => {
    if (!position) return;
    const menu = menuRef.current!.getBoundingClientRect();
    const item = itemRefs.current[active]!.getBoundingClientRect();
    const preview = previewRef.current!.getBoundingClientRect();
    const left = menu.right + 6 + preview.width <= window.innerWidth - 8 ? menu.right + 6 : Math.max(8, menu.left - 6 - preview.width);
    const top = Math.max(8, Math.min(item.top - 5, window.innerHeight - 8 - preview.height));
    setPreviewPosition({ left, top });
  }, [active, position, scroll]);

  /* Each new name starts its thumbnails at the first type. */
  useEffect(() => {
    setTick(0);
    const timer = window.setInterval(() => setTick((value) => value + 1), TYPE_MS);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (position) itemRefs.current[active]?.focus();
  }, [active, position]);

  useEffect(() => {
    /** The next name that can be picked, in steps of `by`, or the same name when there is none. */
    const move = (from: number, by: number) => {
      for (let index = from + by; index >= 0 && index < ORDER.length; index += by) {
        if (canPick(index)) return setActive(index);
      }
    };
    /** The name in the other column nearest in height to the highlighted one, of those that can be picked. */
    const across = () => {
      const column = (index: number) => itemRefs.current[index]!.closest(".add-effect-column");
      const from = itemRefs.current[activeRef.current]!.getBoundingClientRect();
      let best = -1;
      let bestDistance = Infinity;
      ORDER.forEach((_, index) => {
        if (!canPick(index) || column(index) === column(activeRef.current)) return;
        const distance = Math.abs(itemRefs.current[index]!.getBoundingClientRect().top - from.top);
        if (distance < bestDistance) [best, bestDistance] = [index, distance];
      });
      if (best >= 0) setActive(best);
    };
    const pickActive = () => canPick(activeRef.current) && onPick(ORDER[activeRef.current]);
    /* The button toggles the menu itself, so a press on it does not count as outside. */
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !button.contains(target)) onClose();
    };
    /* Capture, so these keys do not also reach the app's shortcuts (Space pauses, Esc leaves full screen). */
    const onKeyDown = (event: KeyboardEvent) => {
      const keys: Record<string, () => void> = {
        Escape: onClose,
        ArrowDown: () => move(activeRef.current, 1),
        ArrowUp: () => move(activeRef.current, -1),
        ArrowLeft: across,
        ArrowRight: across,
        Home: () => move(-1, 1),
        End: () => move(ORDER.length, -1),
        Enter: pickActive,
        " ": pickActive
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

  const activeStep = ORDER[active];
  const activeName = effectName(activeStep);
  const activeInList = !canPick(active);
  const thumbnails = THUMBNAILS[activeStep] ?? [];
  const typeCount = EFFECT_TYPES[activeStep]?.length ?? thumbnails.length;
  return (
    <>
      <div
        ref={menuRef}
        className="toolbar-dropdown add-effect-menu"
        role="menu"
        aria-labelledby="add-effect-title"
        style={position ?? { visibility: "hidden" }}
        onScroll={() => setScroll((value) => value + 1)}
      >
        <div id="add-effect-title" className="toolbar-dropdown-heading">Add an effect</div>
        <div className="add-effect-columns">
          {EFFECT_COLUMNS.map((column, columnIndex) => (
            <div key={columnIndex} className="add-effect-column" role="group">
              {column.map((step) => {
                const index = ORDER.indexOf(step);
                const inList = !canPick(index);
                return (
                  <button
                    key={step}
                    ref={(element) => { itemRefs.current[index] = element; }}
                    role="menuitem"
                    aria-disabled={inList}
                    className={`toolbar-dropdown-item ${index === active ? "active" : ""} ${inList ? "in-list" : ""}`}
                    tabIndex={index === active ? 0 : -1}
                    onPointerEnter={() => setActive(index)}
                    onClick={() => !inList && onPick(step)}
                  >
                    {effectName(step)}
                    {inList && <span className="add-effect-added">Added</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {position && (
        <div
          ref={previewRef}
          className="add-effect-preview"
          aria-hidden
          style={previewPosition ?? { visibility: "hidden" }}
        >
          {thumbnails.length > 0 && (
            <span className="add-effect-thumb">
              {thumbnails.map((url, shown) => (
                <img key={url} src={url} alt="" draggable={false} className={shown === tick % thumbnails.length ? "shown" : ""} />
              ))}
              {typeCount > 1 && <span className="add-effect-badge types">{typeCount} Types</span>}
            </span>
          )}
          <span className="add-effect-name">{activeName}</span>
          <span className="add-effect-note">{EFFECT_NOTES[activeStep]}</span>
          {activeInList && <span className="add-effect-note in-list">This effect is in the list already.</span>}
        </div>
      )}
    </>
  );
}
