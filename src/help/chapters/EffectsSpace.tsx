import { Shot, Tip } from "../parts";

export function EffectsSpace() {
  return (
    <>
      <h1>Effects that shape space</h1>
      <p className="help-lead">
        These seven effects change where each part of the picture goes. They mirror it, bend it, put it on
        a 3D shape, or fly a camera over it. Most scenes start with one of them.
      </p>

      <h2>How to read the effect chapters</h2>
      <p>
        This chapter and the two after it describe all 27 effects. For each effect you find its function,
        the choices of its menus, and the settings that change the result most. Each picture shows the
        effect in a new scene, with its controls open in the <b>FX</b> card and the result beside them.
      </p>
      <p>
        The parts that all effects share are in other chapters. <i>The FX list</i> tells you how to add,
        order, lock and remove effects, and describes <b>Blend</b> and <b>Opacity</b> in
        the <b>Common</b> section at the bottom of many effects. <i>Settings that move</i> tells you how
        to give a slider a range, so that its value moves.
      </p>
      <Tip>
        An effect that you add starts with values that show. Some effects also start with ranges, so the
        picture moves immediately. Each section tells you which settings move.
      </Tip>

      <h2>Kaleidoscope</h2>
      <Shot name="fx-kaleidoscope" alt="The Kaleidoscope effect with its Type menu and the mirrored picture" side="block" />
      <p>
        Kaleidoscope mirrors the picture into wedges or tiles. The <b>Type</b> menu has five choices:
      </p>
      <ul>
        <li><b>Radial</b> makes wedges around a center, as a toy kaleidoscope does. <b>Segments</b> sets the number of wedges.</li>
        <li><b>Triangle tiles</b>, <b>Hexagon tiles</b> and <b>Square tiles</b> fill the picture with mirrored tiles of that shape. <b>Tile size</b> sets their size.</li>
        <li><b>Hyperbolic</b> puts the tiles in a disk, where they become smaller toward the edge. <b>Sides</b>, <b>Per corner</b> and <b>Disk size</b> set the pattern, and <b>Flow</b> moves the tiles through the disk.</li>
      </ul>
      <p>
        <b>Twirl</b> and <b>Inner twirl</b> twist the pattern. <b>Offset X</b> and <b>Offset Y</b> move the
        center of the mirrors. <b>Mirror fade</b> makes each reflection darker than the one before, as real
        glass does.
      </p>
      <p>
        A new Kaleidoscope has ranges on <b>Pan X</b> and <b>Pan Y</b>, in its <b>Common</b> section. They
        slide the picture under the mirrors, so the pattern moves immediately.
      </p>

      <h2>Algorithm</h2>
      <Shot name="fx-algorithm" alt="The Algorithm effect with the Droste spiral type" side="block" />
      <p>
        Algorithm bends the picture with a mathematical function. The results are spirals, tunnels, and
        fractals. The <b>Type</b> menu selects the function, and each type shows its own settings:
      </p>
      <ul>
        <li><b>Droste spiral</b> puts the picture inside itself, again and again. <b>Copy size</b> sets the size of each copy, <b>Spirals</b> turns the copies into a spiral, and <b>Speed</b> moves you into the picture.</li>
        <li><b>Möbius</b> moves one point of the picture to the center, which stretches the picture around it. <b>Point</b>, <b>Rotation</b> and <b>Roll</b> have ranges when you select this type, so it moves immediately.</li>
        <li><b>Julia</b> shapes the picture as a Julia set fractal. <b>Shape</b> selects the fractal, and <b>Steps</b> sets its depth.</li>
        <li><b>Mandelbrot</b> zooms into the Mandelbrot set. The <b>Place</b> menu selects where: Seahorse valley, Spiral, Branches, Dendrite, Mini copies, or Elephant valley. <b>Start</b>, <b>End</b> and <b>Speed</b> set the travel of the zoom.</li>
        <li><b>Log spiral</b>, <b>Tunnel</b> and <b>Seamless spiral</b> wind the picture around a center. <b>Twist</b> sets the winding and <b>Speed</b> moves the picture along it.</li>
        <li><b>Sine</b> repeats the picture in waves. <b>Power (z^n)</b> folds the picture around its center; <b>Power</b> sets the number of folds.</li>
      </ul>
      <p>
        <b>Map mix</b>, in all types, mixes the bent picture with the picture before the effect. Many types
        have <b>Darkness</b> and <b>Softness</b>, which make the far parts of the pattern dark.
      </p>
      <Tip>
        The Mandelbrot type is a deep zoom, and it uses more of the graphics card than the other
        types. <b>Random all</b> does not select it.
      </Tip>

      <h2>Warp</h2>
      <Shot name="fx-warp" alt="The Warp effect with the Noise type on the checkerboard" side="block" />
      <p>
        Warp pushes the parts of the picture out of their places. The <b>Type</b> menu selects the form of
        the push:
      </p>
      <ul>
        <li><b>Noise</b> gives soft, irregular waves. <b>Marbling</b> and <b>Warp detail</b> make them finer.</li>
        <li><b>Ripple</b> makes rings around a point, as a drop does in water.</li>
        <li><b>Waves</b> makes parallel waves. <b>Wave angle</b> sets their direction.</li>
        <li><b>Swirl</b> twists the picture around a point.</li>
        <li><b>Bulge and pinch</b> makes the picture swell or shrink around a point.</li>
        <li><b>Cells</b> cuts the picture into cells and turns each one. <b>Cell sides</b> makes them triangles, squares or hexagons.</li>
      </ul>
      <p>
        <b>Warp strength</b> sets how far the picture moves, <b>Warp size</b> sets the size of the waves,
        and <b>Warp flow</b> makes them travel. The types with a point
        have <b>Warp center X</b> and <b>Warp center Y</b>.
      </p>

      <h2>Bubble</h2>
      <Shot name="fx-bubble" alt="The Bubble effect with a circle that bends the checkerboard" side="block" />
      <p>
        Bubble bends the picture inside a shape, as a lens does. The center of the shape looks nearer or
        farther. The <b>Shape</b> menu has <b>Circle</b>, <b>Square</b> (with <b>Roundness</b>),
        and <b>Radial</b>, a star with <b>Points</b> and <b>Inner radius</b>.
      </p>
      <p>
        <b>Depth</b> sets the strength and the direction of the bend. <b>Size</b>, <b>Center X</b> and <b>Center Y</b> place
        the shape. <b>Background</b> sets how much of the picture shows around the shape.
        The <b>Shadow type</b> menu puts a shadow inside or outside the edge of the shape.
      </p>

      <h2>Camera</h2>
      <Shot name="fx-camera" alt="The Camera effect, which shows the checkerboard as a floor" side="block" />
      <p>
        Camera lays the picture flat, as a floor, and flies a camera over it. The settings have the names
        of camera moves:
      </p>
      <ul>
        <li><b>Pan</b> turns the camera left and right, and <b>Tilt</b> turns it up and down.</li>
        <li><b>Pedestal</b> sets the height of the camera above the floor.</li>
        <li><b>Dolly</b> flies the camera forward, and <b>Truck</b> moves it to the side. These two are speeds.</li>
        <li><b>Lens</b> sets the focal length in mm, from wide to long.</li>
      </ul>
      <p>
        The <b>Repeat</b> menu sets what is past the edges of the picture: a mirrored copy, a
        repeated copy, or nothing. <b>Fog</b> hides the far floor, and <b>Sky</b> shows a sky above the
        horizon in the color of its swatch.
      </p>

      <h2>Terrain</h2>
      <Shot name="fx-terrain" alt="The Terrain effect with a loaded landscape" side="block" />
      <p>
        Terrain flies the camera over real land. It gets the heights of a part of the Earth from the
        internet, together with a satellite picture of the same place for the colors.
      </p>
      <Shot name="fx-terrain-load" alt="The Place and Area menus of Terrain, with the mouse on Load" />
      <p>
        A new Terrain effect has no land. Select a region in the <b>Place</b> menu,
        or keep <b>Random</b>. Select the width of the land in the <b>Area</b> menu, from 5 km to 160 km.
        Then select <b>Load</b>. The line below shows the name of the place and its lowest and
        highest points.
      </p>
      <p>
        <b>Height</b> makes the mountains taller or flatter. <b>Sun angle</b>, <b>Sun height</b> and <b>Shadows</b> set
        the light. <b>Detail</b> adds fine relief to the surface. Below the <b>Camera</b> heading are the
        same camera settings as in the Camera effect.
      </p>
      <Tip>
        <b>Load</b> needs an internet connection. The project keeps the loaded land, so the scene opens
        later with no connection.
      </Tip>

      <h2>3D object</h2>
      <Shot name="fx-solid" alt="The 3D object effect with a cube that carries the picture" side="block" />
      <p>
        3D object puts the picture on a shape that turns in space. The <b>Shape</b> menu has
        eleven shapes: Sphere, Cube, Morph, Blobs, Wobbly ball, Spike ball, Octahedron, Icosahedron,
        Pyramid, Menger sponge, and Moravian star. Some shapes show more settings below the menu, such
        as <b>Spikes</b> for the Spike ball or <b>Points</b> for the Moravian star.
      </p>
      <p>
        The <b>Map</b> menu sets how the shape uses the picture. <b>Wrap</b> paints the picture on the
        surface. <b>Project</b> makes the shape a glass lens that bends the picture behind
        it. <b>Mirror</b> makes it chrome that reflects the picture.
      </p>
      <p>
        The <b>Source</b> menu selects the picture for the shape: <b>Slot A</b>, <b>Slot B</b>, or a file
        of its own with <b>Image or Video</b>. <b>Spin</b> and <b>Tumble</b> turn the shape, <b>Tilt</b> leans
        it, and <b>Shading</b>, <b>Shine</b> and <b>Shadow</b> set its light. <b>Background</b> sets how much
        of the picture shows behind the shape.
      </p>
      <p>
        With <b>Freeze background</b> on, the effects that come after the 3D object in the list change
        only the picture on the shape. The background stays as it was.
      </p>
    </>
  );
}
