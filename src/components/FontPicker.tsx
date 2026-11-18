import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { CaretDown, MagnifyingGlass } from "@phosphor-icons/react";

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
 * The Text effect's Font menu: a button with the picked family's name, and a
 * list of the installed families with a search box at its top. Typing in the
 * box keeps the names that hold the typed letters, in any place. Keys: Up and
 * Down move, Enter picks, Esc closes. A click outside closes it.
 */
export function FontPicker({ value, onChange }: { value: string; onChange: (font: string) => void }) {
  const [fonts, setFonts] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void installedFonts().then((names) => live && setFonts(names));
    return () => {
      live = false;
    };
  }, []);

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase();
    return words ? fonts.filter((font) => font.toLowerCase().includes(words)) : fonts;
  }, [fonts, search]);

  const show = () => {
    setSearch("");
    setActive(Math.max(0, fonts.indexOf(value)));
    setOpen(true);
  };
  const pick = (font: string | undefined) => {
    if (font) onChange(font);
    setOpen(false);
    buttonRef.current?.focus();
  };

  /** Below the button, or above it when there is more room there; the list scrolls in the room it has. */
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const button = buttonRef.current!.getBoundingClientRect();
    const below = window.innerHeight - button.bottom - 12;
    const above = button.top - 12;
    const height = Math.min(420, Math.max(below, above));
    const top = below >= Math.min(420, above) ? button.bottom + 4 : button.top - 4 - height;
    const width = Math.max(button.width, 240);
    setPosition({ left: Math.max(8, Math.min(button.left, window.innerWidth - 8 - width)), top, width, height });
    searchRef.current?.focus();
  }, [open]);

  /* The highlighted name stays in view. */
  useEffect(() => {
    listRef.current?.querySelector(".toolbar-dropdown-item.active")?.scrollIntoView({ block: "nearest" });
  }, [active, open, shown]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!listRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        className={`panel-select dropdown-button font-picker-button ${open ? "open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Font"
        data-tip="The font. Click and type to find one."
        onClick={() => (open ? setOpen(false) : show())}
      >
        <span>{value}</span>
        <CaretDown size={11} weight="bold" className="dropdown-caret" />
      </button>
      {open && createPortal(
        <div
          ref={listRef}
          className="toolbar-dropdown dropdown-list font-picker-list"
          style={position ? { left: position.left, top: position.top, width: position.width, maxHeight: position.height } : { visibility: "hidden" }}
        >
          <label className="font-picker-search">
            <MagnifyingGlass size={13} weight="bold" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              placeholder="Find a font"
              aria-label="Find a font"
              spellCheck={false}
              onChange={(event) => {
                setSearch(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                const keys: Record<string, () => void> = {
                  Escape: () => pick(undefined),
                  ArrowDown: () => setActive((index) => Math.min(shown.length - 1, index + 1)),
                  ArrowUp: () => setActive((index) => Math.max(0, index - 1)),
                  PageDown: () => setActive((index) => Math.min(shown.length - 1, index + 10)),
                  PageUp: () => setActive((index) => Math.max(0, index - 10)),
                  Enter: () => pick(shown[active])
                };
                const action = keys[event.key];
                /* Stop every key here: the app's shortcuts (Esc leaves full screen) must not also run. */
                event.stopPropagation();
                if (!action) return;
                event.preventDefault();
                action();
              }}
            />
          </label>
          <div className="font-picker-names" role="listbox" aria-label="Fonts">
            {shown.map((font, index) => (
              <button
                key={font}
                role="option"
                aria-selected={font === value}
                className={`toolbar-dropdown-item ${font === value ? "selected" : ""} ${index === active ? "active" : ""}`}
                onPointerEnter={() => setActive(index)}
                onClick={() => pick(font)}
              >
                {font}
              </button>
            ))}
            {shown.length === 0 && <div className="font-picker-none">{fonts.length ? "No font has that name" : "Reading the fonts…"}</div>}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
