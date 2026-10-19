import { useEffect, useState } from "react";

const EMPTY = "Point at a control to see what it does.";

/** The tip of the element at a point: its own data-tip, or the data-tip of the nearest element around it. */
function tipAt(x: number, y: number) {
  return document.elementFromPoint(x, y)?.closest("[data-tip]")?.getAttribute("data-tip") ?? null;
}

/**
 * The help line: one line at the bottom of the window that tells what the
 * control under the mouse does. Controls give their tip as data-tip (not
 * title, so no tooltip covers the picture). The line reads it on each mouse
 * move, so a tip that changes while the mouse stays (Learn, Learning) shows
 * at once; a disabled button, which gets no events of its own, is found by
 * its place under the mouse. A control that gets the focus from the
 * keyboard shows its tip too.
 */
export function HelpLine() {
  const [tip, setTip] = useState<string | null>(null);

  useEffect(() => {
    const onMove = (event: PointerEvent) => setTip(tipAt(event.clientX, event.clientY));
    const onOut = (event: PointerEvent) => { if (!event.relatedTarget) setTip(null); };
    const onFocus = (event: FocusEvent) => {
      const own = (event.target as Element | null)?.closest?.("[data-tip]")?.getAttribute("data-tip");
      if (own) setTip(own);
    };
    const clear = () => setTip(null);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerover", onMove, true);
    window.addEventListener("pointerout", onOut, true);
    window.addEventListener("focusin", onFocus, true);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerover", onMove, true);
      window.removeEventListener("pointerout", onOut, true);
      window.removeEventListener("focusin", onFocus, true);
      window.removeEventListener("blur", clear);
    };
  }, []);

  return (
    <div className="help-line-frame">
      <div className={`help-line ${tip ? "" : "empty"}`} role="status" aria-live="polite">{tip ?? EMPTY}</div>
    </div>
  );
}
