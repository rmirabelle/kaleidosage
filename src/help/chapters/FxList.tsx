import { Keys, ShortcutList, Shot, Tip } from "../parts";

export function FxList() {
  return (
    <>
      <h1>The FX list</h1>
      <p className="help-lead">
        The FX card lists the effects of the scene. The picture goes through the effects from the top
        of the list to the bottom, and each effect works on the result of the effect before it.
      </p>

      <h2>Add an effect</h2>
      <Shot name="fx-empty" alt="The empty FX card of a new scene" />
      <p>
        A new scene has no effects, so the picture is the source picture, with no
        change. Select <Shot name="fx-icon-new" alt="The New button" side="inline" /> in the title bar of
        the card to open the list of effects.
      </p>
      <Shot name="fx-add-menu" alt="The Add an effect menu with the mouse on Bloom" side="block" />
      <p>
        The menu lists the 28 effects in alphabetical order. Point at a name to see a small picture of the
        effect and one line about its function. When an effect has more than one type, the small picture
        shows each type in turn, and a tag gives the number of types.
      </p>
      <p>
        Select a name to add the effect at the end of the list. The effect opens, and it starts with
        settings that show in the picture immediately. Each effect can be in the list one time only: an
        effect that is in the list shows <b>Added</b> in the menu.
      </p>

      <h2>The order of the effects</h2>
      <Shot name="fx-list" alt="The FX list with three effects: Kaleidoscope, Warp and Bloom" />
      <p>
        The order of the list is the order in which the picture is made. In this list,
        the <b>Kaleidoscope</b> mirrors the source picture, then <b>Warp</b> bends the mirrored picture,
        then <b>Bloom</b> adds a glow to the result.
      </p>
      <p>
        A different order gives a different picture. With <b>Warp</b> above <b>Kaleidoscope</b>, the picture
        is bent first, and the mirrors then repeat the bent picture, so the bends stay symmetrical.
      </p>
      <p>
        To move an effect, drag <Shot name="fx-icon-grip" alt="The grip of an effect" side="inline" /> at
        the right of its header up or down. The picture changes while you drag.
      </p>

      <h2>Open an effect</h2>
      <Shot name="fx-open-effect" alt="The Kaleidoscope effect open, with its Type list and its first sliders" side="block" />
      <p>
        Select the name of an effect to open it and see its settings. Only one effect is open at a time,
        so the list stays short. Select the name again to close the effect.
      </p>
      <p>
        Many effects start with a <b>Type</b> list, which changes the effect a lot. The Kaleidoscope, for
        example, can mirror the picture into wedges around a center, or into tiles of triangles, squares
        or hexagons. The sliders below the list change with the type. See <i>Settings that move</i> for
        the parts of a slider.
      </p>

      <h2>The header of an effect</h2>
      <Shot name="fx-group-header" alt="The header of the Warp effect with the mouse on its dice" side="block" />
      <p>
        Each header has three buttons at its right:
      </p>
      <ul>
        <li>
          <Shot name="fx-icon-dice" alt="The dice of an effect" side="inline" /> gives new random settings to
          this effect only.
        </li>
        <li>
          <Shot name="fx-icon-remove" alt="The remove button of an effect" side="inline" /> removes the effect
          from the list.
        </li>
        <li>
          <Shot name="fx-icon-grip" alt="The grip of an effect" side="inline" /> moves the effect in the list
          when you drag it.
        </li>
      </ul>

      <h2>Compare with and without an effect</h2>
      <Shot name="fx-bypass" alt="Ctrl held on the Kaleidoscope header: its name is dim" />
      <p>
        Hold <Keys k="Ctrl" /> and press the header of an effect. While you hold the mouse button, the
        picture shows without that effect. Release the button to get the effect back. Thus you can see
        exactly what one effect adds.
      </p>
      <p>
        Hold <Keys k="Ctrl+Shift" /> and press the header to see the opposite: only that effect, with all
        other effects off. The header shows <b>Solo</b> while you hold.
      </p>

      <h2>Disable and lock</h2>
      <Shot name="fx-group-menu" alt="The right-click menu of an effect header with the mouse on Lock" side="block" />
      <p>
        Right-click a header for more commands.
      </p>
      <ul>
        <li><b>Disable</b> turns the effect off and keeps it in the list. <b>Enable</b> turns it on again.</li>
        <li>
          <b>Lock (no random)</b> protects the effect from <b>Random all</b>, <b>Nudge all</b> and <b>Clear
          all</b>. Use it when one effect is correct and you want to try new settings for the others.
        </li>
        <li><b>Remove MIDI mappings</b> removes the MIDI controls from all settings of the effect.</li>
      </ul>
      <Shot name="fx-group-locked" alt="A locked effect: a red lock shows beside its name" side="block" />
      <p>
        A locked effect shows a red lock beside its name, and its dice does not show. Right-click the
        header and select <b>Unlock</b> to remove the lock.
      </p>

      <h2>Random, nudge and clear</h2>
      <Shot name="fx-title-buttons" alt="The buttons of the FX title bar with the mouse on Nudge all" side="block" />
      <p>
        The three buttons after <b>All</b> in the title bar change all effects that are not locked:
      </p>
      <ul>
        <li>
          <Shot name="fx-random" alt="The Random all button" side="inline" /> <b>Random all</b> gives new
          random settings to each effect. The key is <Keys k="X" />.
        </li>
        <li>
          <Shot name="fx-icon-nudge" alt="The Nudge all button" side="inline" /> <b>Nudge all</b> moves each
          value a small distance, up or down at random. Values at 0 stay at 0. Use it to get variations
          of a look that is almost correct.
        </li>
        <li>
          <Shot name="fx-icon-clear" alt="The Clear all button" side="inline" /> <b>Clear all</b> removes all
          effects from the list, after a question.
        </li>
      </ul>
      <Tip>
        <Keys k="Ctrl+Z" /> takes back a random result, a nudge or a clear, so you can try these buttons
        freely.
      </Tip>
      <p>
        <Shot name="fx-icon-audio" alt="The Show audio buttons button" side="inline" /> at the left of the
        title bar shows or hides the audio buttons of the settings. See <i>Audio input and audio
        links</i>.
      </p>

      <h2>Common settings and Blend</h2>
      <Shot name="fx-common-blend" alt="The Common section of the Kaleidoscope with its Blend list open" />
      <p>
        Many effects end with a section named <b>Common</b>. It holds the settings that these effects
        share: the moves (<b>Pan X</b>, <b>Pan Y</b>, <b>Zoom</b> and <b>Rotation</b>), then <b>Blend</b>,
        then <b>Opacity</b>.
      </p>
      <p>
        <b>Opacity</b> sets how much of the effect shows. At 1, you see the full result of the effect. At
        0, the picture is as it was before the effect. <b>Blend</b> sets how the result mixes with the
        picture before the effect. <b>Normal</b> puts the result over it. The other modes, such
        as <b>Screen</b>, <b>Multiply</b> and <b>Difference</b>, mix the two as layers do in a photo
        editor.
      </p>

      <h2>Shortcuts</h2>
      <ShortcutList
        rows={[
          ["X", "Random all: new settings for every unlocked effect"],
          ["Ctrl+Z", "Undo"],
          ["Ctrl+Y / Ctrl+Shift+Z", "Redo"]
        ]}
      />
      <h2>Mouse actions on a header</h2>
      <ul>
        <li><Keys k="Ctrl" /> + hold: no effect from that effect while you hold.</li>
        <li><Keys k="Ctrl+Shift" /> + hold: only that effect while you hold.</li>
        <li>Right-click: disable or enable, lock or unlock, or remove the MIDI mappings.</li>
      </ul>
    </>
  );
}
