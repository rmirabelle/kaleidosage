import { Keys, MenuPath, Shot, Tip } from "../parts";

/** One row of a shortcut table: keys ("Ctrl+S", several mean "or"), or a mouse action in words, then what it does. */
type Row = { keys?: string[]; action?: string; does: string };

/**
 * A table of keys and mouse actions, in the form of ShortcutList. A mouse
 * action is plain text, not key caps. The rows are those of the app's own
 * sheet (src/help/shortcuts.ts).
 */
function ShortcutTable({ rows }: { rows: Row[] }) {
  return (
    <dl className="help-shortcuts">
      {rows.map((row) => (
        <div key={`${row.keys?.join("|") ?? row.action}|${row.does}`}>
          <dt>
            {row.keys?.map((combo, index) => (
              <span key={combo}>
                {index > 0 && <i>/</i>}
                <Keys k={combo} />
              </span>
            ))}
            {row.keys && row.action && " "}
            {row.action}
          </dt>
          <dd>{row.does}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Updates() {
  return (
    <>
      <h1>Updates and shortcuts</h1>
      <p className="help-lead">
        Kaleido Sage looks for a new version each time it starts, and installs it with one command. This
        chapter also lists all keys and mouse actions of the app.
      </p>

      <h2>The About dialog</h2>
      <Shot name="about-dialog" alt="The About dialog with the Check for Updates button" />
      <p>
        Select <MenuPath path="Help > About Kaleido Sage" />. The dialog shows the version of the app that
        you use, and the credits for the two models that examine songs for Song follow.
      </p>
      <p>
        <b>Check for Updates</b> asks if a newer version is available. The answer is one of these:
      </p>
      <ul>
        <li><b>Kaleido Sage is up to date.</b> You have the newest version.</li>
        <li>
          <b>Version … is available.</b> The dialog shows the new version and your version, with
          a <b>Download and Install</b> button.
        </li>
        <li>
          A message that the check did not work, with <b>Try again</b>. The check needs an internet
          connection.
        </li>
      </ul>

      <h2>Install an update</h2>
      <p>
        When Kaleido Sage finds a new version at start-up, an <b>Update available</b> button shows in the
        title bar. Select it to open the About dialog, then select <b>Download and Install</b>.
      </p>
      <p>
        If the project has changes that are not saved, Kaleido Sage asks first if you want to save them.
        Then it downloads the update and shows the progress. When the download is complete, the app
        closes, installs the update with no setup pages, and opens again.
      </p>
      <Tip>
        You cannot close the About dialog during the download. Let the download complete.
      </Tip>

      <h2>The Keyboard Shortcuts sheet</h2>
      <Shot name="shortcuts-sheet" alt="The Keyboard shortcuts sheet" side="block" />
      <p>
        <MenuPath path="Help > Keyboard Shortcuts" />, or the <Keys k="?" /> key, opens a sheet with all keys
        and mouse actions. The key works everywhere, also on the start screen, but not while you type in a
        text box. <Keys k="Esc" />, a second <Keys k="?" />, or a click outside the sheet closes it.
      </p>
      <p>
        The tables below have the same content as the sheet.
      </p>

      <h2>Scenes</h2>
      <ShortcutTable
        rows={[
          { keys: ["Ctrl+N"], does: "Add a blank scene (on the start screen: new project)" },
          { keys: ["Ctrl+O"], does: "Open a project" },
          { keys: ["Ctrl+S"], does: "Save the project" },
          { keys: ["Ctrl+Shift+S"], does: "Save the project as" },
          { keys: ["Ctrl+I"], does: "Import scenes from other projects" },
          { keys: ["Ctrl+W"], does: "Remove the scene from the project" },
          { keys: ["1"], action: "to 9", does: "Select that tab, with a crossfade" },
          { keys: ["Ctrl+Tab", "Ctrl+Page Down"], does: "Next tab" },
          { keys: ["Ctrl+Shift+Tab", "Ctrl+Page Up"], does: "Tab before" },
          { action: "Middle click a tab", does: "Close that tab" }
        ]}
      />

      <h2>Play</h2>
      <ShortcutTable
        rows={[
          { keys: ["Space"], does: "Play or pause the scene (the music has its own controls)" },
          { keys: ["Shift+Space"], does: "Stop the scene: pause and go back to its start" },
          { keys: ["F", "F11"], does: "Full screen" },
          { action: "Double-click the picture", does: "Full screen" },
          { keys: ["C"], does: "Cast: show the picture on the other screen, or stop" },
          { keys: ["Esc"], does: "Leave full screen, or play the ranges that MIDI stopped" }
        ]}
      />

      <h2>Picture</h2>
      <ShortcutTable
        rows={[
          { keys: ["Ctrl+V"], does: "Use the image on the clipboard" },
          { action: "Drop a file", does: "Use that image or video" },
          { keys: ["X"], does: "Random all: new settings for every unlocked effect" }
        ]}
      />

      <h2>View</h2>
      <ShortcutTable
        rows={[
          { keys: ["H"], does: "Hide or show the panels" },
          { keys: ["A"], does: "Audio panel" },
          { keys: ["M"], does: "MIDI panel" },
          { keys: ["P"], does: "Performance" },
          { keys: ["F1"], does: "Kaleido Sage Help" },
          { keys: ["?"], does: "The Keyboard Shortcuts sheet" }
        ]}
      />

      <h2>Edit</h2>
      <ShortcutTable
        rows={[
          { keys: ["Ctrl+Z"], does: "Undo" },
          { keys: ["Ctrl+Y", "Ctrl+Shift+Z"], does: "Redo" }
        ]}
      />

      <h2>Settings</h2>
      <ShortcutTable
        rows={[
          { action: "Double-click a name", does: "Set the value, or the whole range, back to its default" },
          { keys: ["Ctrl"], action: "+ hold a name", does: "No effect from that setting while held" },
          { keys: ["Ctrl"], action: "+ hold an effect's header", does: "No effect from that effect while held" },
          { keys: ["Ctrl+Shift"], action: "+ hold an effect's header", does: "Only that effect, while held" },
          { action: "Right-click an effect's header", does: "Turn it on or off, lock it, or remove its MIDI" },
          { action: "Drag between range handles", does: "Move the whole range" },
          { keys: ["Ctrl"], action: "+ drag a range handle", does: "Mirror the other handle" },
          { action: "Right-click a lit MIDI or speaker icon", does: "Remove its MIDI control or audio link" }
        ]}
      />

      <h2>MIDI</h2>
      <ShortcutTable
        rows={[
          { keys: ["Esc"], does: "Stop Learn, or stop waiting for a control" },
          { keys: ["Ctrl"], action: "+ turn a knob on a range", does: "Move past a handle; the handle moves with it" }
        ]}
      />

      <h2>App</h2>
      <ShortcutTable rows={[{ keys: ["Alt+F4"], does: "Exit" }]} />
    </>
  );
}
