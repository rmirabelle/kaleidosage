import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CaretDown } from "@phosphor-icons/react";

/**
 * A themed replacement for a native menu: a button that shows the picked
 * option, and a list in the toolbar dropdown look. The list opens on the page
 * body, as wide as the button, below it or above it when there is no room.
 * Keys: Up and Down move, Enter or Space picks, Esc closes. A click outside
 * closes it. The options in "marks" show "mark" after their name; the
 * button shows it too while any marked option is not the picked one.
 */
export function Dropdown<V extends string | number>({ value, options, onChange, label, marks, mark }: {
  value: V;
  options: readonly (readonly [V, string])[];
  onChange: (value: V) => void;
  label?: string;
  marks?: ReadonlySet<V>;
  mark?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  /** The highlighted option, for the key handler, which keeps its first copy of the state. */
  const activeRef = useRef(0);
  activeRef.current = active;
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(0, options.findIndex(([option]) => option === value));

  const pick = (index: number) => {
    onChange(options[index][0]);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const show = () => {
    setActive(selectedIndex);
    setOpen(true);
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
    setPosition({ left: button.left, top, width: button.width });
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
        Home: () => setActive(0),
        End: () => setActive(options.length - 1),
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
      <button
        ref={buttonRef}
        className={`panel-select dropdown-button ${open ? "open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (open || !["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) return;
          /* Stop here, so Space opens the list and does not also pause. */
          event.preventDefault();
          event.stopPropagation();
          show();
        }}
      >
        <span>{options[selectedIndex]?.[1]}</span>
        {marks && [...marks].some((option) => option !== value) && mark}
        <CaretDown size={11} weight="bold" className="dropdown-caret" />
      </button>
      {open && createPortal(
        <div
          ref={listRef}
          className="toolbar-dropdown dropdown-list"
          role="listbox"
          aria-label={label}
          style={position ? { left: position.left, top: position.top, width: position.width } : { visibility: "hidden" }}
        >
          {options.map(([option, text], index) => (
            <button
              key={String(option)}
              role="option"
              aria-selected={option === value}
              className={`toolbar-dropdown-item ${option === value ? "selected" : ""} ${index === active ? "active" : ""}`}
              onPointerEnter={() => setActive(index)}
              onClick={() => pick(index)}
            >
              {text}
              {marks?.has(option) && mark}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
