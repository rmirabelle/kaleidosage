import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { CaretDown } from "@phosphor-icons/react";

/** Fonts for a browser without the app (the dev page in a plain browser). */
const FALLBACK_FONTS = ["Arial", "Bahnschrift", "Calibri", "Cambria", "Candara", "Consolas", "Constantia", "Corbel", "Courier New", "Georgia", "Impact", "Segoe Print", "Segoe Script", "Segoe UI", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana"];

/** The installed font families, read once (see fonts.rs). */
let fontList: Promise<string[]> | null = null;
function installedFonts(): Promise<string[]> {
  fontList ??= (isTauri() ? invoke<string[]>("font_families") : Promise.resolve(FALLBACK_FONTS))
    .then((names) => (names.length ? names : FALLBACK_FONTS))
    .catch(() => FALLBACK_FONTS);
  return fontList;
}

/**
 * The Text effect's Font box: a combo box. A click puts the focus in it
 * (it shows as active) and opens the list of installed families. Up and
 * Down go to the font before or after and use it at once, so the text on
 * the screen changes as you go; Page Up and Page Down jump 10. Typing keeps
 * the names that hold the typed letters, in any place. Enter or a click on
 * a name keeps the font and closes the list; Esc goes back to the font from
 * before the focus. A click outside closes the list and takes the focus
 * away, and keeps the font.
 */
export function FontPicker({ value, onChange }: { value: string; onChange: (font: string) => void }) {
  const [fonts, setFonts] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  /** The typed words, or null while the box shows the font's name. */
  const [search, setSearch] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** The font when the box got the focus, for Esc. */
  const startRef = useRef(value);

  useEffect(() => {
    let live = true;
    void installedFonts().then((names) => live && setFonts(names));
    return () => {
      live = false;
    };
  }, []);

  const shown = useMemo(() => {
    const words = (search ?? "").trim().toLowerCase();
    return words ? fonts.filter((font) => font.toLowerCase().includes(words)) : fonts;
  }, [fonts, search]);

  const openList = () => {
    if (open) return;
    startRef.current = value;
    setSearch(null);
    setActive(Math.max(0, fonts.indexOf(value)));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setSearch(null);
  };
  const leave = () => {
    close();
    inputRef.current?.blur();
  };
  /** Goes to the name at "index" of the shown names, and uses that font at once. */
  const goTo = (index: number) => {
    if (shown.length === 0) return;
    const next = Math.min(shown.length - 1, Math.max(0, index));
    setActive(next);
    onChange(shown[next]);
  };

  /** Below the box, or above it when there is more room there; the list scrolls in the room it has. */
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const box = boxRef.current!.getBoundingClientRect();
    const below = window.innerHeight - box.bottom - 12;
    const above = box.top - 12;
    const height = Math.min(420, Math.max(below, above));
    const top = below >= Math.min(420, above) ? box.bottom + 4 : box.top - 4 - height;
    const width = Math.max(box.width, 240);
    setPosition({ left: Math.max(8, Math.min(box.left, window.innerWidth - 8 - width)), top, width, height });
  }, [open]);

  /* The highlighted name stays in view. */
  useEffect(() => {
    listRef.current?.querySelector(".toolbar-dropdown-item.active")?.scrollIntoView({ block: "nearest" });
  }, [active, open, shown, position]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!listRef.current?.contains(target) && !boxRef.current?.contains(target)) leave();
    };
    const onResize = () => close();
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("blur", onResize);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("blur", onResize);
    };
  }, [open]);

  return (
    <>
      <div
        ref={boxRef}
        className={`panel-select font-picker-box ${open ? "open" : ""}`}
        data-tip="The font. Click, then type to find one, or use Up and Down to try each font."
        onPointerDown={(event) => {
          /* A press on the caret puts the focus in the box too. */
          if (event.target !== inputRef.current) {
            event.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="font-picker-list"
          aria-label="Font"
          spellCheck={false}
          value={search ?? value}
          onFocus={(event) => {
            openList();
            event.currentTarget.select();
          }}
          onClick={openList}
          onBlur={close}
          onChange={(event) => {
            openList();
            setSearch(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            const keys: Record<string, () => void> = {
              ArrowDown: () => (open ? goTo(active + 1) : openList()),
              ArrowUp: () => (open ? goTo(active - 1) : openList()),
              PageDown: () => goTo(active + 10),
              PageUp: () => goTo(active - 10),
              Enter: () => {
                if (open && shown[active]) onChange(shown[active]);
                leave();
              },
              Escape: () => {
                onChange(startRef.current);
                leave();
              }
            };
            const action = keys[event.key];
            /* Stop every key here: the app's shortcuts (Esc leaves full screen) must not also run. */
            event.stopPropagation();
            if (!action) return;
            event.preventDefault();
            action();
          }}
        />
        <CaretDown size={11} weight="bold" className="dropdown-caret" />
      </div>
      {open && createPortal(
        <div
          ref={listRef}
          id="font-picker-list"
          role="listbox"
          aria-label="Fonts"
          className="toolbar-dropdown dropdown-list font-picker-list"
          style={position ? { left: position.left, top: position.top, width: position.width, maxHeight: position.height } : { visibility: "hidden" }}
          /* A press in the list keeps the focus in the box. */
          onPointerDown={(event) => event.preventDefault()}
        >
          {shown.map((font, index) => (
            <button
              key={font}
              role="option"
              tabIndex={-1}
              aria-selected={font === value}
              className={`toolbar-dropdown-item ${font === value ? "selected" : ""} ${index === active ? "active" : ""}`}
              onPointerEnter={() => setActive(index)}
              onClick={() => {
                onChange(font);
                leave();
              }}
            >
              {font}
            </button>
          ))}
          {shown.length === 0 && <div className="font-picker-none">{fonts.length ? "No font has that name" : "Reading the fonts…"}</div>}
        </div>,
        document.body
      )}
    </>
  );
}
