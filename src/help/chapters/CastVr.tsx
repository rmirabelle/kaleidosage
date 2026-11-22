import { Keys, MenuPath, Shot, Tip } from "../parts";

export function CastVr() {
  return (
    <>
      <h1>Cast and VR</h1>
      <p className="help-lead">
        Kaleido Sage can show the picture in three more places while you work in the window: on a second
        screen or a projector, on the screen of another PC on your network, and on a large screen in a VR
        headset.
      </p>

      <h2>Cast to a second screen</h2>
      <Shot name="cast-button" alt="The buttons at the top right of the picture, with the mouse on Cast" />
      <p>
        Cast shows the picture, full screen, on a screen that the app window is not on: a second monitor,
        a projector, or a television. You continue to work in the window on your own screen, with all
        panels, and the audience sees only the picture.
      </p>
      <p>
        To start, connect the second screen. Then do one of these steps:
      </p>
      <ul>
        <li>Press <Keys k="C" />.</li>
        <li>
          Move the mouse over the picture and
          select <Shot name="cast-icon" alt="The Cast button" side="inline" /> <b>Cast</b> at its top right.
          The button is there only while a second screen is connected.
        </li>
        <li>
          Select <b>Cast to</b> and the name of the screen in the <b>View</b> menu. With only one place
          to cast to, <Keys k="C" /> and the button go there directly.
        </li>
      </ul>
      <Shot name="cast-menu" alt="The View menu with the mouse on Cast" side="left" />
      <p>
        The picture opens on the other screen in its own window, the Show window. This window has no
        border and no mouse pointer, it stays above all other windows on that screen, and the keyboard
        stays with the main window. Thus your keys and your MIDI controller continue to work as before.
      </p>
      <p>
        While the cast is on, the picture in the main window is a preview of the show, in the shape of
        the other screen. You can make the main window smaller, or minimize it. The show continues.
      </p>

      <h3>More than one place to cast to</h3>
      <p>
        The <b>View</b> menu has one <b>Cast to</b> command for each other screen, with the name and the
        size of the screen, and one for each receiver on your network (see <i>Cast to another PC</i>,
        below). Kaleido Sage keeps the place that you select: <Keys k="C" /> and the <b>Cast</b> button
        use it the next time.
      </p>

      <h3>Stop the cast</h3>
      <p>
        Press <Keys k="C" /> again, select <b>Stop Cast</b> at the top right of the picture, or
        select <MenuPath path="View > Stop Cast" />. The cast also stops if the Show window
        closes, for example when the other screen is disconnected.
      </p>
      <Tip>
        If Cast cannot start, Kaleido Sage tells you why. With only one screen and no receiver, connect a
        second screen first, or make another PC a receiver. If the app is on the screen that you selected,
        move the app window to the other screen.
      </Tip>

      <h2>Cast to another PC</h2>
      <Shot name="cast-network-menu" alt="The View menu with the mouse on the Cast to command of a receiver on the network" />
      <p>
        The other screen can be in a different room. Kaleido Sage on a second PC, the receiver, shows
        the picture and plays the music that your PC sends to it through your network. A small PC that
        stays connected to a projector or a television is a good receiver. You need no other program,
        and there is nothing to set up on the network.
      </p>

      <h3>Make a PC a receiver</h3>
      <Shot name="receiver-menu" alt="The View menu with the mouse on Use This PC as a Receiver" side="left" />
      <p>
        Do these steps one time, on the PC at the projector or the television:
      </p>
      <ol>
        <li>Install Kaleido Sage on that PC, and open it.</li>
        <li>Select <MenuPath path="View > Use This PC as a Receiver" />, then <b>Make This PC a Receiver</b>.</li>
        <li>
          Windows asks one time if Kaleido Sage can use the network. Select <b>Allow</b>. Without this,
          your other PC cannot find the receiver.
        </li>
      </ol>
      <p>
        Kaleido Sage then closes and opens again as the receiver: a black screen that shows the name of
        the PC and that it is ready for a cast. From now on, the receiver starts each time Windows
        starts, and it keeps the screen on. Thus you only turn the PC on.
      </p>

      <h3>Cast to the receiver</h3>
      <p>
        On your own PC, the receiver shows in the <b>View</b> menu a moment after it starts,
        as <b>Cast to</b> with the name of the receiver PC and <b>(network)</b>. Select that
        command. <Keys k="C" /> and the <b>Cast</b> button also start the cast, as for a second screen.
      </p>
      <ul>
        <li>
          The picture has the shape of the receiver's screen. The picture in the main window is a
          preview of the show. You can make the main window smaller, or minimize it. The show
          continues.
        </li>
        <li>
          The music of the Playlist plays on the receiver, in time with the picture, and is silent on
          your own PC while the cast is on. The other sounds of your PC stay on your PC.
        </li>
        <li>
          The receiver shows each picture about a quarter of a second after your PC makes it. For a
          show that plays, you do not see this. When you turn a knob, the picture on the receiver
          follows that much later.
        </li>
      </ul>
      <p>
        To stop, press <Keys k="C" /> again or select <MenuPath path="View > Stop Cast" />. The music then
        plays on your own PC again.
      </p>
      <Tip>
        A cast to another PC needs both PCs on the same network. The two PCs must have the same version
        of Kaleido Sage; if they do not, Kaleido Sage tells you to update both. Your PC makes the video
        with its graphics chip (NVIDIA, AMD or Intel). A PC with no such chip uses its processor, which
        leaves less power for the picture.
      </Tip>

      <h3>Use the receiver PC as before</h3>
      <p>
        On the receiver, press <Keys k="Esc" />, or click the screen. The options show:
      </p>
      <ul>
        <li><b>Back to the Receiver</b>: closes the options.</li>
        <li><b>Close the Receiver</b>: closes Kaleido Sage. The receiver starts again with Windows.</li>
        <li>
          <b>Use This PC as Before</b>: opens Kaleido Sage as the normal app. The receiver does not start
          with Windows after this.
        </li>
      </ul>

      <h2>See the picture in VR</h2>
      <Shot name="vr-menu" alt="The View menu with the mouse on Enter VR" />
      <p>
        In a VR headset, the picture shows live on a very large screen, and it follows
        your music and your controls as it does in the window. Kaleido Sage uses a Meta Quest headset
        through the Meta Quest Link app.
      </p>

      <h3>Set up the headset</h3>
      <ol>
        <li>Install the Meta Quest Link app on your PC and sign in.</li>
        <li>
          In that app, go to <b>Settings</b>, then <b>General</b>, and set Meta Quest Link as the active
          OpenXR runtime.
        </li>
        <li>Connect the headset with a USB 3 cable, or with Air Link.</li>
        <li>In the headset, open <b>Quick Settings</b>, then <b>Quest Link</b>, and select <b>Launch</b>.</li>
      </ol>

      <h3>Enter and exit VR</h3>
      <p>
        Select <MenuPath path="View > Enter VR" />. After VR has worked one time on this PC, a <b>VR</b> button
        also shows at the top right of the picture. If no headset is ready, Kaleido Sage tells you to start
        Quest Link in the headset and to try again.
      </p>
      <p>
        To exit, press <Keys k="Esc" />, select <MenuPath path="View > Exit VR" />, or use the menu of the
        headset.
      </p>

      <h3>The VR screen</h3>
      <p>
        While VR is on, the <b>VR screen</b> card shows at the bottom left of the picture in the window.
        It sets the screen that you see in the headset:
      </p>
      <ul>
        <li><b>Shape</b>: 16:9, 21:9, 4:3 or 1:1.</li>
        <li><b>Width</b>: the width of the screen, from 0.5 to 30 meters.</li>
        <li><b>Distance</b>: how far the screen is from you, from 0.5 to 30 meters.</li>
        <li><b>Curve</b>: from a flat screen at 0% to a screen that bends around you at 100%.</li>
        <li><b>Reset</b>: a flat 16:9 screen, 4 meters wide, at a distance of 3 meters.</li>
      </ul>
      <p>
        You can also change the screen from the headset, with the controllers:
      </p>
      <ul>
        <li>Right stick forward or back: move the screen away or near.</li>
        <li>Right stick right or left: make the screen wider or narrower.</li>
        <li>Left stick: more or less curve.</li>
        <li><b>A</b>: the next screen shape.</li>
        <li><b>B</b>: reset the screen.</li>
        <li>Hold the Meta button: bring the screen in front of you.</li>
      </ul>
      <Tip>
        Cast and VR do not operate at the same time. While a cast is on, <b>Enter VR</b> is off, and while VR
        is on, <b>Cast</b> is off. This is also true for a cast to another PC. For a video that goes all around the viewer in a headset, with no PC,
        see the 360° size in <i>Save PNG and Export Video</i>.
      </Tip>
    </>
  );
}
