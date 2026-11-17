import { Keys, MenuPath, ShortcutList, Shot, Tip } from "../parts";

export function Audio() {
  return (
    <>
      <h1>Audio input and audio links</h1>
      <p className="help-lead">
        A scene can listen to sound, and its settings can move with that sound. First select the sound that
        the scene listens to. Then turn on the speaker button of each setting that must move.
      </p>

      <h2>Select the input</h2>
      <Shot name="audio-input-menu" alt="The Input list, open, with the mouse on the default output of the PC" />
      <p>
        The <b>Input</b> list is in the play controls, at the bottom of the left panel. It has four
        groups:
      </p>
      <ul>
        <li>
          <b>Nothing (do not listen)</b> turns the listening off. A new project starts with this selection.
        </li>
        <li>
          <b>PC (loopback)</b> listens to all the sound that one of your speakers or headphones plays: a
          music player, a browser, a game. The first entry is the default output of Windows. Kaleido Sage
          cannot listen to one program only.
        </li>
        <li>
          <b>Microphones and line inputs</b> listen to a microphone, or to an instrument or a mixer on a
          line input.
        </li>
        <li>
          <b>Files</b> plays your own audio files in Kaleido Sage. It opens the Playlist; see <i>The
          Playlist and the Scenes list</i>.
        </li>
      </ul>
      <p>
        Kaleido Sage keeps your selection for the next time you start it. A project also keeps its input,
        and sets it again when you open the project.
      </p>
      <Tip>
        While a microphone is the input, Windows shows its microphone icon in the taskbar. This is correct:
        Kaleido Sage listens, but it does not record or send the sound.
      </Tip>

      <h2>Show the audio buttons</h2>
      <Shot name="audio-show-buttons" alt="The speaker button of the FX card, on, and the speaker buttons of the settings" side="block" />
      <p>
        When you select an input, a small speaker button shows at the left of each setting of the open
        effect. The speaker button at the left of the <b>FX</b> title shows or hides all of them. Hide
        them when you do not use sound, to have a cleaner panel.
      </p>

      <h2>Link a setting to the sound</h2>
      <Shot name="audio-link-on" alt="The speaker button of Pan X, on, with the mouse on it" side="block" />
      <p>
        Select the speaker <Shot name="audio-link-icon" alt="A speaker button that is off" side="inline" /> of
        a setting. It turns blue <Shot name="audio-link-lit" alt="A speaker button that is on" side="inline" />,
        and the setting now moves with the sound. The speaker glows more when the sound pushes the setting
        more. Select the speaker again, or right-click it, to turn the link off.
      </p>
      <p>
        The range of the setting controls how far the sound moves it:
      </p>
      <ul>
        <li>
          <b>With a range</b>, the value stays at the start handle while there is no sound. The sound pushes
          it toward the end handle. Move the handles to set where the motion starts and how far it goes.
        </li>
        <li>
          <b>With no range</b>, the value starts where the slider is. The sound pushes it toward the end
          of the slider that has more room.
        </li>
      </ul>
      <p>
        A setting with a range and an audio link does not move by itself. It waits for the sound.
      </p>

      <h2>How each setting moves</h2>
      <p>
        You do not select which part of the sound moves a setting. Each setting moves in the way that suits
        it. Point at a speaker button, and the help line tells you which way that is:
      </p>
      <ul>
        <li><b>Brightness</b> follows the intensity of the music, with a pulse on each beat. Bloom and exposure settings move this way.</li>
        <li><b>Size</b> follows the intensity too, with a pulse on each beat. Zoom and size settings move this way.</li>
        <li><b>Detail</b> follows the intensity slowly. Twirl, warp, blur and the number of segments move this way.</li>
        <li><b>Sparkle</b> follows the high sounds of the music. Particle speed, rays and sharpen settings move this way.</li>
        <li><b>Beats</b> moves one step through the range on each beat. All other settings move this way.</li>
      </ul>

      <h2>Quiet sound and loud sound</h2>
      <p>
        Two values control how the sound is measured. <b>Master Threshold</b> is the level below which
        the sound moves nothing. Increase it when quiet parts or noise move the picture.
        Decrease it when only the loudest parts move the picture. <b>Master Gain</b> makes a weak
        input louder before Kaleido Sage measures it.
      </p>
      <p>
        Both sliders are in the Audio panel. For a playlist, the Master Threshold is also a line on the level
        display of the music controls.
      </p>

      <h2>The Audio panel</h2>
      <Shot name="audio-panel" alt="The Audio panel with the Source, Levels and Audio sensors areas" side="block" />
      <p>
        Press <Keys k="A" />, or select <MenuPath path="View > Show Audio Panel" />, to open the Audio panel
        at the bottom of the window.
      </p>
      <ul>
        <li><b>Source</b> has the <b>Master Gain</b> and <b>Master Threshold</b> sliders.</li>
        <li>
          <b>Levels</b> shows the sound now: the full level, then the <b>Bass</b>, <b>Mids</b> and <b>Highs</b>.
          The orange mark on each bar is the threshold. The <b>Beat</b> light flashes on each beat.
        </li>
        <li>
          <b>Audio sensors</b> lists the settings of the scene that have an audio link, each with a bar that
          shows how far the sound pushes it now. The <b>×</b> turns one link off. <b>Enable All</b> links every
          setting that has a range, and <b>Disable All</b> turns off every link of the scene.
        </li>
      </ul>

      <h2>Live sound and Song follow</h2>
      <p>
        With the sound of the PC, a microphone or a line input, Kaleido Sage measures the sound while it
        plays. With <b>Files</b> as the input, <b>Song follow</b> can examine each song before it plays.
        The linked settings then follow the plan of the song, which is more exact than live measurement.
        While Song follow is on, the two master sliders have no effect. See <i>Song follow and the Song
        Map</i>.
      </p>

      <h2>Shortcuts</h2>
      <ShortcutList
        rows={[
          ["A", "Show or hide the Audio panel"],
          ["Right-click", "On a speaker that is on: turn the link off"]
        ]}
      />
    </>
  );
}
