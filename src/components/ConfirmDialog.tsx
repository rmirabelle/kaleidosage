import { useEffect, useRef, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";

/**
 * A question with Cancel and a confirm button, in the About dialog's style,
 * and an optional third choice between them. Enter confirms; Esc, Cancel or
 * a click outside the dialog cancels. While it is open, keys do not reach
 * the app's shortcuts. "details" shows under the message, for example a list.
 * With "closeButton", an X in the corner takes the place of Cancel.
 * "confirmIcon" shows before the confirm button's label.
 */
export function ConfirmDialog({ title, message, details, confirmLabel, confirmIcon, onConfirm, onCancel, otherLabel, onOther, closeButton }: {
  title: string;
  message: ReactNode;
  details?: ReactNode;
  confirmLabel: string;
  confirmIcon?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  otherLabel?: string;
  onOther?: () => void;
  closeButton?: boolean;
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
        {closeButton && <button className="about-dialog-close" onClick={onCancel} aria-label="Close" data-tip="Close `Esc`"><X size={18} /></button>}
        <div className="confirm-dialog-content">
          <h2 id="confirm-title">{title}</h2>
          <p id="confirm-message">{message}</p>
          {details}
        </div>
        <div className="about-dialog-actions confirm-dialog-actions">
          {!closeButton && <button className="button secondary" onClick={onCancel}>Cancel</button>}
          {otherLabel && onOther && <button className="button secondary" onClick={onOther}>{otherLabel}</button>}
          <button ref={confirmRef} className="button primary" onClick={onConfirm}>{confirmIcon}{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
