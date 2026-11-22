import { useEffect, useRef, useState } from "react";
import { ReceiverPlayer, type ReceiverStatus } from "../lib/receiver";

/**
 * The receiver window (see src-tauri/src/receiver.rs): the picture that a
 * Kaleido Sage on another PC sends, over the whole screen. While no
 * picture comes, it shows that this PC is ready, and its name.
 */
export function ReceiverView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<ReceiverStatus>({ state: "waiting" });
  const [name, setName] = useState("");

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
    <div className="receiver">
      <canvas ref={canvasRef} />
      {status.state !== "playing" && (
        <div className="receiver-idle">
          <h1>Kaleido Sage Receiver</h1>
          {status.state === "error"
            ? <p className="receiver-error selectable">{status.message}</p>
            : <p>{name ? `${name} is ready for a cast.` : "Starting…"}</p>}
        </div>
      )}
    </div>
  );
}
