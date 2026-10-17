import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CaretDown, Trash, X } from "@phosphor-icons/react";
import type { Engine } from "../engine/engine";
import { createParams, type ParamKey } from "../engine/params";
import { midi, type MidiMapping } from "../lib/midi";
import { ConfirmDialog } from "./ConfirmDialog";
import { DestinationDialog, destinationName } from "./DestinationDialog";
import { MidiIcon } from "./MidiIcon";
import { useMidi } from "./useMidi";

const LABELS = createParams();

/**
 * A control's name. The Launchkey's eight knobs send controls 21 to 28 on
 * channel 1 in their first custom mode, so those get knob numbers; any
 * other control shows its control number (and its channel, when not 1).
 */
function controlName(device: string, control: string) {
  const [channel, number] = control.split(":").map(Number);
  if (/launchkey/i.test(device) && channel === 1 && number >= 21 && number <= 28) return `Knob ${number - 20}`;
  return `CC ${number}${channel === 1 ? "" : `, channel ${channel}`}`;
}

/** "Launchkey MK4 61 MIDI" shows as "Launchkey MK4 61"; the second (DAW) port of a controller says so. */
function deviceName(device: string) {
  const daw = /^MIDIIN\d+ \((.*)\)$/.exec(device);
  return (daw ? `${daw[1]} (DAW port)` : device).replace(/\s*MIDI(?= \(DAW port\)|$)/i, "");
}

/** A row's MIDI icon: gray, and orange for a moment each time its control sends a step. */
function ActivityIcon({ id }: { id: string }) {
  const [lit, setLit] = useState(false);
  useEffect(() => {
    let timer = 0;
    const stop = midi.onActivity((control) => {
      if (control !== id) return;
      setLit(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setLit(false), 400);
    });
    return () => {
      stop();
      window.clearTimeout(timer);
    };
  }, [id]);
  return <span className={`midi-map-activity ${lit ? "lit" : ""}`}><MidiIcon size={13} /></span>;
}

/**
 * The MIDI panel, at the bottom of the window. The left column lists the
 * controllers: the connected ones, and any others that have mappings. The
 * right column lists every MIDI mapping, one row per control and setting it
 * moves; a control that moves several settings (a macro) has a row for
 * each. Each row's MIDI icon lights orange while its control sends. A
 * click on a row's setting opens the destination dialog (see
 * DestinationDialog), to point the row at another setting; the X at its
 * end removes the row. Clear all removes every
 * mapping. A new mapping starts at a setting's own MIDI icon.
 */
export function MidiPanel({ engine, open, onClose }: { engine: Engine; open: boolean; onClose: () => void }) {
  const { available, devices, armed } = useMidi();
  const mappings = midi.allMappings();
  /** The controllers, connected or with mappings: the ones with mappings first, then the connected ones, each with its mapping count. */
  const controllers = [...new Set([...devices, ...mappings.map(({ device }) => device)])].map((device) => ({
    device,
    connected: devices.includes(device),
    count: mappings.filter((mapping) => mapping.device === device).length
  })).sort((a, b) => Number(b.count > 0) - Number(a.count > 0));
  const [clearAsked, setClearAsked] = useState(false);
  /**
   * The mapping whose setting the destination dialog picks, while it is
   * open; a null setting is a new mapping (see the capture below).
   */
  const [picking, setPicking] = useState<(Omit<MidiMapping, "key"> & { key: ParamKey | null }) | null>(null);
  const pickingRef = useRef(picking);
  pickingRef.current = picking;
  /**
   * Learn mode (the Learn button, or Esc to stop): a control with no
   * mapping that the user moves gets a new row at the top of the list, and
   * the destination dialog opens with no setting picked. A control that has
   * mappings works as always, and its rows light up. Learn mode stays on
   * for the next control, and ends when the panel closes.
   *
   * While a destination dialog is open, another control the user moves
   * changes it: a control with no mapping becomes the dialog's control (the
   * title follows, and the pick maps that control), and a control that has
   * mappings closes the dialog.
   */
  const [learning, setLearning] = useState(false);
  useEffect(() => { if (!open) setLearning(false); }, [open]);
  const capturing = learning || picking !== null;
  useEffect(() => {
    if (!capturing) return;
    return midi.capture((device, control) => {
      const open = pickingRef.current;
      if (open?.device === device && open.control === control) return;
      setPicking({ device, control, key: null });
    });
  }, [capturing]);
  useEffect(() => {
    if (!picking) return;
    return midi.onActivity((id) => {
      const split = id.lastIndexOf("|");
      const [device, control] = [id.slice(0, split), id.slice(split + 1)];
      const open = pickingRef.current;
      if (open && !(open.device === device && open.control === control) && midi.sliders(device, control).length) setPicking(null);
    });
  }, [picking !== null]);
  /* While a setting waits for a control, Esc stops waiting, also when the setting's row is out of sight. Capture, so Esc does not also leave full screen. */
  useEffect(() => {
    if (armed.length === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      midi.setLearning(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [armed.length]);
  /* Esc stops Learn mode, unless a destination dialog is open: Esc closes that first. */
  useEffect(() => {
    if (!learning) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || pickingRef.current) return;
      event.stopPropagation();
      setLearning(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [learning]);
  return (
    <section className="midi-panel-body" aria-label="MIDI mappings">
      <header className="midi-panel-header">
        <h2 className="side-panel-title">MIDI</h2>
        <button
          className={`panel-button text-only midi-learn-toggle ${learning ? "on" : ""}`}
          aria-pressed={learning}
          title={learning ? "Learn is on: move a knob or fader that has no mapping to map it. Click or Esc to stop." : "Learn: move a knob or fader that has no mapping, then pick its setting"}
          onClick={() => setLearning(!learning)}
        >
          <MidiIcon size={12} /> {learning ? "Learning" : "Learn"}
        </button>
        <span className="midi-panel-count">{mappings.length === 1 ? "1 mapping" : `${mappings.length} mappings`}</span>
        <button className="panel-button text-only" disabled={mappings.length === 0} onClick={() => setClearAsked(true)} title="Remove every MIDI mapping">
          <Trash size={13} /> Clear all
        </button>
        {armed.length > 0 && (
          <span className="midi-panel-waiting">Move a knob or fader for {armed.map((key) => LABELS[key].label).join(", ")}. Esc stops.</span>
        )}
        <button className="side-panel-action" onClick={onClose} title="Close the MIDI panel (M)" aria-label="Close the MIDI panel">
          <X size={13} weight="bold" />
        </button>
      </header>
      <div className="midi-panel-columns">
        <div className="midi-panel-devices">
          <div className="stage-label">Connected devices</div>
          {!available ? (
            <p className="midi-panel-empty">MIDI is not available.</p>
          ) : controllers.length === 0 ? (
            <p className="midi-panel-empty">No MIDI controller is connected.</p>
          ) : (
            <ul className="midi-device-list">
              {controllers.map(({ device, connected, count }) => (
                <li key={device} className={`midi-device-row ${count === 0 ? "unused" : ""}`} title={count === 0 ? `${device}: no mappings` : device}>
                  <span className={`midi-device-state ${connected ? "connected" : ""}`} title={connected ? "Connected" : "Not connected"} />
                  <span className="midi-device-name">{deviceName(device)}</span>
                  {count > 0 && <span className="midi-device-count">{count === 1 ? "1 mapping" : `${count} mappings`}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="midi-panel-mappings">
          {mappings.length === 0 && !picking ? (
            <p className="midi-panel-empty">No MIDI mappings yet. Click Learn and move a knob or fader, or click the MIDI icon after a setting's value.</p>
          ) : (
            <ul className="midi-map-list">
              {/* A control the user just moved over the panel, waiting for its setting. */}
              {picking && picking.key === null && (
                <li className="midi-map-row pending">
                  <ActivityIcon id={`${picking.device}|${picking.control}`} />
                  <span className="midi-map-control">{deviceName(picking.device)} {controlName(picking.device, picking.control)}</span>
                  <ArrowRight size={13} className="midi-map-arrow" aria-hidden="true" />
                  <span className="midi-map-choose">Pick a setting</span>
                  <button className="midi-map-clear" title="Do not map this control" aria-label="Do not map this control" onClick={() => setPicking(null)}>
                    <X size={12} weight="bold" />
                  </button>
                </li>
              )}
              {/* The rows come sorted by controller; each controller's rows sit under its name. */}
              {mappings.map(({ device, control, key }, index) => {
                const kind = midi.controlKind(device, control);
                return (
                  <Fragment key={`${device}|${control}|${key}`}>
                    {device !== mappings[index - 1]?.device && <li className="midi-map-heading" title={device}>Device: <strong>{deviceName(device)}</strong></li>}
                    <li className="midi-map-row">
                      <ActivityIcon id={`${device}|${control}`} />
                      <span className="midi-map-control">
                        {controlName(device, control)}
                        {kind.relative && <em title="This knob sends relative steps, so it turns with no end">relative</em>}
                        {kind.fine && <em title="This control sends 14-bit values, with 16384 places">14-bit</em>}
                      </span>
                      {/* One way only: the control moves the setting; the app sends nothing back to the controller. */}
                      <ArrowRight size={13} className="midi-map-arrow" aria-hidden="true" />
                      <button
                        className="panel-select dropdown-button"
                        title="Pick another setting for this control"
                        aria-label={`Setting that ${controlName(device, control)} moves: ${destinationName(key)}`}
                        onClick={() => setPicking({ device, control, key })}
                      >
                        <span>{destinationName(key)}</span>
                        <CaretDown size={11} weight="bold" className="dropdown-caret" />
                      </button>
                      <button
                        className="midi-map-clear"
                        title="Remove this mapping"
                        aria-label={`Remove the mapping from ${controlName(device, control)} to ${LABELS[key].label}`}
                        onClick={() => midi.unmapOne(device, control, key)}
                      >
                        <X size={12} weight="bold" />
                      </button>
                    </li>
                  </Fragment>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      {picking && createPortal(
        <DestinationDialog
          current={picking.key}
          mapped={midi.sliders(picking.device, picking.control)}
          groupsOn={engine.state.groups}
          onRemove={(key) => {
            midi.unmapOne(picking.device, picking.control, key);
            /* The row this dialog belongs to is gone once its own mapping is removed. */
            if (key === picking.key) setPicking(null);
          }}
          control={`${deviceName(picking.device)} ${controlName(picking.device, picking.control)}`}
          onCancel={() => setPicking(null)}
          onPick={(to) => {
            if (picking.key === null) midi.addMapping(picking.device, picking.control, to);
            else midi.remap(picking.device, picking.control, picking.key, to);
            setPicking(null);
          }}
        />,
        document.body
      )}
      {clearAsked && createPortal(
        <ConfirmDialog
          title="Remove every MIDI mapping?"
          message={`All ${mappings.length} mappings go away. Every knob and fader then moves nothing until you map it again.`}
          confirmLabel="Clear all"
          onCancel={() => setClearAsked(false)}
          onConfirm={() => {
            midi.clearEverything();
            setClearAsked(false);
          }}
        />,
        document.body
      )}
    </section>
  );
}
