import { Shot, Tip } from "../parts";

export function EffectsTexture() {
  return (
    <>
      <h1>Effects for time, texture and color</h1>
      <p className="help-lead">
        These twelve effects do not move the picture to a new place. They mix it with its own past, change
        its surface, lay a second picture over it, or change its colors.
      </p>
      <p>
        Most of them work best after an effect that shapes space, lower in the <b>FX</b> list. <i>The FX
        list</i> and <i>Settings that move</i> describe the parts that all effects share.
      </p>

      <h2>Trails</h2>
      <Shot name="fx-trails" alt="The Trails effect after a Kaleidoscope, with soft tails behind the moving shapes" side="block" />
      <p>
        Trails keeps the earlier frames of the picture and lets them fade, so each part that moves has a
        tail. A picture that does not move shows no trails: in the picture above, a Kaleidoscope before
        the Trails gives the motion.
      </p>
      <p>
        The <b>Type</b> menu has <b>Mix (smoky)</b>, which blends the old frames into the new one,
        and <b>Lighten (glowing)</b>, which keeps the brightest parts, as light does on a
        long photo exposure. <b>Trail length</b> sets how long the old frames
        stay. <b>Zoom</b> and <b>Trail turn</b> make the old frames grow and turn, so the tails go out in
        spirals. <b>Trail hue</b> changes the color of the tails with their age,
        and <b>Trail tint</b> colors them with the <b>Trail color</b> swatch.
      </p>

      <h2>Time smear</h2>
      <Shot name="fx-smear" alt="The Time smear effect with the Rings pattern after a Kaleidoscope" side="block" />
      <p>
        Time smear shows different parts of the picture at different moments. Some parts show the
        present, and other parts show the picture of up to <b>Delay</b> seconds before. As with Trails,
        only a picture that moves shows the effect.
      </p>
      <p>
        The menu at the top selects the pattern of the delay: <b>Linear</b> (from one side to the
        other), <b>Rings</b> (from the center out), <b>Sweep</b> (around the center, as the hand of a
        clock), <b>Brightness</b> (bright parts are later than dark parts), or <b>Noise</b> (irregular
        areas). <b>Bands</b> repeats the pattern. <b>Restart</b> makes the picture sharp again
        after that number of seconds, and <b>Fade</b> makes that change gradual.
      </p>

      <h2>Blur</h2>
      <Shot name="fx-blur" alt="The Blur effect with a sharp circle in the center" side="block" />
      <p>
        Blur makes the picture soft, but only where its mask lets it. The menu at the top selects the
        mask:
      </p>
      <ul>
        <li><b>Circle, sharp center</b> and <b>Circle, blurred center</b> use a circle that you place with <b>Mask X</b>, <b>Mask Y</b> and <b>Mask size</b>.</li>
        <li><b>Gradient</b> goes from sharp to blurred across the picture, in the direction of <b>Mask angle</b>.</li>
        <li><b>Bright areas</b> and <b>Dark areas</b> blur by the brightness of the picture, above or below <b>Level</b>.</li>
        <li><b>Noise</b> blurs irregular areas.</li>
      </ul>
      <p>
        <b>Blur</b> sets the strength in pixels, and <b>Softness</b> sets how gradually the mask goes
        from sharp to blurred.
      </p>

      <h2>Sharpen</h2>
      <Shot name="fx-sharpen" alt="The Sharpen effect on a picture of thin lines" side="block" />
      <p>
        Sharpen makes edges and fine detail more clear. <b>Sharpen</b> sets the strength,
        and <b>Sharpen radius</b> sets the size of the detail that it makes stronger. A new Sharpen effect
        starts at zero, so the picture does not change until you move <b>Sharpen</b>.
      </p>

      <h2>Contours</h2>
      <Shot name="fx-contours" alt="The Contours effect with black lines on a picture of color clouds" side="block" />
      <p>
        Contours draws lines where the picture has the same brightness, as the height lines on a
        map. <b>Density</b> sets the number of brightness levels, and thus the number of
        lines. <b>Line width</b> sets their width. <b>Resolution</b> sets how much fine detail the lines
        follow, and <b>Smooth</b> makes the lines glide when the picture moves.
      </p>
      <Shot name="fx-contours-chips" alt="The black and white chips of the Color setting, with the mouse on the white chip" />
      <p>
        <b>Color</b> sets the color of the lines. The two chips at its left make the lines black or
        white, and the slider is then dim. Select the slider to use a color again. A new Contours effect
        has black lines.
      </p>

      <h2>Relief</h2>
      <Shot name="fx-relief" alt="The Relief effect, which gives the shapes raised edges" side="block" />
      <p>
        Relief makes the picture look as a raised surface with light on it. The bright parts are high
        and the dark parts are low. <b>Relief</b> sets the strength, <b>Relief depth</b> the
        height, and <b>Relief size</b> the width of the edges. <b>Light angle</b> sets the direction of the
        light, and <b>Shine</b> adds bright reflections.
      </p>

      <h2>Pixel sort</h2>
      <Shot name="fx-sort" alt="The Pixel sort effect with vertical streaks of color" side="block" />
      <p>
        Pixel sort puts the pixels along each line in order of brightness, which pulls the picture into
        streaks. Only the pixels with a brightness between <b>Low</b> and <b>High</b> are
        sorted. <b>Angle</b> sets the direction of the streaks, <b>Length</b> their maximum length,
        and <b>Thickness</b> their width. The <b>Order</b> menu puts the dark or the bright pixels first.
      </p>

      <h2>Driver</h2>
      <Shot name="fx-driver" alt="The Driver effect with the Caustics pattern, which bends the checkerboard" side="block" />
      <p>
        Driver uses a moving pattern to change the picture. The <b>Driver</b> menu selects the
        pattern: <b>Caustics</b> (light in water), <b>Smoke</b>, <b>Ink</b>, <b>Fire</b>, <b>Ripples</b>,
        or <b>Video</b>, which uses the brightness of a video file that you select.
      </p>
      <p>
        The <b>Mode</b> menu selects what the pattern does. <b>Bend</b> pushes the picture where the
        pattern is bright. <b>Reveal</b> shows the picture only there. <b>Light</b> makes the picture
        brighter there. <b>Strength</b>, <b>Size</b>, <b>Speed</b> and <b>Contrast</b> change the pattern.
      </p>

      <h2>Image or Video</h2>
      <Shot name="fx-picture" alt="The Image or Video effect with no file selected yet" side="block" />
      <p>
        Image or Video lays a file of its own over the picture: a logo, a photo, or a video. A PNG image
        keeps its transparent areas. When you add the effect, the Open dialog appears, so you can
        select the file. The <b>Media</b> row shows its name. <b>Choose</b> selects a different file.
      </p>
      <p>
        <b>Size</b>, <b>X</b>, <b>Y</b> and <b>Turn</b> place the file on the picture. The <b>Blend</b> menu
        has <b>Normal</b>, <b>Screen</b> and <b>Add</b>; with Screen and Add, the black areas of the file
        do not show. <b>Black key</b> also makes the dark areas transparent, for the Normal blend.
      </p>
      <p>
        With a video, the <b>Loop</b> menu sets how the video repeats, as it does for a video in a
        source slot: <b>Off</b> jumps back to the start, <b>Crossfade</b> fades the end into the start
        over <b>Fade</b> seconds, and <b>Forward and back</b> plays the video forward, then in reverse.
      </p>
      <p>
        The <b>Mask</b> menu shows the file only inside a shape: <b>Circle</b>, <b>Triangle</b>,
        <b>Square</b> or <b>Hexagon</b>. <b>Mask size</b> sets the size of the shape, <b>Mask softness</b> sets
        the width of its soft edge, and <b>Mask X</b> and <b>Mask Y</b> move it on the file. The mask moves
        and turns with the file.
      </p>
      <Tip>
        The effects below Image or Video in the list also change the file. To keep a logo
        unchanged, make this effect the last one in the list.
      </Tip>

      <h2>Text</h2>
      <Shot name="fx-text" alt="The Text effect with glowing words over the picture" side="block" />
      <p>
        Text writes words over the picture. Type the words in the <b>Text</b> box; Enter starts a new
        line. <b>Style</b> makes the letters <b>B</b> (bold) or <b>I</b> (italic), and
        puts the lines at the <b>Left</b>, the <b>Center</b> or the <b>Right</b>.
      </p>
      <Shot name="fx-text-font" alt="The Font box with its list of fonts open" side="left" />
      <p>
        The <b>Font</b> box shows the fonts on your computer. Click it, then type a part of a name to
        find a font. The Up and Down keys go to the next font and use it at once, so you can see each
        font on the picture. Enter or a click on a name keeps the font. Esc goes back to the font
        from before.
      </p>
      <p>
        <b>Fill</b> makes the letters one color (<b>Solid</b>) or a <b>Gradient</b>, which goes across
        the text at <b>Gradient angle</b>. <b>Outline</b>, <b>Glow</b> and <b>Shadow</b> each have a
        color square at the right of the slider: click it to change the color. A strong Glow with a
        bright color looks like a neon sign.
      </p>
      <p>
        The <b>Move</b> menu moves the text on its own. <b>Scroll left</b>, <b>right</b>, <b>up</b> and
        <b> down</b> move it across the screen, and it comes back in at the other edge. <b>Type
        on</b> shows the letters one at a time; all the letters stay for <b>Hold</b> seconds, then it
        starts again. <b>Speed</b> sets how fast. <b>Size</b>, <b>X</b>, <b>Y</b> and <b>Angle</b> place
        the text, and each can have a range.
      </p>
      <Tip>
        The effects below Text in the list also change the words. Put a Kaleidoscope below Text to
        make a pattern of the letters, or make Text the last effect to keep the words easy to read.
      </Tip>

      <h2>Color</h2>
      <Shot name="fx-color" alt="The Color effect with a Linear fill and its gradient" side="block" />
      <p>
        Color puts a color or a gradient over the picture. The <b>Fill</b> buttons
        select <b>Solid</b> (one color), <b>Linear</b> (a gradient along a line), or <b>Radial</b> (a
        gradient around a center). <b>Color overlay</b>, in the <b>Common</b> section, sets how strongly
        the color shows. It starts at zero, so the picture does not change until you increase it.
        The <b>Blend</b> menu above it sets how the color mixes with the picture.
      </p>
      <Shot name="fx-color-gradient" alt="A stop of the gradient with its color picker open" side="left" />
      <p>
        A gradient has from two to eight color stops below its bar. Select a stop to open its
        color picker. Drag a stop to move it. Click on the bar to add a stop. To remove a stop, drag
        it down from the bar, or right-click it.
      </p>
      <p>
        In the color picker, the large square sets the saturation and the brightness, and the strip
        below it sets the hue. You can also type a color code, select one of the nine ready colors, or
        use the eyedropper to take a color from the window. <b>OK</b> keeps the
        color. <b>Esc</b> brings the color before back. Other effects with gradients, such as Light
        cycles and Particles, use the same editor.
      </p>

      <h2>Levels</h2>
      <Shot name="fx-levels" alt="The Levels effect with a higher Black level" side="block" />
      <p>
        Levels changes the brightness of the picture. <b>Exposure</b> makes the full picture brighter or
        darker, in the EV steps of a camera. <b>Black level</b> makes the dark parts black, which gives
        more contrast. Both settings start with no effect.
      </p>

      <h2>Opacity mask</h2>
      <Shot name="fx-mask" alt="The Opacity mask effect with a Radial mask that hides the center" side="block" />
      <p>
        Opacity mask hides parts of the picture. It uses a gradient of grays: white keeps the
        picture, and black shows what is below it. The <b>Type</b> menu selects where the grays
        go. <b>Brightness</b> uses the brightness of the picture itself, so its dark or bright parts go
        away. <b>Radial</b> puts the gradient around a center, which you place
        with <b>Size</b>, <b>Stretch</b>, <b>X</b> and <b>Y</b>.
      </p>
      <p>
        <b>Strength</b> sets how much the mask hides. The gradient below it has gray stops in place
        of colors: select a stop to set its gray level.
      </p>
      <p>
        The shape types (<b>Circle</b>, <b>Triangle</b>, <b>Square</b>, <b>Hexagon</b>
        and <b>Polygon</b>) have no gradient. The picture stays inside the shape and goes away outside
        it. Set <b>Keep</b> to <b>Outside</b> to do the opposite. <b>Softness</b> sets the width of the
        soft edge, and <b>Sides</b> sets the number of sides of the Polygon. <b>Size</b>, <b>Stretch</b>,
        <b>Turn</b>, <b>X</b> and <b>Y</b> change the shape as they do for Radial.
      </p>
    </>
  );
}
