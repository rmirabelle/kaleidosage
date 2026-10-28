import { VirtualReality } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { Engine } from "../engine/engine";
import { DEFAULT_VR_SCREEN, VR_SCREEN_LIMITS, type VrScreen } from "../engine/vr";
import { Slider } from "./Slider";

/** The screen settings used last, so VR opens with them. */
const STORE_KEY = "kaleidosage.vr-screen";

const readStored = (): VrScreen => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
    const stored = parsed && typeof parsed === "object" ? parsed as Partial<VrScreen> : {};
    const clamp = (key: keyof VrScreen) => {
      const value = stored[key];
      const { min, max } = VR_SCREEN_LIMITS[key];
      return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : DEFAULT_VR_SCREEN[key];
    };
    return { width: clamp("width"), distance: clamp("distance"), curve: clamp("curve") };
  } catch {
    return { ...DEFAULT_VR_SCREEN };
  }
};

const ROWS: { key: keyof VrScreen; label: string; show: (value: number) => string }[] = [
  { key: "width", label: "Width", show: (value) => `${value.toFixed(1)} m` },
  { key: "distance", label: "Distance", show: (value) => `${value.toFixed(1)} m` },
  { key: "curve", label: "Curve", show: (value) => `${Math.round(value * 100)}%` }
];

/**
 * While VR runs: the virtual screen's Width, Distance and Curve (see
 * VrScreen in vr.ts). Each change shows in the headset at once.
 */
export function VrScreenCard({ engine }: { engine: Engine }) {
  const [screen, setScreen] = useState(readStored);
  useEffect(() => {
    engine.vrScreen = screen;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(screen)); } catch { /* Remembering is a convenience only. */ }
  }, [engine, screen]);
  return (
    <section className="vr-card" aria-label="VR screen">
      <header className="vr-card-header">
        <VirtualReality size={15} />
        <span>VR screen</span>
        <button className="vr-card-reset" onClick={() => setScreen({ ...DEFAULT_VR_SCREEN })} data-tip="Width 4 m, distance 3 m, flat">Reset</button>
      </header>
      {ROWS.map(({ key, label, show }) => (
        <div key={key} className="vr-card-row">
          <span className="vr-card-label">{label}<span>{show(screen[key])}</span></span>
          <Slider {...VR_SCREEN_LIMITS[key]} label={label} value={screen[key]} onChange={(value) => setScreen((current) => ({ ...current, [key]: value }))} />
        </div>
      ))}
      <p className="vr-card-note">To bring the screen in front of you again, hold the headset's Meta button.</p>
    </section>
  );
}
