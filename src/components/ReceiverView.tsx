import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { ReceiverPlayer, type ReceiverStatus } from "../lib/receiver";

/**
 * The receiver window (see src-tauri/src/receiver.rs): the picture that a
 * Kaleido Sage on another PC sends, over the whole screen. While no
 * picture comes, it shows that this PC is ready, and its name. Esc, or a
 * click, opens the options: close the receiver, or use this PC as before.
 */
export function ReceiverView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<ReceiverStatus>({ state: "waiting" });
  const [name, setName] = useState("");
  const [options, setOptions] = useState(false);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOptions((open) => !open); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const run = (command: string, args?: Record<string, unknown>) => {
    invoke(command, args).catch((error) => setFailure(String(error instanceof Error ? error.message : error)));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const player = new ReceiverPlayer(canvas);
    const off = player.subscribe(() => {
      setStatus(player.status);
      setName(player.name);
    });
    void player.start();
    return () => {
      off();
      player.dispose();
    };
  }, []);

  return (
    <div className={`receiver ${options ? "with-options" : ""}`} onClick={() => { if (!options) setOptions(true); }}>
      <canvas ref={canvasRef} />
      {status.state !== "playing" && (
        <div className="receiver-idle">
          <h1>Kaleido Sage Receiver</h1>
          {status.state === "error"
            ? <p className="receiver-error selectable">{status.message}</p>
            : <p>{name ? `${name} is ready for a cast.` : "Starting…"}</p>}
          {!options && <p className="receiver-hint">Press Esc for options.</p>}
        </div>
      )}
      {options && (
        <div className="receiver-options" role="dialog" aria-label="Receiver options" onClick={(event) => event.stopPropagation()}>
          <h1>Kaleido Sage Receiver</h1>
          <p>{name ? `This PC is the receiver ${name}.` : "This PC is a receiver."} Kaleido Sage on another PC finds it in its Cast menu.</p>
          <div className="receiver-buttons">
            <button className="button primary" autoFocus onClick={() => setOptions(false)}>Back to the Receiver</button>
            <button className="button" onClick={() => run("receiver_exit")}>Close the Receiver</button>
            <button className="button" onClick={() => run("receiver_mode_set", { on: false })}>Use This PC as Before</button>
          </div>
          <p className="receiver-hint">Close the Receiver: it starts again with Windows. Use This PC as Before: Kaleido Sage opens as the normal app, and the receiver does not start with Windows.</p>
          {failure && <p className="receiver-error selectable">{failure}</p>}
        </div>
      )}
    </div>
  );
}
