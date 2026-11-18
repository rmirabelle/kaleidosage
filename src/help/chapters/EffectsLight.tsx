import { Shot, Tip } from "../parts";

export function EffectsLight() {
  return (
    <>
      <h1>Effects that draw light</h1>
      <p className="help-lead">
        These eight effects add light to the picture: lines, beams, rings, particles and glow. Most of
        them draw on top of the picture, so they also work on a black picture.
      </p>

      <h2>A dark stage for light</h2>
      <p>
        Light shows best on a dark background. In the pattern menu of slot A, <b>Solid Black</b> gives a
        black picture, and many of these effects have a <b>Background</b> setting that makes the picture
        behind the light darker. The effects that draw lines use the <b>Add</b> blend when they start,
        which adds their light to the picture below.
      </p>
      <p>
        <i>The FX list</i> and <i>Settings that move</i> describe the parts that all effects share.
      </p>

      <h2>Light cycles</h2>
      <Shot name="fx-cycles" alt="The Light cycles effect with lines of light in the colors of the picture" side="block" />
      <p>
        Light cycles race across the picture and leave lines of light behind them. A cycle that hits a
        line crashes and starts again at a new place. The lines take their colors from the picture, so
        a colored picture gives colored lines.
      </p>
      <p>
        The <b>Move</b> menu has <b>Grid</b>, with turns of 90 degrees on a grid of <b>Grid size</b>,
        and <b>Free</b>, with curves. <b>Count</b> sets the number of cycles, <b>Speed</b> their
        speed, <b>Width</b> the width of the lines, and <b>Trail Length</b> how long a line
        stays. <b>Background</b> sets how much of the picture shows behind the lines; the picture above
        has a low value.
      </p>
      <p>
        The lines can also take their colors from a gradient of your own. <b>Gradient</b> sets how
        much of that gradient the lines get, and the color bar below it holds the gradient.
        The <b>Color</b> buttons select how the gradient goes on the lines. <b>Cycle</b> gives each cycle
        one color of the gradient. <b>Trail</b> runs the colors along each line, from the head
        back. <b>Position</b> puts the gradient across the full screen, along a line or around a center.
      </p>

      <h2>Light rays</h2>
      <Shot name="fx-rays" alt="The Light rays effect with rays from the bright shapes" side="block" />
      <p>
        Light rays stream out from the bright areas of the picture, away from a
        center. <b>Threshold</b> sets how bright an area must be to send rays. <b>Strength</b> sets their
        brightness, <b>Length</b> their length, and <b>Fade</b> how fast they become
        weak. <b>Center X</b> and <b>Center Y</b> move the point that the rays go away from.
      </p>

      <h2>Lasers</h2>
      <Shot name="fx-lasers" alt="The Lasers effect with a fan of colored beams" side="block" />
      <p>
        Lasers shows a fan of laser beams that comes from one point. <b>Beams</b> sets the number of
        beams and <b>Spread</b> the width of the fan. <b>Sweep</b> swings the fan from side to side.
        A new Lasers effect has ranges on <b>Spread</b> and <b>Sweep</b>, so the fan opens, closes
        and swings immediately.
      </p>
      <p>
        <b>Width</b>, <b>Glow</b> and <b>Glow size</b> set the look of each beam. <b>Color</b> sets the
        color of the beams, and <b>Rainbow</b> spreads the colors of the rainbow across the
        fan. <b>Source X</b> and <b>Source Y</b> move the point that the beams come from.
      </p>

      <h2>Light cone</h2>
      <Shot name="fx-cone" alt="The Light cone effect, a spotlight that shines down onto a pool of light" side="block" />
      <p>
        Light cone shines a beam of light down from one point, through drifting fog, onto a floor, as
        a stage light does. The <b>Type</b> menu has two looks. <b>Spotlight</b> fills the beam with
        soft light and makes a pool of light on the floor; <b>Softness</b> sets how soft its edge is.
      </p>
      <Shot name="fx-cone-shell" alt="The Light cone effect as a Laser shell pyramid with bright corner lines" side="block" />
      <p>
        <b>Laser shell</b> lights only a thin surface, as a laser show in fog does: the surface is
        brightest where you see it from the side. <b>Edge width</b> sets how thick the surface, the corner
        lines and the outline on the floor are. <b>Corner lines</b> sets how bright the corners of a pyramid are. The <b>Shape</b> menu makes
        the beam a round <b>Cone</b> or a <b>Pyramid</b>, with 3 to 8 <b>Sides</b> and a <b>Turn</b>.
      </p>
      <p>
        <b>Spread</b> sets how wide the beam is. <b>Swing</b> moves it from side to side,
        and <b>Tilt</b> moves it toward you or away. A new Light cone has a range on Swing, so the
        beam swings at once. <b>Source X</b>, <b>Source height</b> and <b>Distance</b> move the point
        that the light comes from. <b>Fog</b>, <b>Fog size</b> and <b>Fog speed</b> set the clouds in the
        beam. <b>Floor light</b> sets how bright the light on the floor is, and <b>Fade</b> makes the
        light dimmer far from its source. The color square on <b>Brightness</b> sets the color of the light.
      </p>

      <h2>Light paths</h2>
      <Shot name="fx-paths" alt="The Light paths effect with Greek key lines around the center" side="block" />
      <p>
        Light paths draws lines that go out from one point along a geometric path. The <b>Path</b> menu
        has six paths: <b>Zigzag</b>, <b>Square wave</b>, <b>Greek key</b>, <b>Spiral</b>, <b>Flower</b>,
        and <b>Circuit</b>.
      </p>
      <p>
        <b>Arms</b> sets the number of lines around the point. <b>Steps</b> and <b>Step length</b> set
        the length of each line, and <b>Turn angle</b> sets the angle of each corner. <b>Draw</b> sets
        how much of each line shows. It has a range when the effect starts, so the lines grow and go
        back. <b>Color</b> and <b>Rainbow</b> set the colors, and <b>Picture color</b> takes the colors
        from the picture.
      </p>

      <h2>Light shapes</h2>
      <Shot name="fx-outlines" alt="The Light shapes effect with a ring that draws itself" side="block" />
      <p>
        Light shapes draws glowing outlines. The <b>Shape</b> menu
        has <b>Ring</b>, <b>Square</b>, <b>Triangle</b>, <b>Radial</b> (a star), and <b>Snake</b>, a line
        that crawls across the picture.
      </p>
      <p>
        The <b>Draw</b> menu sets how a shape appears. <b>Draw and erase</b> draws the outline from start
        to end and then erases it. <b>Chase</b> sends a short piece of light around the
        outline. <b>Whole</b> shows the full outline.
      </p>
      <p>
        <b>Count</b> draws more than one copy of the shape, and <b>Spacing</b> sets the distance between
        the copies. <b>Draw time</b> sets how long one outline takes. The gradient sets the colors along
        the outline. <b>Spin</b> and <b>Tumble</b> turn the shapes in space.
      </p>

      <h2>Spirograph</h2>
      <Shot name="fx-spiro" alt="The Spirograph effect with the lines of two wheels" side="block" />
      <p>
        Spirograph works as the drawing toy does. Wheels with teeth roll inside a ring, and a pen in a
        hole of each wheel draws a line. The number of teeth and the place of the hole set the form of
        the line.
      </p>
      <Shot name="fx-spiro-wheel" alt="One wheel of the Spirograph, with the mouse in its picture" />
      <p>
        Each wheel has a card. Click or drag in the picture of the wheel to put the pen hole
        there. <b>Shape</b> makes the wheel a circle, a football, an egg, a triangle, a square or a
        cross. <b>Teeth</b> sets the number of teeth, and <b>Color</b> sets the color of the line.
        Below the card, <b>Wheel 1 hole X</b> and <b>Wheel 1 hole Y</b> are sliders for the same
        hole, so the hole can have a range and move.
      </p>
      <p>
        <b>Add wheel</b>, below the last wheel, adds one more, to a maximum of six. <b>Ring teeth</b> sets
        the teeth of the ring for all wheels. A range on <b>Draw</b> makes the pens draw the lines
        during the scene.
      </p>

      <h2>Particles</h2>
      <Shot name="fx-particles" alt="The Particles effect with dots in the colors of the picture" side="block" />
      <p>
        The bright areas of the picture send out particles, which move and fade. The particles have the
        colors of the picture at the place where they start.
      </p>
      <p>
        The <b>Shape</b> menu makes each particle a <b>Dot</b>, a <b>Line</b> or
        a <b>Ring</b>. <b>Threshold</b> sets how bright an area must be to send
        particles. <b>Count</b> sets their number, <b>Size</b> their size, and <b>Life</b> how long each
        one lives. <b>Speed</b>, <b>Gravity</b>, <b>Direction</b> and <b>Turbulence</b> set their
        motion. <b>Background</b> sets how much of the picture shows behind them; the picture above has a
        low value.
      </p>
      <Tip>
        A very high <b>Count</b> uses much of the graphics card. If the picture does not move smoothly,
        decrease it.
      </Tip>

      <h2>Bloom</h2>
      <Shot name="fx-bloom" alt="The Bloom effect with a glow around the bright shapes" side="block" />
      <p>
        Bloom makes the bright areas glow, as strong light does in a camera. <b>Threshold</b> sets how
        bright an area must be to glow. <b>Strength</b> sets the brightness of the
        glow, <b>Size</b> how far it goes, and <b>Softness</b> how gradually the glow
        starts at the threshold. Put Bloom after the effects that draw light, and their lines glow too.
      </p>
    </>
  );
}
