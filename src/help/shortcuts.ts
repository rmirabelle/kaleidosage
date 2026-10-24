/**
 * Every key and mouse gesture of the app, in groups, for the keyboard
 * shortcuts sheet (see docs/HELP.md, part 5). A test checks that every
 * shortcut that a menu shows is here, so the sheet does not go out of date
 * when a menu changes. Texts follow the help rules (ASD-STE100, controls
 * named as the screen shows them).
 */

export interface Shortcut {
  /** The keys or gestures, each as the menus write it ("Ctrl+S"); several mean "or". */
  keys: readonly string[];
  /** What it does, short. */
  does: string;
}

export interface ShortcutGroup {
  title: string;
  shortcuts: readonly Shortcut[];
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: "Scenes",
    shortcuts: [
      { keys: ["Ctrl+N"], does: "New scene, in a new tab" },
      { keys: ["Ctrl+O"], does: "Open scenes" },
      { keys: ["Ctrl+S"], does: "Save the scene (in an open playlist: save the playlist)" },
      { keys: ["Ctrl+Shift+S"], does: "Save the scene as (in an open playlist: export a copy)" },
      { keys: ["Ctrl+W"], does: "Close the scene" },
      { keys: ["1 to 9"], does: "Select that tab, with a crossfade" },
      { keys: ["Ctrl+Tab", "Ctrl+Page Down"], does: "Next tab" },
      { keys: ["Ctrl+Shift+Tab", "Ctrl+Page Up"], does: "Tab before" },
      { keys: ["Middle click a tab"], does: "Close that tab" }
    ]
  },
  {
    title: "Play",
    shortcuts: [
      { keys: ["Space"], does: "Play or pause the scene (the music has its own controls)" },
      { keys: ["Shift+Space"], does: "Stop the scene: pause and go back to its start" },
      { keys: ["F", "F11", "Double-click the picture"], does: "Full screen" },
      { keys: ["Esc"], does: "Leave full screen, or play the ranges that MIDI stopped" }
    ]
  },
  {
    title: "Picture",
    shortcuts: [
      { keys: ["O"], does: "Open an image or video" },
      { keys: ["Ctrl+V"], does: "Use the image on the clipboard" },
      { keys: ["Drop a file"], does: "Use that image or video" },
      { keys: ["X"], does: "Random all: new settings for every unlocked effect" }
    ]
  },
  {
    title: "View",
    shortcuts: [
      { keys: ["H"], does: "Hide or show the panels" },
      { keys: ["A"], does: "Audio panel" },
      { keys: ["M"], does: "MIDI panel" },
      { keys: ["P"], does: "Performance" },
      { keys: ["?"], does: "This sheet" }
    ]
  },
  {
    title: "Edit",
    shortcuts: [
      { keys: ["Ctrl+Z"], does: "Undo" },
      { keys: ["Ctrl+Y", "Ctrl+Shift+Z"], does: "Redo" }
    ]
  },
  {
    title: "Settings",
    shortcuts: [
      { keys: ["Double-click a name"], does: "Set the value, or the whole range, back to its default" },
      { keys: ["Ctrl + hold a name"], does: "No effect from that setting while held" },
      { keys: ["Ctrl + hold an effect's header"], does: "No effect from that effect while held" },
      { keys: ["Ctrl+Shift + hold an effect's header"], does: "Only that effect, while held" },
      { keys: ["Right-click an effect's header"], does: "Turn it on or off, lock it, or remove its MIDI" },
      { keys: ["Drag between range handles"], does: "Move the whole range" },
      { keys: ["Ctrl + drag a range handle"], does: "Mirror the other handle" },
      { keys: ["Right-click a lit MIDI or speaker icon"], does: "Remove its MIDI control or audio link" }
    ]
  },
  {
    title: "MIDI",
    shortcuts: [
      { keys: ["Esc"], does: "Stop Learn, or stop waiting for a control" },
      { keys: ["Ctrl + turn a knob on a range"], does: "Move past a handle; the handle moves with it" }
    ]
  },
  {
    title: "App",
    shortcuts: [
      { keys: ["Alt+F4"], does: "Exit" }
    ]
  }
];

/** Every key and gesture in the list, for the test. */
export const ALL_SHORTCUT_KEYS = SHORTCUT_GROUPS.flatMap((group) => group.shortcuts.flatMap((shortcut) => shortcut.keys));
