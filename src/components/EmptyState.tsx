import type { ReactNode } from "react";

/**
 * An empty place that teaches (see docs/HELP.md, part 2): one sentence that
 * says how to fill it, and, under it, the button that does it. An empty
 * list never shows only "No items".
 */
export function EmptyState({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <p>{text}</p>
      {children && <div className="empty-state-action">{children}</div>}
    </div>
  );
}
