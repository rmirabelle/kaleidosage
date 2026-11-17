import { Keys, Shot, Tip } from "../parts";

export function MovingSettings() {
  return (
    <>
      <h1>Settings that move</h1>
      <p className="help-lead">
        Each slider of an effect can hold one value, or move between two values by itself. A slider
        that moves has a range. Ranges are what make a scene play: they change the picture all the time,
        with no work from you.
      </p>

      <h2>A setting with one value</h2>
      <Shot name="row-single" alt="The Tile size setting of the Kaleidoscope: its name, its value and its slider" side="block" />
      <p>
        Each setting shows its name, its value at the right, and its slider. Drag the handle of the
        slider, or select a place on the slider, to change the value. The picture changes at once.
      </p>
      <ul>
        <li>Double-click the <b>name</b> to set the value back to its default.</li>
        <li>
          A small mark above some sliders shows the point of no effect, usually zero. The handle stops
          at this mark when it comes near, so the point is easy to find.
        </li>
        <li>
          Some sliders have more marks, for example at each whole number or at each 45 degrees. The
          handle stops at these marks too.
        </li>
      </ul>
      <Shot name="row-bypass" alt="Ctrl held on the name Tile size: the name is struck through" side="block" />
      <p>
        To see what one setting does, hold <Keys k="Ctrl" /> and press its name. While you hold the mouse
        button, the setting has no effect, and its name is struck through. Release the button to get
        the setting back.
      </p>

      <h2>Give a setting a range</h2>
      <Shot name="row-range-on" alt="The mouse on the range button of Twirl, which now has two handles" side="block" />
      <p>
        Select <Shot name="row-icon-range" alt="The range button, off" side="inline" /> at the right of a
        slider. The button becomes blue, and the slider gets two handles: <b>[</b> is the start of the
        range, and <b>]</b> is the end. The value now moves from the start handle to the end handle, and
        then back. The thin line between the handles shows where the value is at this moment, and the
        number at the right shows the same value.
      </p>
      <p>
        Select <Shot name="row-icon-range-on" alt="The range button, on" side="inline" /> again to go back to
        one value.
      </p>
      <Shot name="row-range-grab" alt="The mouse between the two handles of the Twirl range" side="block" />
      <p>
        To change the range:
      </p>
      <ul>
        <li>Drag a handle to move the start or the end.</li>
        <li>Drag the bar between the handles to move the full range and keep its width.</li>
        <li>
          Hold <Keys k="Ctrl" /> and drag a handle to move the other handle the same distance in the
          opposite direction, on the other side of the zero point.
        </li>
        <li>Double-click the name to make the range as wide as the slider.</li>
      </ul>
      <Tip>
        A narrow range gives a small, quiet motion. A wide range gives a large motion. For most
        settings, a narrow range around a value that looks good is the best start.
      </Tip>

      <h2>How long a range takes</h2>
      <Shot name="row-length" alt="The Length slider of the Scene card" side="left" />
      <p>
        The <b>Length</b> of the scene, in the Scene card, sets the time of all ranges. A value takes one
        Length to go from its start handle to its end handle, and one more Length to come back. With a
        Length of 20 seconds, each range goes out and back in 40 seconds.
      </p>
      <p>
        All ranges follow the same Length, so they stay in step. After each full trip, the scene is
        back at its start, and the motion repeats with no jump.
      </p>

      <h2>Reverse a range</h2>
      <Shot name="row-reverse" alt="The mouse on the Reverse button of Twirl: the handles changed places" side="block" />
      <p>
        Three more buttons show at the right of a slider that has a
        range. <Shot name="row-icon-reverse" alt="The Reverse button" side="inline" /> exchanges the two
        handles, so the value starts at the right and moves to the left. A reversed range is purple.
      </p>
      <p>
        Use Reverse to make two settings move against each other: while one value goes up, the other
        goes down.
      </p>

      <h2>Easing: how the value moves</h2>
      <Shot name="row-ease-menu" alt="The Easing menu with the mouse on Bounce" />
      <p>
        <Shot name="row-icon-ease" alt="The Easing button" side="inline" /> opens the <b>Easing</b> menu.
        Easing sets how the speed of the value changes between the handles. The small curve beside each
        name shows the motion.
      </p>
      <ul>
        <li><b>Smooth</b>: slow at the two handles, faster between them. It is the usual easing.</li>
        <li><b>Linear</b>: the same speed all the way.</li>
        <li><b>Ease in-out</b>: as Smooth, with longer stops at the handles.</li>
        <li><b>Ease in</b>: slow at the start. <b>Ease out</b>: slow at the end.</li>
        <li><b>Bounce</b>: falls faster and faster to the end handle, then bounces off it two times.</li>
        <li><b>Explode</b>: jumps to the end handle, then falls back slowly.</li>
        <li><b>Implode</b>: builds slowly to the end handle, then snaps back.</li>
        <li><b>Early</b>: moves in the first half of the time, then waits. <b>Late</b>: waits, then moves.</li>
        <li><b>Random</b>: a fast, irregular wave that does not repeat.</li>
        <li><b>Drunk</b>: an irregular wave with one tall swing, then one short swing.</li>
      </ul>

      <h2>Give a range its own time</h2>
      <Shot name="row-own-time" alt="The mouse on the Own time button of Twirl, with the Loop slider below" side="block" />
      <p>
        <Shot name="row-icon-own-time" alt="The Own time button" side="inline" /> takes a range out of the
        scene's Length. A green <b>Loop</b> slider appears below the setting. It sets the time, from 1 to
        60 seconds, that this range takes from its start handle to its end handle.
      </p>
      <p>
        Use an own time for a setting that must move faster or slower than the others, for example a
        quick pulse in a slow scene. Select the button again to follow the Length again.
      </p>
      <Tip>
        Ranges with different times do not come back to the start together. The scene then changes for
        a long time before it repeats, which is good for a live show. For a video that must repeat with
        no jump, keep all ranges on the scene's Length.
      </Tip>

      <h2>Settings that move with sound or MIDI</h2>
      <p>
        A range is one of three ways to move a setting. The sound can also move it, and so can a knob or
        a fader of a MIDI controller. See <i>Audio input and audio links</i> and <i>MIDI controllers</i>.
      </p>

      <h2>Mouse actions</h2>
      <ul>
        <li>Double-click a name: set the value, or the full range, back to its default.</li>
        <li><Keys k="Ctrl" /> + hold a name: no effect from that setting while you hold.</li>
        <li>Drag between the range handles: move the full range.</li>
        <li><Keys k="Ctrl" /> + drag a range handle: move the other handle as its mirror image.</li>
      </ul>
    </>
  );
}
