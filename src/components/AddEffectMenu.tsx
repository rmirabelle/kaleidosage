import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "@phosphor-icons/react";

/**
 * The + New button at the end of the FX title bar, and its menu of the
 * effects that are not in the list yet. A pick adds that effect. The menu looks like the
 * other dropdown lists. Keys: Up and Down move, Enter or Space picks, Esc
 * closes. A click outside closes it.
 */
export function AddEffectMenu<K extends string>({ options, onAdd }: {
  /** The effects that can be added, with their names, in menu order. */
  options: readonly (readonly [K, string])[];
  onAdd: (key: K) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  activeRef.current = active;
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const pick = (index: number) => {
    const option = options[index];
    setOpen(false);
    if (option) onAdd(option[0]);
  };

  /** Below the button, or above it when the list would go past the bottom of the window. */
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const button = buttonRef.current!.getBoundingClientRect();
    const height = listRef.current?.offsetHeight ?? 0;
    const below = button.bottom + 4;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, button.top - 4 - height) : below;
    /* The small header button is narrower than the effect names, so the menu is at least 180px wide. */
    setPosition({ left: button.left, top, width: Math.max(button.width, 180) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!listRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    /* Capture, so these keys do not also reach the app's shortcuts (Space pauses, Esc leaves full screen). */
    const onKeyDown = (event: KeyboardEvent) => {
      const keys: Record<string, () => void> = {
        Escape: close,
        ArrowDown: () => setActive((index) => Math.min(options.length - 1, index + 1)),
        ArrowUp: () => setActive((index) => Math.max(0, index - 1)),
        Enter: () => pick(activeRef.current),
        " ": () => pick(activeRef.current)
      };
      const action = keys[event.key];
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      action();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [open, options]);

  return (
    <>
      <div className="panel-buttons panel-title-buttons add-effect">
        <button
          ref={buttonRef}
          className={`panel-button ${open ? "active" : ""}`}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={options.length === 0}
          title={options.length === 0 ? "Every effect is in the list" : "Add an effect at the end of the list"}
          onClick={() => {
            setActive(0);
            setOpen(!open);
          }}
        >
          <Plus size={16} weight="bold" /> New
        </button>
      </div>
      {open && createPortal(
        <div
          ref={listRef}
          className="toolbar-dropdown dropdown-list"
          role="menu"
          aria-label="Add effect"
          style={position ? { left: position.left, top: position.top, width: position.width } : { visibility: "hidden" }}
        >
          {options.map(([key, text], index) => (
            <button
              key={key}
              role="menuitem"
              className={`toolbar-dropdown-item ${index === active ? "active" : ""}`}
              onPointerEnter={() => setActive(index)}
              onClick={() => pick(index)}
            >
              {text}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
