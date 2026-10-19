import type { ReactNode } from "react";
import { SpeakerSimpleHigh, X } from "@phosphor-icons/react";
import { HelpButton } from "./HelpButton";
import { MidiIcon } from "./MidiIcon";

export type BottomTab = "midi" | "audio";

const TABS: readonly (readonly [BottomTab, string, string, ReactNode])[] = [
  ["audio", "Audio", "Sound that the settings react to (A)", <SpeakerSimpleHigh size={16} />],
  ["midi", "MIDI", "MIDI controllers and mappings (M)", <MidiIcon size={14} />]
];

/**
 * The bottom panel's top row, by itself: the tabs (Audio, MIDI) at the
 * left, as buttons like the document tabs, and the close button at the
 * right. Each tab's own buttons are in its toolbar, under this row.
 */
export function BottomPanelTabs({ tab, onTab, onClose }: { tab: BottomTab; onTab: (tab: BottomTab) => void; onClose: () => void }) {
  return (
    <div className="bottom-panel-tab-row">
      <div className="bottom-panel-tabs" role="tablist">
        {TABS.map(([id, label, title, icon]) => (
          <button
            key={id}
            className={`bottom-panel-tab ${id === tab ? "active" : ""}`}
            role="tab"
            aria-selected={id === tab}
            data-tip={title}
            onClick={() => onTab(id)}
          >
            {icon}
            {label}
          </button>
        ))}
        {/* The MIDI page's help sits after its title, the MIDI tab; each Audio column has its own help in its heading. */}
        {tab === "midi" && <HelpButton topic="midi" inline />}
      </div>
      <button className="side-panel-action" onClick={onClose} data-tip="Close the panel" aria-label="Close the panel">
        <X size={13} weight="bold" />
      </button>
    </div>
  );
}
