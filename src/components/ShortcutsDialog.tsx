import { useEffect } from "react";
import { Keyboard, X } from "@phosphor-icons/react";
import { SHORTCUT_GROUPS } from "../help/shortcuts";

/** A key ("Ctrl+S", "F11", "Space") shows as a key cap; a mouse gesture ("Double-click a name") as plain text. */
const isKey = (keys: string) => /^(Ctrl|Shift|Alt)\+|^(Space|Esc)$|^[^a-z ]+$/.test(keys);

/**
 * The keyboard shortcuts sheet (see docs/HELP.md, part 5): every key and
 * mouse gesture, in groups (src/help/shortcuts.ts). Help, Keyboard
 * Shortcuts, or the "?" key, opens it; Esc, Close, or a click outside it
 * closes it.
 */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    /* Capture, so Esc closes the sheet and does not also leave full screen. */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && event.key !== "?") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);
  return (
    <div className="about-dialog-overlay" role="presentation" onPointerDown={onClose}>
      <div className="about-dialog shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" onPointerDown={(event) => event.stopPropagation()}>
        <button className="about-dialog-close" onClick={onClose} aria-label="Close the keyboard shortcuts" data-tip="Close `Esc`">
          <X size={18} />
        </button>
        <h2 id="shortcuts-title" className="shortcuts-title"><Keyboard size={20} /> Keyboard shortcuts</h2>
        <div className="shortcuts-groups">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="shortcuts-group">
              <h3>{group.title}</h3>
              <dl>
                {group.shortcuts.map((shortcut) => (
                  <div key={`${shortcut.keys.join("|")}|${shortcut.does}`} className="shortcuts-row">
                    <dt>
                      {shortcut.keys.map((keys, index) => (
                        <span key={keys}>
                          {index > 0 && <span className="shortcuts-or">or</span>}
                          {isKey(keys) ? <kbd>{keys}</kbd> : <span className="shortcuts-gesture">{keys}</span>}
                        </span>
                      ))}
                    </dt>
                    <dd>{shortcut.does}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
