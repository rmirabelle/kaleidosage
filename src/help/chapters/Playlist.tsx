import { Keys, MenuPath, ShortcutList, Shot, Tip } from "../parts";

export function Playlist() {
  return (
    <>
      <h1>The Playlist and the Scenes list</h1>
      <p className="help-lead">
        With audio files as the input, Kaleido Sage plays a full show. The Playlist holds the songs, the
        Scenes list holds the scenes, and the scenes change by themselves while the music plays.
      </p>

      <h2>The window of a show</h2>
      <Shot name="playlist-window" alt="The Kaleido Sage window with a show of 20 songs and 58 scenes" side="block" />
      <p>
        When <b>Files</b> is the input, the window has more areas. From left to right:
      </p>
      <ul>
        <li>The <b>Playlist</b> lists the audio files. The music controls are below it.</li>
        <li>The <b>Scenes</b> list replaces the tabs, because a show can have many scenes.</li>
        <li>The <b>Scene</b> card and the <b>FX</b> card show the selected scene, as before.</li>
        <li>The picture is at the right.</li>
        <li>
          The <b>Song Map</b>, at the bottom, shows which scene plays in each part of the song. It
          shows while Song follow is on. See <i>Song follow and the Song Map</i>.
        </li>
      </ul>

      <h2>Start a playlist</h2>
      <Shot name="playlist-card" alt="The Playlist card with its title bar and its first files" />
      <p>
        In the play controls, open the <b>Input</b> list and select <b>Files</b>. The Playlist appears
        at the left of the window.
      </p>
      <p>
        Select <Shot name="playlist-add" alt="The Add File(s) button" side="inline" /> to add audio files at
        the end of the list. You can select many files at one time. Kaleido Sage plays MP3, WAV, FLAC, OGG,
        Opus, M4A and AAC files. A file that is in the list already is not added again.
      </p>
      <p>
        Each row is one file. Select a row to play that file. Drag a row to change the order.
        The <b>×</b> on a row removes the file from the list, and the trash button removes all of them, after a
        question. The files on your disk do not change.
      </p>
      <p>
        The line below the list shows the number of files and their total play time. After the last file,
        the playlist starts again at the first.
      </p>

      <h2>The music controls</h2>
      <Shot name="playlist-controls" alt="The music controls below the Playlist: Input, Output, the level, the play buttons and the seek bar" side="left" />
      <p>
        The music controls are below the list. <Shot name="playlist-play" alt="The Play button" side="inline" /> plays
        or pauses the music. <Shot name="playlist-stop" alt="The Stop button" side="inline" /> stops it and goes
        back to the start of the file. Stop also takes the show back to its first scene, unless Scene Hold is on. The third button
        is <b>Song follow</b>. Drag the bar at the right to move in the file.
      </p>
      <p>
        The dark bar above the buttons is the level of the music while it plays.
      </p>

      <h2>Select the speaker</h2>
      <Shot name="playlist-output-menu" alt="The Output list, open, with the speakers of the PC" />
      <p>
        The <b>Output</b> list selects the speaker that plays the audio files. The other sounds of your PC
        stay on the default speaker of Windows. Use this to send the music of the show to a different sound
        card, or to a virtual cable for a stream.
      </p>
      <p>
        If the selected speaker is not connected, the files play on the default device, and a message below
        the list tells you.
      </p>

      <h2>How the scenes change</h2>
      <p>
        While the music plays, the show goes through the scenes in the order of the Scenes list. The picture
        crossfades from one scene to the next. With <b>Song follow</b> on, the Song Map of each song decides
        when the scenes change. With Song follow off, these rules apply:
      </p>
      <ul>
        <li>Each scene plays for its <b>Length</b>. Then the next scene comes in. After the last scene, the first comes in again.</li>
        <li>A new file also brings in the next scene. When a scene is near its end at that time, it waits for the new file.</li>
        <li>A scene that you select stays for half its Length or more.</li>
        <li>The scenes change only while the music plays.</li>
      </ul>
      <Shot name="scene-controls-auto" alt="The play controls of the scene, with the time to the next scene and the Scene Hold button" side="block" />
      <p>
        With Song follow off, the play controls of the scene show a bar that gets shorter as the next scene
        comes near. The bar is yellow in the last 10 seconds, and red in the last 5.
      </p>
      <p>
        <b>Scene Hold</b> keeps the scene on the screen. The music plays on, and the scene plays again and
        again. Scene Hold also comes on by itself when you change a setting, so the scene does not go
        away while you work on it. To continue the show, select <b>Scene Hold</b> again.
      </p>

      <h2>Set the threshold on the level</h2>
      <Shot name="playlist-threshold" alt="The level of the music with the orange line of the Master Threshold" />
      <p>
        With Song follow off, the audio links of the settings measure the music while it plays. The level
        bar then has an orange line: the <b>Master Threshold</b>. Sound below the line moves nothing. Drag
        the line to change it. See <i>Audio input and audio links</i>.
      </p>
      <p>
        With Song follow on, the bar has no line, because the song's own analysis moves the picture.
      </p>

      <h2>Make room for the scene</h2>
      <Shot name="playlist-collapsed" alt="The Playlist as a narrow strip beside the Scenes list" side="left" />
      <p>
        The <b>«</b> button in the title bar of the Playlist makes the Playlist a narrow strip, which shows only
        the number of files. Select the strip to show the Playlist
        again. <MenuPath path="View > Hide Playlist" /> does the same.
      </p>
      <p>
        To make the Playlist wider or narrower, drag its right edge. The project keeps the width.
      </p>

      <h2>The Scenes list in a show</h2>
      <p>
        The basic functions of the Scenes list are in <i>Projects and scenes</i>. In a show, the list has
        more to tell you.
      </p>
      <Shot name="scene-use-pop" alt="The mouse on the use count of a scene, and the list of the songs that use it" side="block" />
      <p>
        The number at the right of each scene counts the songs that use the scene in their Song Map. Point
        at the number to see those songs, and how many slices of each song play the scene. A scene with
        the number 0 is not used in the show.
      </p>
      <Shot name="scene-sort-menu" alt="The Sort menu of the Scenes list" side="left" />
      <p>
        The <b>Sort</b> button puts the scenes in a new order, and the scenes then play in that
        order. <b>Usage count</b> puts the most used scenes first, so the scenes that no song uses are at
        the end of the list.
      </p>
      <p>
        You can also drag a scene to a new position. A drag is not possible while the <b>Filter
        scenes</b> box has text.
      </p>
      <Shot name="scene-row-menu" alt="The menu of a scene: Rename and Remove Scene" />
      <p>
        Right-click a scene for its menu. <b>Rename</b> changes the name in the list. Press <Keys k="Enter" /> to
        keep the new name, or <Keys k="Esc" /> to keep the old one. <b>Remove Scene</b> takes the scene
        out of the project. A middle click on a scene also removes it.
      </p>

      <h2>What the project keeps</h2>
      <p>
        When you save a show, the project file keeps the audio files themselves, not only their names. It
        also keeps the analysis and the Song Map of each song, the audio settings, and the width of the
        Playlist. Thus the show plays on another computer from this one file. A show with many songs
        makes a large file.
      </p>
      <Tip>
        If you save while the input is <b>Nothing</b>, Kaleido Sage asks if it can take the audio files out
        of the project. To keep them, cancel, select <b>Files</b> as the input, and save again.
      </Tip>

      <h2>Shortcuts</h2>
      <ShortcutList
        rows={[
          ["Space", "With Song follow on: play or pause the music"],
          ["Shift+Space", "With Song follow on: stop the music"],
          ["1", "Keys 1 to 9: select the scene with that number"],
          ["Ctrl+Tab", "Next scene"],
          ["Ctrl+Shift+Tab", "Scene before"]
        ]}
      />
    </>
  );
}
