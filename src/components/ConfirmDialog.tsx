import { useEffect, useRef } from "react";

/**
 * A question with Cancel and a confirm button, in the About dialog's style,
 * and an optional third choice between them. Enter confirms; Esc, Cancel or
 * a click outside the dialog cancels. While it is open, keys do not reach
 * the app's shortcuts.
 */
export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, otherLabel, onOther }: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  otherLabel?: string;
  onOther?: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const handlers = useRef({ onConfirm, onCancel });
  handlers.current = { onConfirm, onCancel };

  useEffect(() => {
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Escape") handlers.current.onCancel();
      else if (event.key === "Enter") {
        /* Enter presses another button when it has the keyboard focus (for example "Don't save"). */
        const focused = document.activeElement;
        if (focused instanceof HTMLButtonElement && focused !== confirmRef.current) return;
        event.preventDefault();
        handlers.current.onConfirm();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return (
    <div className="about-dialog-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className="about-dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <div className="confirm-dialog-content">
          <h2 id="confirm-title">{title}</h2>
          <p id="confirm-message">{message}</p>
        </div>
        <div className="about-dialog-actions confirm-dialog-actions">
          <button className="button secondary" onClick={onCancel}>Cancel</button>
          {otherLabel && onOther && <button className="button secondary" onClick={onOther}>{otherLabel}</button>}
          <button ref={confirmRef} className="button primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
