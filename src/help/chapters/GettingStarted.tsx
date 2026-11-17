import { Keys, MenuPath, Shot, Tip } from "../parts";

export function GettingStarted() {
  return (
    <>
      <h1>Getting started</h1>
      <p className="help-lead">
        Kaleido Sage is a visual effects playground. It turns any image or video into moving visuals that
        follow your music, and plays them full screen, on a projector, in a VR headset, or into a video file.
      </p>

      <h2>What Kaleido Sage does</h2>
      <p>
        Kaleido Sage starts with one picture: a photo, a video, or a pattern. A stack of <b>effects</b> then
        changes that picture. One effect mirrors it into the wedges of a kaleidoscope. Another bends it
        through a fractal, flies a camera over it, or draws lines of light on it. No effect is a finished
        look by itself. The look comes from the effects that you combine, and from their order.
      </p>
      <p>
        The second idea is <b>motion</b>. Each setting of each effect can stay at one value, or move
        between two values during the length of the scene. A setting can also follow the sound: the bass,
        the beat, or the level of the music that plays. With some settings in motion, a still photo becomes
        a picture that does not stop, and that answers each change in a song.
      </p>
      <p>
        The third idea is the <b>show</b>. A picture with its effects and its motion is a <b>scene</b>. A
        project holds many scenes, together with the songs that they are for. Kaleido Sage examines each
        song, and changes the scene as the song goes from one part to the next. A full set of music then
        plays as one show, with no work from you during the performance.
      </p>
      <p>
        Use Kaleido Sage to make visuals for a DJ set, a band or a party, to make music videos and
        looping clips, or only to play with mirrors, fractals and light.
      </p>

      <h2>Start a project</h2>
      <Shot name="start-screen" alt="The start screen with the New Project and Open Project buttons" />
      <p>
        Kaleido Sage opens on the start screen. <b>New Project</b> starts an untitled project with one
        blank scene. <b>Open Project</b> opens a project that you saved before. Both commands are also in
        the <b>File</b> menu.
      </p>
      <p>
        On your first new project, Kaleido Sage offers to show you around. If you accept, green
        pointers appear beside the controls, one at a time, at the moment each control becomes useful.
        To turn the pointers off or on later, use the <b>Help</b> menu.
      </p>

      <h2>The workspace</h2>
      <Shot name="window-new" alt="The Kaleido Sage window with a new project" side="block" />
      <p>
        A new project shows a checkerboard. It is a stand-in for your picture, and it makes the result of
        each effect easy to see. The window has these areas:
      </p>
      <ul>
        <li>
          The <b>picture</b> fills the right side. The tab above it is the scene. A project can have many
          scenes, each with its own tab.
        </li>
        <li>
          The <b>Scene</b> card, at the top left, holds the source of the picture. Slot <b>A</b> has the
          checkerboard. Slot <b>B</b> is for a second source, to mix with the first. <b>Length</b> sets how
          many seconds the scene's motion takes before it repeats.
        </li>
        <li>
          The <b>FX</b> card lists the effects of the scene. It is empty in a new scene.
        </li>
        <li>
          The <b>play controls</b>, at the bottom left, stop and pause the motion, and show the position in
          the scene. <b>Input</b> selects the sound that the scene listens to.
        </li>
      </ul>

      <h2>Make your first scene</h2>
      <p>
        These steps take a blank scene to a moving kaleidoscope that follows the sound.
      </p>

      <h3>1. Select a picture</h3>
      <Shot name="first-slot" alt="Slot A with the mouse over it, and its four buttons" />
      <p>
        Point at slot <b>A</b>. Four buttons appear at the bottom of the slot. From left to right,
        they load a random photo, search for a photo, use a test pattern, and open an image or video file
        from your computer.
      </p>
      <p>
        You can also drop a file on the window, or paste a copied image with <Keys k="Ctrl+V" />. For these
        steps, the checkerboard is sufficient.
      </p>

      <h3>2. Add an effect</h3>
      <Shot name="first-fx-menu" alt="The Add an effect menu with the mouse on Kaleidoscope" side="left" />
      <p>
        In the <b>FX</b> card, select <b>New</b>. The menu lists all effects. Point at a name to see a
        small picture of the effect and a note about its function. Select <b>Kaleidoscope</b>.
      </p>

      <h3>3. See it move</h3>
      <Shot name="first-pan" alt="The Pan X and Pan Y settings with their ranges, beside the moving picture" side="block" />
      <p>
        The picture starts to move immediately. This is because two sliders of the
        effect, <b>Pan X</b> and <b>Pan Y</b>, have ranges. A slider with a range has two handles, and
        its value goes from one handle to the other during the length of the scene. Thus the picture
        slides under the mirrors of the kaleidoscope, and the pattern changes all the time.
      </p>
      <p>
        Move a handle to change where the motion starts or stops. A wider range gives more motion.
      </p>

      <h3>4. Make more settings move</h3>
      <Shot name="first-range" alt="The mouse on the range button of the Twirl setting" side="block" />
      <p>
        Each slider has a bracket button at its right. Select it to give the slider a range, and
        select it again to go back to one value. Add a range to <b>Twirl</b>, and the picture also twists
        as it moves.
      </p>

      <h3>5. Try your luck</h3>
      <p>
        Press <Keys k="X" />, or select <Shot name="fx-random" alt="The Random all button" side="inline" /> in
        the <b>FX</b> card, to give new random settings to all effects. It is the fastest way to find a look
        that you did not plan. <Keys k="Ctrl+Z" /> brings the look before back.
      </p>

      <h3>6. Add sound</h3>
      <Shot name="first-input" alt="The mouse on the Input list of the play controls" />
      <p>
        In the play controls, open the <b>Input</b> list and select the source of the sound: the sound
        that your PC plays, a microphone, or a list of audio files. A speaker button then shows beside
        each setting. Select a speaker, and that setting moves with the sound.
      </p>

      <h3>7. Play it on the full screen</h3>
      <p>
        Press <Keys k="F" />, or double-click the picture. Press <Keys k="F" /> again to go back.
      </p>

      <h2>The help line</h2>
      <Shot name="help-line" alt="The help line shows the tip of the button under the mouse" side="block" />
      <p>
        The line at the bottom of the window tells you what each control does. Point at a button, a
        slider or the name of a setting, and the help line shows its function and its key. No tooltip
        appears over the picture, so help does not get in the way during a performance.
      </p>

      <h2>More help</h2>
      <p>
        <MenuPath path="Help > Kaleido Sage Help" />, or <Keys k="F1" />, opens this window. You can keep it
        open beside the app while you work. Select a picture in a chapter to see it at its full
        size. <MenuPath path="Help > Keyboard Shortcuts" />, or <Keys k="?" />, shows all keys and mouse
        actions on one sheet.
      </p>
      <Tip>
        To see the picture alone, press <Keys k="F" /> for full screen, or <Keys k="H" /> to hide the
        panels and keep the window.
      </Tip>
    </>
  );
}
