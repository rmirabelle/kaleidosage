import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { X } from "@phosphor-icons/react";
import { hexToHsv, hsvToHex, normalizeHex, type Hsv } from "../lib/color";

const PRESETS = ["#ff7a1a", "#ffd23f", "#39ff14", "#12ab9f", "#4b76f7", "#b46cff", "#ff3d8b", "#ffffff", "#000000"];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * A color swatch that opens a themed color picker: a saturation and
 * brightness square, a hue strip, a hex field and some preset colors.
 * Every change is sent at once, so the picture follows the drag. In the app,
 * the picker also has an eyedropper (see ColorPopup).
 */
export function ColorPicker({ color, onChange, label }: {
  color: string;
  onChange: (color: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const swatchRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={swatchRef}
        className="color-swatch"
        style={{ background: color }}
        aria-label={label}
        aria-expanded={open}
        data-tip={label}
        onClick={() => setOpen((value) => !value)}
      />
      {open && swatchRef.current && (
        <ColorPopup anchor={swatchRef.current} color={color} onChange={onChange} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/**
 * The picker itself. It is drawn on the page body with a fixed position, so
 * the scrolling settings panel does not cut it off. Esc, Enter in the hex
 * field, the close button, the swatch or a window change closes it.
 *
 * Eyedropper: while the picker is open, the pointer is an eyedropper
 * everywhere in the app outside the picker. The picker shows the color
 * under the pointer as it moves, and a click applies that color and closes
 * the picker. Without the app (in a plain browser) there is no screen
 * reader, so a click outside closes.
 */
function ColorPopup({ anchor, color, onChange, onClose }: {
  anchor: HTMLElement;
  color: string;
  onChange: (color: string) => void;
  onClose: () => void;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  /** Hue is kept here, not read back from the hex color, so it survives gray and black. */
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(color) ?? { h: 0, s: 0, v: 0 });
  const [text, setText] = useState(color);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const apply = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setText(hex);
    onChange(hex);
  };
  /** The color last applied. The eyedropper preview goes back to it when the pointer returns to the picker. */
  const appliedRef = useRef(hsv);
  appliedRef.current = hexToHsv(color) ?? appliedRef.current;
  const previewRef = useRef((_preview: Hsv) => {});
  previewRef.current = (preview) => {
    setHsv(preview);
    setText(hsvToHex(preview));
  };
  const pickRef = useRef((_hex: string) => {});
  pickRef.current = (hex) => apply(hexToHsv(hex)!);

  /** Below the swatch, or above it when there is no room below, and always inside the window. */
  useLayoutEffect(() => {
    const swatch = anchor.getBoundingClientRect();
    const popup = popupRef.current!.getBoundingClientRect();
    const left = Math.max(8, Math.min(swatch.left, window.innerWidth - popup.width - 8));
    const below = swatch.bottom + 6;
    const top = below + popup.height > window.innerHeight - 8 ? Math.max(8, swatch.top - popup.height - 6) : below;
    setPosition({ left, top });
  }, [anchor]);

  useEffect(() => {
    const close = () => onCloseRef.current();
    const outside = (target: EventTarget | null) =>
      !popupRef.current?.contains(target as Node) && !anchor.contains(target as Node);
    const eyedropper = isTauri();
    const mouseEvents = ["mousedown", "mouseup", "click", "dblclick"] as const;
    const read = () => invoke<string | null>("screen_color_at_cursor").catch(() => null);
    /**
     * Over the app, the picker shows the color under the pointer. Only the
     * picker shows it, not the picture: a color overlay would tint the
     * picture and change the color that is read.
     */
    let over = false;
    let reading = false;
    const onPointerMove = async (event: PointerEvent) => {
      if (!outside(event.target)) {
        if (over) previewRef.current(appliedRef.current);
        over = false;
        return;
      }
      over = true;
      if (reading) return;
      reading = true;
      const color = await read();
      reading = false;
      if (color && over) previewRef.current(hexToHsv(color)!);
    };
    const onLeaveWindow = () => {
      if (over) previewRef.current(appliedRef.current);
      over = false;
    };
    /** The click that picks a color must not also press what is under it, even after the picker closes. */
    const swallowClick = () => {
      const stop = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.type === "click") done();
      };
      const done = () => {
        for (const type of mouseEvents) window.removeEventListener(type, stop, true);
      };
      for (const type of mouseEvents) window.addEventListener(type, stop, true);
      window.setTimeout(done, 1000);
    };
    /* The color is read at the press, before the click can change anything on screen. Picking closes the picker. */
    const onPointerDown = async (event: PointerEvent) => {
      if (!outside(event.target)) return;
      if (!eyedropper) {
        close();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.button !== 0) return;
      swallowClick();
      const color = await read();
      if (color) pickRef.current(color);
      close();
    };
    /* Capture, so Esc closes the picker and does not also leave full screen. */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close();
    };
    if (eyedropper) {
      document.body.classList.add("eyedropper");
      window.addEventListener("pointermove", onPointerMove, true);
      document.documentElement.addEventListener("mouseleave", onLeaveWindow);
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      document.body.classList.remove("eyedropper");
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      document.documentElement.removeEventListener("mouseleave", onLeaveWindow);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [anchor]);

  /** Follows the mouse over an area while the button is held, with x and y from 0 to 1. */
  const drag = (update: (x: number, y: number) => void) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const area = event.currentTarget;
    area.setPointerCapture(event.pointerId);
    const move = (moveEvent: { clientX: number; clientY: number }) => {
      const rect = area.getBoundingClientRect();
      update(clamp01((moveEvent.clientX - rect.left) / rect.width), clamp01((moveEvent.clientY - rect.top) / rect.height));
    };
    move(event);
    const end = () => {
      area.removeEventListener("pointermove", move);
      area.removeEventListener("pointerup", end);
      area.removeEventListener("pointercancel", end);
    };
    area.addEventListener("pointermove", move);
    area.addEventListener("pointerup", end);
    area.addEventListener("pointercancel", end);
  };

  const hex = hsvToHex(hsv);
  return createPortal(
    <div
      ref={popupRef}
      className="color-popup"
      role="dialog"
      aria-label="Color"
      style={position ? { left: position.left, top: position.top } : { visibility: "hidden" }}
    >
      <div
        className="color-sv"
        style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
        onPointerDown={drag((x, y) => apply({ h: hsv.h, s: x, v: 1 - y }))}
      >
        <div className="color-sv-thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} />
      </div>
      <div className="color-hue" onPointerDown={drag((x) => apply({ h: x * 360, s: hsv.s, v: hsv.v }))}>
        <div className="color-hue-thumb" style={{ left: `calc(7px + ${hsv.h / 360} * (100% - 14px))`, background: `hsl(${hsv.h} 100% 50%)` }} />
      </div>
      <div className="color-hex-row">
        <div className="color-hex-preview" style={{ background: hex }} />
        <input
          className="color-hex"
          type="text"
          spellCheck={false}
          aria-label="Hex color"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            const typed = normalizeHex(event.target.value);
            if (!typed) return;
            setHsv(hexToHsv(typed)!);
            onChange(typed);
          }}
          onBlur={() => setText(hex)}
          onKeyDown={(event) => { if (event.key === "Enter") onClose(); }}
        />
        <button className="color-close" onClick={onClose} aria-label="Close" data-tip="Close (Esc)">
          <X size={13} weight="bold" />
        </button>
      </div>
      <div className="color-presets">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            className={`color-preset ${preset === hex ? "selected" : ""}`}
            style={{ background: preset }}
            aria-label={preset}
            data-tip={preset}
            onClick={() => apply(hexToHsv(preset)!)}
          />
        ))}
      </div>
      {isTauri() && <p className="color-hint">Point at the app to see a color. Click to pick it.</p>}
    </div>,
    document.body
  );
}
