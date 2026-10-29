import { invoke } from "@tauri-apps/api/core";
import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { revealMainWindow } from "./lib/splash";
import "./index.css";

/**
 * Block the WebView's default context menu everywhere except text fields and
 * selectable text (error messages), which keep it for cut, copy, and paste.
 */
document.addEventListener("contextmenu", (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.closest("input[type='text'], textarea, [contenteditable='true'], .selectable")) return;
  event.preventDefault();
});

/**
 * While Ctrl is held, the body has the class "ctrl-held": over a group
 * header or a setting name, the mouse shows a no-entry cursor, because a
 * Ctrl + click there bypasses instead of acting.
 */
const watchCtrl = (event: KeyboardEvent) => document.body.classList.toggle("ctrl-held", event.ctrlKey);
window.addEventListener("keydown", watchCtrl, true);
window.addEventListener("keyup", watchCtrl, true);
window.addEventListener("blur", () => document.body.classList.remove("ctrl-held"));

/** Sends an error to the app's error output (the dev log); outside the app it does nothing. */
const logError = (message: string) => {
  invoke("log_frontend_error", { message }).catch(() => { /* Not running in the app. */ });
};
window.addEventListener("error", (event) => logError(`${event.message}\n${event.error?.stack ?? ""}`));
window.addEventListener("unhandledrejection", (event) => logError(`Unhandled rejection: ${event.reason?.stack ?? String(event.reason)}`));

/** True after the crash screen took over; a later good hot update then reloads the window. */
let crashed = false;

/**
 * Dev only: the window reports each hot update it applied, each failed one,
 * and its console errors and warnings to the dev log (as "[client] ..."), so
 * an edit can be confirmed as live.
 */
if (import.meta.hot) {
  const hot = import.meta.hot;
  const report = (message: string) => hot.send("kaleidosage:log", { message });
  hot.on("vite:afterUpdate", (payload) => {
    report(`hot update applied: ${payload.updates.map((update) => update.path).join(", ")}`);
    if (crashed) {
      report("reloading after the crash screen");
      window.location.reload();
    }
  });
  hot.on("vite:error", (payload) => report(`hot update error: ${payload.err.message}`));
  hot.on("vite:ws:disconnect", () => report("hot update connection lost"));
  for (const level of ["error", "warn"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      report(`console.${level}: ${args.map((arg) => arg instanceof Error ? arg.stack ?? arg.message : String(arg)).join(" ")}`);
    };
  }
  report("window loaded");

  /**
   * Start-up timing: when the main window shows, and each task that blocks
   * the page for 200 ms or more in the first minute, in ms from page start.
   */
  const startup = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === "mark" && entry.name === "main window shown") report(`startup: main window shown at ${Math.round(entry.startTime)} ms`);
      if (entry.entryType === "longtask" && entry.duration >= 200) report(`startup: page blocked ${Math.round(entry.duration)} ms at ${Math.round(entry.startTime)} ms`);
    }
  });
  startup.observe({ entryTypes: ["mark", "longtask"] });
  setTimeout(() => startup.disconnect(), 60000);
}

/** A crash shows its error and a Reload button instead of a blank window, and goes to the dev log. */
class CrashScreen extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    crashed = true;
    void revealMainWindow();
    logError(`${error.stack ?? error.message}\nComponent stack:${info.componentStack ?? ""}`);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash-screen" role="alert">
        <h1>Kaleido Sage stopped with an error</h1>
        <pre className="selectable">{this.state.error.stack ?? this.state.error.message}</pre>
        <button className="button primary" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}

createRoot(document.getElementById("root")!).render(<CrashScreen><App /></CrashScreen>);
