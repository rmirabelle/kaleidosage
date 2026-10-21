/** What a long open shows (see LoadingOverlay). */
export interface Loading {
  title: string;
  /** The step it is on ("Scene 3 of 7: Night.ksage"). */
  detail: string;
  /** How far it is, from 0 to 1, or null while that is not known (the bar then moves back and forth). */
  progress: number | null;
}

/**
 * Covers the work area while a playlist or several scenes open, so the
 * scenes do not flash by one after the other as each one opens: a spinner,
 * the title, the step and a progress bar, on the start screen's background.
 */
export function LoadingOverlay({ loading }: { loading: Loading }) {
  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <div className="loading-card">
        <div className="loading-spinner" />
        <div className="loading-title">{loading.title}</div>
        <div className="loading-detail">{loading.detail}</div>
        <div className={`loading-bar ${loading.progress === null ? "unknown" : ""}`}>
          <div style={loading.progress === null ? undefined : { width: `${Math.round(loading.progress * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
