import { useEffect, useState } from "react";
import { Trash, X } from "@phosphor-icons/react";
import { GROUP_PARAMS, createParams, type GroupKey, type ParamKey } from "../engine/params";
import { EFFECT_NAMES, submodeNote } from "../engine/submodes";
import { NOT_MAPPABLE } from "../lib/midi";
import { MidiIcon } from "./MidiIcon";
import { PowerIcon } from "./PowerIcon";

/** The groups of settings, in the order the panels show them: the Source panel, then the effects. */
export const DESTINATION_GROUPS: readonly (readonly [GroupKey, string])[] = [["source", "Source"], ...EFFECT_NAMES];
const LABELS = createParams();

/** The settings of a group that a MIDI control can move. */
const destinationsOf = (group: GroupKey) => GROUP_PARAMS[group].filter((key) => !NOT_MAPPABLE.includes(key));

/** The group a setting belongs to. */
export const groupOf = (key: ParamKey) => DESTINATION_GROUPS.find(([group]) => GROUP_PARAMS[group].includes(key))?.[0] ?? "source";

/** A destination's name: its group, where it shows (when not in every submode, see submodeNote), and its label. */
export function destinationName(key: ParamKey) {
  const title = DESTINATION_GROUPS.find(([group]) => group === groupOf(key))?.[1] ?? "";
  const note = submodeNote(key);
  return `${title}${note ? ` (${note})` : ""}: ${LABELS[key].label}`;
}

/**
 * Picks the setting a MIDI control moves. The groups are a list at the
 * left; a click on a group lists its settings at the right; a click on a
 * setting picks it and closes the dialog. It opens on the group of the
 * current setting, which is marked; for a new mapping there is no current
 * setting, and it opens on the group of a setting the control already
 * moves, or on the first effect that is on. Every setting the control moves (it
 * can move several, a macro) is orange and has a trash button that
 * removes that mapping. Each effect group shows its power icon, lit when
 * the effect is on. Esc, the close button or a click outside the dialog
 * closes it with no change.
 */
export function DestinationDialog({ current, mapped, control, groupsOn, onPick, onRemove, onCancel }: {
  /** The setting the row moves now, or null for a new mapping. */
  current: ParamKey | null;
  /** Every setting the control moves. */
  mapped: readonly ParamKey[];
  /** Removes the mapping from the control to one setting. */
  onRemove: (key: ParamKey) => void;
  /** Which effect groups are on (the Source group has no power button). */
  groupsOn: Readonly<Record<GroupKey, boolean>>;
  /** The control's name, for the title. */
  control: string;
  onPick: (key: ParamKey) => void;
  onCancel: () => void;
}) {
  const [group, setGroup] = useState<GroupKey>(() => {
    const known = current ?? mapped[0];
    if (known) return groupOf(known);
    return DESTINATION_GROUPS.find(([key]) => key !== "source" && groupsOn[key])?.[0] ?? "source";
  });

  /* Capture, so Esc closes the dialog and does not also leave full screen; other keys do not reach the app's shortcuts. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onCancel]);

  return (
    <div className="about-dialog-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className="about-dialog destination-dialog" role="dialog" aria-modal="true" aria-labelledby="destination-title">
        <header className="video-dialog-header">
          <div className="open-dialog-title-icon destination-title-icon"><MidiIcon size={24} /></div>
          <div>
            <h2 id="destination-title">Map MIDI: <span className="destination-title-control">{control}</span></h2>
            <p>Pick a group, then the setting the control moves.</p>
          </div>
          <button className="about-dialog-close" onClick={onCancel} aria-label="Close" data-tip="Close"><X size={18} /></button>
        </header>
        <div className="destination-columns">
          <div className="destination-column destination-groups">
            <div className="destination-heading">Effects</div>
            <ul role="listbox" aria-label="Effects">
              {DESTINATION_GROUPS.map(([key, title]) => (
                <li key={key}>
                  <button
                    role="option"
                    aria-selected={key === group}
                    className={`destination-item ${key === group ? "selected" : ""} ${current && key === groupOf(current) ? "current" : ""}`}
                    onClick={() => setGroup(key)}
                  >
                    <span className="destination-power" data-tip={key === "source" ? undefined : groupsOn[key] ? "On" : "Off"}>
                      {key !== "source" && <PowerIcon on={groupsOn[key]} size={15} />}
                    </span>
                    <span className="destination-group-title">{title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="destination-column destination-settings">
            <div className="destination-heading">Settings</div>
            <ul role="listbox" aria-label="Settings">
              {destinationsOf(group).map((key) => {
                const note = submodeNote(key);
                return (
                  <li key={key} className="destination-setting">
                    <button
                      role="option"
                      aria-selected={key === current}
                      className={`destination-item ${mapped.includes(key) ? "current" : ""}`}
                      onClick={() => onPick(key)}
                    >
                      {LABELS[key].label}
                      {note && <small>{note}</small>}
                    </button>
                    {mapped.includes(key) && (
                      <button
                        className="destination-remove"
                        data-tip={`Remove the mapping to ${LABELS[key].label}`}
                        aria-label={`Remove the mapping to ${LABELS[key].label}`}
                        onClick={() => onRemove(key)}
                      >
                        <Trash size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
