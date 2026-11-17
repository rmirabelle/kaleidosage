import { Keys, ShortcutList, Shot, Tip } from "../parts";

export function SongMap() {
  return (
    <>
      <h1>Song follow and the Song Map</h1>
      <p className="help-lead">
        Song follow examines each song of the Playlist before it plays. The picture then follows the
        song exactly: its beats, its quiet and loud parts, and its big moments. The Song Map shows what Song
        follow found, and lets you select the scene for each part of the song.
      </p>

      <h2>What Song follow does</h2>
      <p>
        Live sound can only tell Kaleido Sage how loud the music is now. Song follow knows the full song.
        Its analysis finds the beats and the bars, the tempo, the parts of the song, such as a verse or a
        chorus, and the hits: the moments where the song changes hard. With this knowledge, Kaleido Sage does
        two things:
      </p>
      <ul>
        <li>
          The settings that have an audio link move with the plan of the song, in time with the beats.
          The Master Gain and the Master Threshold are not necessary.
        </li>
        <li>
          The scenes change at the start of a part of the song, not after a fixed time.
        </li>
      </ul>

      <h2>Turn on Song follow</h2>
      <Shot name="song-follow-button" alt="The music controls with the mouse on the Song follow button" />
      <p>
        The <Shot name="song-follow-icon" alt="The Song follow button" side="inline" /> button is in the
        music controls, below the Playlist. Kaleido Sage turns Song follow on when you
        select <b>Files</b> as the input. Select the button to turn it off or on.
      </p>
      <p>
        The first time, Kaleido Sage downloads its song analysis files, about 80 MB. This needs an internet
        connection, and occurs only one time. Then it examines the song that plays, and after that the
        other songs, one at a time. During this work the button pulses, and the Song Map shows the name of
        the song that it examines.
      </p>
      <p>
        The project keeps each analysis. A song is not examined again when you open the project.
      </p>

      <h2>The Song Map</h2>
      <Shot name="song-map-slice" alt="The left part of the Song Map, with the third slice selected" side="block" />
      <p>
        The Song Map is at the bottom of the window. Its title is the name of the song. The arrows at each
        side of the title show the map of the song before or after, and do not change the music that plays.
      </p>
      <p>
        The strip shows the song from its start to its end as <b>slices</b>. Each slice is one part of the
        song. The name at the bottom of a slice, and its color, show its mood: a brighter blue is a part
        with more energy. The yellow tag at the top of a slice is the scene that comes in when the slice
        starts. The bar below the strip shows the position in the song, with the time below it. Drag
        it to move in the song.
      </p>

      <h2>Select a slice</h2>
      <p>
        Select a slice to work on it. The slice gets a red outline, and the song plays from its
        start, so you hear the part that you work on. Right-click a slice to pause the music. While the
        music plays, the selected slice is always the slice that plays.
      </p>
      <p>
        The buttons of the toolbar act on the selected slice. They are off while no slice is selected.
      </p>

      <h2>Put a scene on a slice</h2>
      <Shot name="song-map-pick" alt="The mouse on a scene of the Scenes list, with Ctrl held" />
      <p>
        Each slice can have its own scene.
      </p>
      <ol>
        <li>Select the slice.</li>
        <li>
          Hold <Keys k="Ctrl" /> and select a scene in the <b>Scenes</b> list. The scene shows, and the
          slice gets a tag with its name.
        </li>
      </ol>
      <Shot name="song-map-picked" alt="The selected slice with the tag of its new scene" side="block" />
      <p>
        When the song comes to a slice that has a scene, that scene comes in with a short crossfade. A
        slice with no tag changes nothing: the scene before it continues.
      </p>
      <p>
        <Shot name="song-map-fill" alt="The Auto Fill button" side="inline" /> gives a scene to each slice that
        has none. It takes the scenes in the order of the Scenes list. When you add songs to a project that
        has two or more scenes, Kaleido Sage does this by itself after it examines each song.
      </p>

      <h2>Set the mood</h2>
      <Shot name="song-map-mood" alt="The Mood buttons, with the mouse on Peak" side="block" />
      <p>
        The mood of a slice tells how much energy the picture has while the slice
        plays. <b>Calm</b>, <b>Steady</b>, <b>Rising</b> and <b>Peak</b> go from the least to the most
        energy. A higher mood moves the linked settings further, makes the pulse on each beat stronger, and
        makes the motion faster.
      </p>
      <p>
        The analysis gives each slice a mood. Select a different mood when the picture is too quiet or too
        wild for that part of the song. The mood does not select the scene.
      </p>

      <h2>Mark a hit</h2>
      <Shot name="song-map-hit" alt="The Hit button, and the red mark of a hit on the selected slice" side="block" />
      <p>
        A hit is a big moment, such as the drop after a build-up. Select <b>Hit</b> to mark the start of
        the selected slice as a hit. The slice shows
        a <Shot name="song-map-hit-mark" alt="The red mark of a hit" side="inline" /> mark. The picture then rises
        before the slice, and changes hard when it starts. If the slice has a scene, the scene cuts in
        with no crossfade. The first slice of a song cannot be a hit.
      </p>

      <h2>Change the slices</h2>
      <Shot name="song-map-divider" alt="The mouse on the divider between two slices" side="block" />
      <p>
        If a part of the song starts at a different time than the analysis found, change the slices:
      </p>
      <ul>
        <li>Drag the divider between two slices. The two slices change size.</li>
        <li><b>Split</b> cuts a slice in two at the position in the song. The song of the map must be the song that plays.</li>
        <li><b>Merge</b> joins the selected slice with the next one. The result keeps the scene and the mood of the selected slice.</li>
        <li>The trash button, or <Keys k="Delete" />, deletes the selected slice. The slice before it gets its time.</li>
      </ul>
      <p>
        With <b>Snap</b> on, a divider and a split go to the start of the nearest
        bar. <Shot name="song-map-reset" alt="The Reset Map button" side="inline" /> at the right of the toolbar
        gives back the map that the analysis found. The scenes that you put on the slices go away.
      </p>

      <h2>Scene Hold with Song follow</h2>
      <Shot name="scene-hold-bar" alt="The Scene Hold button below the FX card" />
      <p>
        While Song follow is on, the song controls the scene, so the play controls of the scene change to
        one <b>Scene Hold</b> button. Scene Hold keeps the scene on the screen, and the music plays the
        current slice again and again. Thus you can adjust a scene in the part of the song that it is for.
      </p>
      <p>
        Scene Hold comes on by itself when you change a setting of the scene. Select it again to follow the
        song again.
      </p>
      <Tip>
        The project keeps the Song Map of each song: its slices, moods, hits and scenes. Save the project
        to keep your changes.
      </Tip>

      <h2>Shortcuts</h2>
      <ShortcutList
        rows={[
          ["Space", "Play or pause the music"],
          ["Shift+Space", "Stop the music"],
          ["Ctrl+Click", "On a scene of the Scenes list: put that scene on the selected slice"],
          ["Delete", "Delete the selected slice"]
        ]}
      />
    </>
  );
}
