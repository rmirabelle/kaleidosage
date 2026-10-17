import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** One choice in a right-click menu. "selected" marks the choice in use, for a menu that picks one of several. */
export interface MenuItem {
  label: string;
  icon: ReactNode;
  run: () => void;
  disabled?: boolean;
  selected?: boolean;
}

/**
 * A right-click menu at the mouse, in the toolbar dropdown look, kept inside
 * the window. A click on a choice runs it and closes the menu; a click
 * outside, Esc, or the window losing focus closes it.
 */
export function ContextMenu({ position, items, onClose }: { position: { left: number; top: number }; items: MenuItem[]; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState(position);
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    setPlace({
      left: Math.max(8, Math.min(position.left, window.innerWidth - 8 - menu.offsetWidth)),
      top: Math.max(8, Math.min(position.top, window.innerHeight - 8 - menu.offsetHeight))
    });
  }, [position]);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) onClose(); };
    /* Capture, so Esc closes the menu and does not also leave full screen. */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);
  return (
    <div ref={menuRef} className="toolbar-dropdown context-menu" role="menu" style={place}>
      {items.map((item) => (
        <button
          key={item.label}
          role={item.selected === undefined ? "menuitem" : "menuitemradio"}
          className={`toolbar-dropdown-item ${item.selected ? "selected" : ""}`}
          aria-checked={item.selected}
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.run();
          }}
        >
          <span className="context-menu-icon">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
}
