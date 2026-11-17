import { Keys, MenuPath, ShortcutList, Shot, Tip } from "../parts";

export function Playing() {
  return (
    <>
      <h1>Playing a show</h1>
      <p className="help-lead">
        A scene plays from the moment it opens. This chapter shows how to stop and start the motion, how
        Kaleido Sage goes from one scene to the next, and how to show only the picture, with no panels
        around it.
      </p>

      <h2>The play controls</h2>
      <Shot name="play-controls" alt="The play controls with the mouse on the Pause button" />
      <p>
        The play controls are at the bottom of the left panel, under the <b>FX</b> card. They control the
        motion of the scene: its ranges, and all that moves with time.
      </p>
      <p>
        <Shot name="play-pause" alt="The Pause button" side="inline" /> <b>Pause</b>, or <Keys k="Space" />,
        stops the motion where it is. The button then changes to <b>Play</b>, which continues from the same
        place.
      </p>
      <p>
        <Shot name="play-stop" alt="The Stop button" side="inline" /> <b>Stop</b>,
        or <Keys k="Shift+Space" />, also stops the motion, and then goes back to the start of the scene:
        each range goes to its start handle. A video export starts from this same place.
      </p>
      <p>
        The bar at the right shows the place in the scene's <b>Length</b>, and the time beside it shows the
        same in seconds. Drag the bar to move through the scene.
      </p>
      <Tip>
        When a scene follows a song, the song is in control of the picture. The bar is then off, and
        Space and Shift+Space control the music. See <i>Song follow and the Song Map</i>.
      </Tip>

      <h2>From one scene to the next</h2>
      <Shot name="scene-tabs" alt="Three scene tabs above the picture" side="block" />
      <p>
        To change the scene, select its tab, or its row in the <b>Scenes</b> list. Keys <Keys k="1" /> to <Keys k="9" /> select
        the scene with that number. <Keys k="Ctrl+Tab" /> goes to the next scene and <Keys k="Ctrl+Shift+Tab" /> to
        the scene before, and the last scene goes round to the first.
      </p>
      <p>
        While the scene plays, the change is a crossfade of 1.5 seconds, and the new scene starts from its
        beginning. While the scene is paused, the change is immediate.
      </p>
      <p>
        With <b>Files</b> as the audio input and more than one scene, Kaleido Sage changes the scene by
        itself while the music plays. At the end of a scene's <b>Length</b>, the next scene of the list
        fades in. A new track also brings the next scene. A scene that you select yourself stays for a
        minimum of half its Length.
      </p>

      <h2>Scene Hold and the countdown bar</h2>
      <Shot name="play-hold" alt="The countdown bar and the Scene Hold button above the play controls" />
      <p>
        When a project has more than one scene, a second row shows above the play controls. The bar at the
        left counts down the time to the next scene. It becomes yellow when 10 seconds remain, and red when
        5 seconds remain. The bar is gray when no change is due: the music does not play, or <b>Scene
        Hold</b> is on.
      </p>
      <p>
        <b>Scene Hold</b> keeps the scene that shows. The scene then plays again and again, and the music
        continues. Select <b>Scene Hold</b> again to let the show go on.
      </p>
      <p>
        Scene Hold also comes on by itself. When you open an effect, or change a setting with the mouse or
        the keyboard, Kaleido Sage holds the scene, so that it does not go away while you work on it. A
        MIDI knob does not turn Scene Hold on. A save of the project, a click on a different scene,
        or <b>Play</b> in the Playlist turns it off.
      </p>

      <h2>Full screen</h2>
      <Shot name="stage-buttons" alt="The buttons at the top right of the picture, with the mouse on Full screen" />
      <p>
        Move the mouse over the picture, and a small group of buttons shows at its top right. The last one
        is <b>Full screen</b>. You can also press <Keys k="F" /> or <Keys k="F11" />, double-click the
        picture, or select <MenuPath path="View > Full Screen" />.
      </p>
      <p>
        In full screen, the title bar, the menu bar, the tabs and the panels go away, and the picture
        fills the screen. All keys continue to work: the number keys change the scene, Space pauses,
        and <Keys k="X" /> gives new random settings.
      </p>
      <p>
        Two buttons show at the bottom right while the mouse moves. <b>Settings</b>, or <Keys k="H" />,
        brings the panels back over the picture, so that you can change the scene and stay in full
        screen. <b>Exit full screen</b>, or <Keys k="Esc" />, goes back to the window.
      </p>
      <p>
        The mouse pointer goes away after 2 seconds with no movement, and the buttons fade out with it.
      </p>
      <Tip>
        Esc does one thing each time, in this order: it plays the ranges that a MIDI knob stopped, then it
        leaves VR, then it leaves full screen.
      </Tip>

      <h2>Hide the panels</h2>
      <Shot name="view-menu" alt="The View menu with the mouse on Full Screen" side="left" />
      <p>
        <MenuPath path="View > Hide Panels" />, or <Keys k="H" />, removes the left panel, the bottom panel
        and the help line, and keeps the window with its title bar and its menus. The picture gets all of the
        room. Press <Keys k="H" /> again to bring the panels back.
      </p>
      <p>
        The <b>View</b> menu also opens and closes the <b>Audio</b> and <b>MIDI</b> panels at the bottom of
        the window, and it has the commands for VR and Cast. See <i>Cast and VR</i>.
      </p>

      <h2>The Performance panel</h2>
      <Shot name="performance" alt="The Performance panel over the picture" />
      <p>
        <MenuPath path="View > Show Performance" />, or <Keys k="P" />, shows how well your computer draws the
        scene. The large number is the frames for each second, with a grade: <b>Smooth</b> at 55 or
        more, <b>Fair</b> at 30 or more, and <b>Slow</b> below that. The chart shows the last 30 seconds.
      </p>
      <p>
        The tiles show the memory in use and the time that the processor and the graphics card need for
        one frame. <b>GPU time per step</b> has one bar for each step of the drawing, so you can see which
        effect costs the most. When the picture is slow, remove or decrease that effect, or decrease
        its counts and sizes.
      </p>
      <p>
        Press <Keys k="P" /> again to close the panel.
      </p>

      <h2>Shortcuts</h2>
      <ShortcutList
        rows={[
          ["Space", "Play or pause the scene"],
          ["Shift+Space", "Stop the scene: pause and go back to its start"],
          ["1", "to 9: select the scene with that number, with a crossfade"],
          ["Ctrl+Tab / Ctrl+Page Down", "Next scene"],
          ["Ctrl+Shift+Tab / Ctrl+Page Up", "Scene before"],
          ["F / F11", "Full screen"],
          ["Esc", "Leave full screen, or play the ranges that MIDI stopped"],
          ["H", "Hide or show the panels"],
          ["P", "Performance panel"],
          ["X", "Random all: new settings for every unlocked effect"]
        ]}
      />
    </>
  );
}
