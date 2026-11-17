import { Keys, MenuPath, ShortcutList, Shot, Tip } from "../parts";

export function Midi() {
  return (
    <>
      <h1>MIDI controllers</h1>
      <p className="help-lead">
        The knobs and faders of a MIDI controller can move any slider of a scene. One control can move
        several settings at the same time, and one setting can have several controls. With a controller,
        you play the picture with your hands.
      </p>

      <h2>The MIDI panel</h2>
      <Shot name="midi-panel" alt="The MIDI tab of the bottom panel, with devices and mappings" side="block" />
      <p>
        Press <Keys k="M" />, or select <MenuPath path="View > Show MIDI Panel" />, to open the bottom panel
        at its <b>MIDI</b> tab. Press <Keys k="M" /> again to close it.
      </p>
      <p>
        <b>Connected devices</b>, at the left, lists your controllers. A controller shows here as soon as
        you connect it, and a green dot shows that it is connected. Controllers that have mappings are first
        in the list, with the number of their mappings.
      </p>
      <p>
        The list at the right has one row for each mapping, in a group for each device. A row shows the
        control, then the setting that it moves. The icon at the left of a row lights when the control
        sends a message, so you can find a knob in the list: turn it, and look for the light.
      </p>

      <h2>Map a control with Learn</h2>
      <Shot name="midi-learn" alt="The Learn button of the MIDI panel" side="block" />
      <ol>
        <li>Select <b>Learn</b>. The button changes to <b>Learning</b>.</li>
        <li>Move a knob or a fader that has no mapping. A new row shows in the list, with <b>Pick a setting</b>.</li>
        <li>
          A dialog opens, with the effects at the left and the settings of the selected effect at the
          right. Select the effect, then the setting.
        </li>
      </ol>
      <p>
        Learn stays on, so you can map the next control immediately. Select <b>Learning</b>, or
        press <Keys k="Esc" />, to stop. A control that already has a mapping works as usual while Learn is on.
      </p>
      <p>
        If the setting already has a control, Kaleido Sage asks what to do. <b>Replace</b> removes the
        other control. <b>Add</b> keeps both, so that the two controls move the same setting.
      </p>

      <h2>Map a control from a setting</h2>
      <Shot name="midi-show-buttons" alt="The Show MIDI buttons button at the left of the FX title" />
      <p>
        You can also start from the setting. When a controller is connected, a MIDI button shows at the
        left of the <b>FX</b> title. Select it to show a MIDI button beside each setting.
      </p>
      <Shot name="midi-assign" alt="The MIDI button beside the Twirl setting, with the mouse on it" side="block" />
      <p>
        Select the MIDI button of a setting, then move a knob or a fader. That control now moves the
        setting, and the button stays orange. Select the button again to add one more control. Right-click
        the button to remove all controls from the setting.
      </p>
      <p>
        The <b>Length</b> of the scene is the only slider that cannot have a control.
      </p>

      <h2>Change or remove a mapping</h2>
      <p>
        In the MIDI panel, select the setting in a row to give the control a different setting. The
        <b> ×</b> at the right end of a row removes that mapping. <b>Clear all</b> removes all mappings of all
        controllers, after a question.
      </p>
      <p>
        To remove all mappings of one effect, right-click the header of the effect in the FX list, and
        select <b>Remove MIDI mappings</b>.
      </p>

      <h2>How a control moves a setting</h2>
      <p>
        A slider with one value follows the knob. The first movement of the knob only takes the value
        where it is, so the value does not jump. After that, the travel of the knob covers the remaining
        travel of the slider.
      </p>
      <p>
        A slider with a range moves by itself between its two handles. When you turn its knob, the range
        stops, and the knob holds the value at a place between the handles. An orange play button then
        shows on the row, and one more shows beside the FX title. Select the play button of the row to let
        that range move again. Select the one beside the FX title, or press <Keys k="Esc" />, to let all
        stopped ranges move again.
      </p>
      <p>
        Hold <Keys k="Ctrl" /> while you turn the knob of a range, and the value can go past a handle. The
        handle moves with it, so the range grows.
      </p>
      <Tip>
        Kaleido Sage reads knobs and faders: MIDI Control Change messages. Keys, pads and buttons that send
        notes do nothing. Knobs that turn with no end, and 14-bit controls, are found automatically and
        show the tags <b>relative</b> and <b>14-bit</b> in the list.
      </Tip>

      <h2>Common settings</h2>
      <p>
        Many effects have a <b>Common</b> section at their end, with settings such as <b>Pan
        X</b>, <b>Zoom</b>, <b>Rotation</b> and <b>Opacity</b>. A control that you map to a Common setting
        moves that setting in each effect that has it. Thus one knob for Zoom works in every scene, with
        any effect.
      </p>

      <h2>Where mappings are kept</h2>
      <p>
        Mappings belong to the app on this computer, not to a project. They are kept for each controller
        by its name, and they work in all projects. Undo counts a full turn of a knob as one step.
      </p>

      <h2>Shortcuts</h2>
      <ShortcutList
        rows={[
          ["M", "Open or close the MIDI panel"],
          ["Esc", "Stop Learn, or stop waiting for a control; with neither, play the ranges that MIDI stopped"],
          ["Ctrl", "+ turn a knob on a range: move past a handle; the handle moves with it"]
        ]}
      />
    </>
  );
}
