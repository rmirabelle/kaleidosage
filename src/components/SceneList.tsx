import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { MagnifyingGlass, PencilSimple, SortAscending, Trash, X } from "@phosphor-icons/react";
import { ContextMenu } from "./ContextMenu";
import { help } from "../help/topics";
import type { DocumentTabInfo } from "./DocumentTabs";
import { useDragReorder } from "./useDragReorder";
import { useCtrlHeld } from "./useCtrlHeld";
import { songFollow } from "../lib/songFollow";
import { tracks } from "../lib/tracks";

const subscribeFollow = (listener: () => void) => songFollow.subscribe(listener);
const followVersion = () => songFollow.version;
const subscribeTracks = (listener: () => void) => tracks.subscribe(listener);
const tracksVersion = () => tracks.version;
/** True while a Song Map slice is selected (see songFollow.selection): a Ctrl+click on a scene then picks it for that slice. */
const sliceSelected = () => songFollow.enabled && songFollow.selection !== null;

/** A song that uses a scene: its name, and how many of its Song Map slices picked the scene. */
interface SongUse { name: string; slices: number }

/** For each scene (by tab index), the songs of the playlist whose Song Map picked it, in playlist order. */
function sceneUse(sceneCount: number): SongUse[][] {
  const use: SongUse[][] = Array.from({ length: sceneCount }, () => []);
  for (const track of tracks.list) {
    const counts = new Map<number, number>();
    for (const slice of songFollow.analysisFor(track.path)?.mapEdits ?? []) {
      if (slice.scene !== undefined && slice.scene >= 0 && slice.scene < sceneCount) counts.set(slice.scene, (counts.get(slice.scene) ?? 0) + 1);
    }
    for (const [scene, slices] of counts) use[scene].push({ name: track.name, slices });
  }
  return use;
}

/** Names in A–Z order, as a person reads them: "Scene 2" before "Scene 10", and case does not count. */
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare;

interface Props {
  tabs: DocumentTabInfo[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onClose: (id: number) => void;
  /** The scenes' ids in a new order, after a drag. */
  onReorder: (ids: number[]) => void;
  /** Gives the scene a new name (without the .ksage), from Rename in its right-click menu. */
  onRename: (id: number, name: string) => void;
  /** A Ctrl+click on a scene while a Song Map slice is selected: the slice plays this scene (see songFollow.pickScene). */
  onPick: (id: number) => void;
  /** With Files as the input: each scene shows how many songs of the playlist use it (see sceneUse). */
  showUse?: boolean;
}

/**
 * The number of songs that use a scene, as a small badge in its row. While
 * the mouse is over it, a box at its right lists those songs, each with the
 * number of its slices that play the scene.
 */
function UseBadge({ use }: { use: SongUse[] }) {
  const [box, setBox] = useState<DOMRect | null>(null);
  const tip = use.length === 0 ? "No song of the playlist uses this scene" : `Used in ${use.length === 1 ? "1 song" : `${use.length} songs`}: ${use.map((song) => song.name).join(", ")}`;
  return (
    <>
      <span
        className={`scene-use-badge ${use.length === 0 ? "unused" : ""}`}
        data-tip={tip}
        aria-label={tip}
        onPointerEnter={(event) => { if (use.length > 0) setBox(event.currentTarget.getBoundingClientRect()); }}
        onPointerLeave={() => setBox(null)}
        onPointerDown={() => setBox(null)}
      >
        {use.length}
      </span>
      {box && createPortal(
        <div className="toolbar-dropdown scene-use-pop" style={{ left: box.right + 8, top: box.top - 6 }} role="tooltip">
          <div className="scene-use-pop-title">{use.length === 1 ? "Used in 1 song" : `Used in ${use.length} songs`}</div>
          <ol>
            {use.map((song, index) => (
              <li key={index}>
                <span className="scene-use-pop-name">{song.name}</span>
                <span className="scene-use-pop-slices">{song.slices === 1 ? "1 slice" : `${song.slices} slices`}</span>
              </li>
            ))}
          </ol>
        </div>,
        document.body
      )}
    </>
  );
}

/**
 * The open scenes as a list, in the first column of the left side, before
 * the Source and FX column (see .sidebar): in Files mode it takes the place
 * of the tabs, which would fill many rows for a long show. The scenes play
 * from the top down. A press selects a scene; a drag moves it to another
 * place (see useDragReorder); the trash button or a middle click takes it out of the
 * file. A right-click opens a menu: Rename (the name turns into a text box:
 * Enter keeps the new name, Esc does not) and Remove Scene. While a slice of the
 * Song Map is selected, Ctrl+click picks a scene for it and shows that
 * scene, as a plain click does: as long as Ctrl
 * is held, the list shows a pick cursor, and the scene under the pointer
 * lights up in the same color as the selected slice. Its card has a title
 * bar like the Source card's, with Sort A–Z, which puts the scenes in name
 * order (that is then the order they play in). Under it, a search box shows
 * only the scenes whose names have the text; the numbers stay the scenes'
 * places, and no drag starts while the list is filtered. With Files as the
 * input, each row has a badge with the number of songs that use the scene
 * (see UseBadge).
 */
export function SceneList({ tabs, activeId, onSelect, onClose, onReorder, onRename, onPick, showUse = false }: Props) {
  const drag = useDragReorder(tabs.map((tab) => tab.id), onReorder);
  const canPick = useSyncExternalStore(subscribeFollow, sliceSelected);
  useSyncExternalStore(subscribeFollow, followVersion);
  useSyncExternalStore(subscribeTracks, tracksVersion);
  const picking = useCtrlHeld() && canPick;
  const [menu, setMenu] = useState<{ id: number; left: number; top: number } | null>(null);
  const [renaming, setRenaming] = useState<{ id: number; value: string } | null>(null);
  const [filter, setFilter] = useState("");
  const baseName = (tab: Props["tabs"][number]) => tab.fileName.replace(/\.ksage$/i, "");
  const use = showUse ? sceneUse(tabs.length) : [];
  const query = filter.trim().toLowerCase();
  const shown = tabs.map((tab, index) => ({ tab, index })).filter(({ tab }) => !query || baseName(tab).toLowerCase().includes(query));
  const nameOrder = [...tabs].sort((a, b) => byName(baseName(a), baseName(b))).map((tab) => tab.id);
  const sorted = nameOrder.every((id, index) => id === tabs[index].id);
  const commitRename = () => {
    if (!renaming) return;
    const tab = tabs.find((each) => each.id === renaming.id);
    setRenaming(null);
    const name = renaming.value.trim();
    if (tab && name && name !== baseName(tab)) onRename(tab.id, name);
  };
  return (
    <aside className="side-panel scene-list" aria-label="Scenes" {...help("scene.tabs")}>
      <section className="panel-card scene-card">
        <div className="panel-header-bar">
          <h2 className="side-panel-title">Scenes</h2>
          <span className="files-card-buttons">
            <button
              className="button secondary small icon-only"
              disabled={tabs.length < 2 || sorted}
              onClick={() => onReorder(nameOrder)}
              data-tip={sorted && tabs.length > 1 ? "The scenes are in A–Z order" : "Sort the scenes A–Z by name; they then play in that order"}
              aria-label="Sort the scenes A–Z"
            >
              <SortAscending size={14} />
            </button>
          </span>
        </div>
        <label className="open-search scene-list-search">
          <MagnifyingGlass size={14} />
          <input
            type="text"
            placeholder="Filter scenes"
            value={filter}
            spellCheck={false}
            aria-label="Show only the scenes whose names have this text"
            onChange={(event) => setFilter(event.target.value)}
            onKeyDown={(event) => {
              /* Here, so the keys do not also reach the app's shortcuts. */
              event.stopPropagation();
              if (event.key === "Escape") setFilter("");
            }}
          />
          {filter !== "" && (
            <button type="button" onClick={() => setFilter("")} aria-label="Clear the filter" data-tip="Clear the filter">
              <X size={12} weight="bold" />
            </button>
          )}
        </label>
        <ol ref={drag.listRef} className={`scene-list-items ${picking ? "picking" : ""}`} role="listbox" aria-label="Scenes">
          {shown.map(({ tab, index }) => {
            const active = tab.id === activeId;
            return (
              <li
                key={tab.id}
                data-key={tab.id}
                role="option"
                aria-selected={active}
                className={`scene-list-item ${active ? "active" : ""} ${drag.dragging === tab.id ? "dragging" : ""}`}
                data-tip={picking ? "Click to play this scene on the selected slice" : undefined}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  if (event.ctrlKey && canPick) {
                    /* The pick, then the scene shows, as a plain click shows it; no drag starts. */
                    onPick(tab.id);
                    onSelect(tab.id);
                    return;
                  }
                  onSelect(tab.id);
                  /* A drag among some of the scenes would put them in places the user does not see. */
                  if (!query) drag.start(tab.id)(event);
                }}
                onAuxClick={(event) => { if (event.button === 1) onClose(tab.id); }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({ id: tab.id, left: event.clientX, top: event.clientY });
                }}
              >
                <span className="scene-list-number">{index + 1}</span>
                {renaming?.id === tab.id ? (
                  <input
                    className="scene-list-rename"
                    value={renaming.value}
                    autoFocus
                    spellCheck={false}
                    aria-label={`New name for ${tab.fileName}`}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => setRenaming({ id: tab.id, value: event.target.value })}
                    onPointerDown={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      /* Here, so the keys do not also reach the app's shortcuts. */
                      event.stopPropagation();
                      if (event.key === "Enter") commitRename();
                      if (event.key === "Escape") setRenaming(null);
                    }}
                    onBlur={commitRename}
                  />
                ) : (
                  <span className="scene-list-name">{baseName(tab)}{tab.dirty && <span className="titlebar-dirty">*</span>}</span>
                )}
                {showUse && <UseBadge use={use[index] ?? []} />}
                <button
                  className="scene-list-close"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onClose(tab.id)}
                  data-tip={active ? "Remove the scene from the project `Ctrl+w`" : "Remove the scene from the project"}
                  aria-label={`Remove ${tab.fileName}`}
                >
                  <Trash size={12} weight="bold" />
                </button>
              </li>
            );
          })}
        </ol>
        {menu && createPortal(
          <ContextMenu
            position={{ left: menu.left, top: menu.top }}
            onClose={() => setMenu(null)}
            items={(() => {
              const tab = tabs.find((each) => each.id === menu.id);
              return [
                { label: tab?.path ? "Rename…" : "Rename… (save the project first)", icon: <PencilSimple size={14} />, disabled: !tab?.path, run: () => tab && setRenaming({ id: tab.id, value: baseName(tab) }) },
                { label: "Remove Scene", icon: <Trash size={14} />, run: () => onClose(menu.id) }
              ];
            })()}
          />,
          document.body
        )}
        {/* The footer: how many scenes. The title bar has the file's one unsaved mark. */}
        <div className="files-card-foot">
          <span>{query ? `${shown.length} of ${tabs.length} scenes` : tabs.length === 1 ? "1 scene" : `${tabs.length} scenes`}</span>
        </div>
      </section>
    </aside>
  );
}
