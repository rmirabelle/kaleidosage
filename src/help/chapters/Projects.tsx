import { Keys, MenuPath, ShortcutList, Shot, Tip } from "../parts";

export function Projects() {
  return (
    <>
      <h1>Projects and scenes</h1>
      <p className="help-lead">
        A project is one Kaleido Sage file. It holds one or more scenes, and for a show with music, the
        audio files and their song maps too. A scene is one moving picture: its source images, its
        effects and its links to the sound.
      </p>

      <h2>What a project holds</h2>
      <p>
        A project file has the extension <b>.ksage</b>. It keeps its scenes in their order, the audio
        settings, and the place of each panel divider. While <b>Files</b> is the audio input, the project
        also keeps a copy of each audio file and its song analysis. Thus a project plays the same on
        another computer, with no other files.
      </p>
      <p>
        The title bar shows the name of the project, then the name of the selected
        scene. A <b>*</b> after a name shows that it has changes that are not saved.
      </p>
      <Shot name="titlebar-file" alt="The project name and the scene name in the title bar" side="block" />

      <h2>New, open, save and close</h2>
      <Shot name="file-menu" alt="The File menu" />
      <p>
        All project commands are in the <b>File</b> menu.
      </p>
      <ul>
        <li><b>New Project</b> starts an untitled project with one blank scene.</li>
        <li><b>Open Project</b> (<Keys k="Ctrl+O" />) opens a project in place of the open one.</li>
        <li><b>Save Project</b> (<Keys k="Ctrl+S" />) saves the project with all of its scenes.</li>
        <li><b>Save Project As</b> (<Keys k="Ctrl+Shift+S" />) saves a copy under a new name.</li>
        <li><b>Close Project</b> closes all scenes and goes back to the start screen.</li>
      </ul>
      <p>
        Only one project is open at a time. Before a command closes the open project, Kaleido Sage asks if
        you want to save its changes.
      </p>

      <h2>The Open dialog</h2>
      <Shot name="open-dialog" alt="The Open dialog with a project selected" side="block" />
      <p>
        The Open dialog lists the folders and files of your computer. <b>Places</b> at the left go to
        your usual folders and drives. The <b>Type</b> column tells a single scene (<b>KS Scene</b>) from a
        show with music (<b>KS Playlist</b>). Select a file to see its scenes and its tracks in the
        preview at the right. Right-click a file to rename, copy or delete it.
      </p>

      <h2>Scenes: tabs or a list</h2>
      <Shot name="scene-tabs" alt="Three scene tabs above the picture" side="block" />
      <p>
        The scenes of a project show as tabs above the picture. Select a tab to show its scene. Drag a
        tab to change the order: the scenes play in tab order. The <b>×</b> on a tab, or a middle click,
        removes the scene from the project.
      </p>
      <p>
        When <b>Files</b> is the audio input, a show can have many scenes, so the tabs change to
        the <b>Scenes</b> list at the left. The list has the same commands as the tabs.
      </p>
      <Shot name="scene-list" alt="The Scenes list with its Sort and Filter controls" side="left" />
      <p>
        Type in <b>Filter scenes</b> to find a scene by name. The <b>Sort</b> button puts the scenes in
        order by name, by how many songs use them, or by the date of their last change. The number at
        the right of a scene counts the songs that use it. Point at the number to see those songs.
      </p>
      <p>
        The footer counts the scenes. The trash button removes every scene, after a question.
      </p>

      <h2>Switch scenes</h2>
      <p>
        While a scene plays, a new scene does not cut in. The picture crossfades from the old scene to the
        new one, and the new scene starts from its beginning. Keys <Keys k="1" /> to <Keys k="9" /> select
        the scene with that number, also in full screen.
      </p>

      <h2>Add, import, export and remove</h2>
      <ul>
        <li><b>Add Blank Scene</b> (<Keys k="Ctrl+N" />) adds a new scene with no effects.</li>
        <li>
          <b>Import Scene(s)</b> (<Keys k="Ctrl+I" />) adds all the scenes of other projects. Their audio
          files stay out. When a scene has the same name as one in the project, Kaleido Sage asks if it
          replaces that scene or keeps both.
        </li>
        <li><b>Export Scene</b> writes the selected scene to a project of its own.</li>
        <li><b>Remove Scene</b> (<Keys k="Ctrl+W" />) takes the selected scene out of the project.</li>
      </ul>
      <p>
        To rename a scene, double-click its tab or its row, or right-click it and select <b>Rename</b>. You can
        rename a new scene only after you save the project once.
      </p>

      <h2>Undo and redo</h2>
      <p>
        <MenuPath path="Edit > Undo" /> (<Keys k="Ctrl+Z" />) takes back the last change to the settings,
        and <MenuPath path="Edit > Redo" /> (<Keys k="Ctrl+Y" />) does it again. Each scene has its own
        history. A full slider drag, or a full turn of a MIDI knob, counts as one change.
      </p>
      <Tip>
        A scene is part of its project. The project files that you imported scenes from do not change when
        you edit those scenes.
      </Tip>

      <h2>Shortcuts</h2>
      <ShortcutList
        rows={[
          ["Ctrl+O", "Open a project"],
          ["Ctrl+S", "Save the project"],
          ["Ctrl+Shift+S", "Save the project as"],
          ["Ctrl+N", "Add a blank scene"],
          ["Ctrl+I", "Import scenes from other projects"],
          ["Ctrl+W", "Remove the scene from the project"],
          ["Ctrl+Tab / Ctrl+Page Down", "Next scene"],
          ["Ctrl+Shift+Tab / Ctrl+Page Up", "Scene before"],
          ["Ctrl+Z", "Undo"],
          ["Ctrl+Y", "Redo"]
        ]}
      />
    </>
  );
}
