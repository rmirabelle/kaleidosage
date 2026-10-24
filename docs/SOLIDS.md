# 3D Object design: the picture on a solid shape

A design note, written 2026-10-23, before any code. It builds on the Camera
effect (`CAMERA_SHADER`: a 3D view drawn by a shader, with a sun, shadows
and shine) and the effect list (`fxOrder`).

## Goal

One 3D shape floats over the picture and turns. The picture made by the
effects before it is on the shape's surface, or seen through it, or
reflected in it. Behind the shape is the picture, a darker copy of it, or
black.

## Place in the chain

3D Object is a picture step (group key `solid`, panel name "3D object").
It reads the picture made so far. Before the Kaleidoscope, the fold mirrors
the shape into a ring of shapes; after it, the shape wears the folded
picture.

## Menus

- **Shape** (presets): Sphere, Cube, Morph, Blobs, Wobbly ball, Star,
  Octahedron, Icosahedron, Pyramid, Menger sponge. Morph, Blobs, Wobbly ball and Star came
  on 2026-10-24 in place of the Cylinder, Cone, Torus and Capsule (no scene
  used them; the new shapes took their numbers, 2 to 5).
- **Map**: how the picture goes onto the shape.
  - **Wrap**: the picture is painted on the surface and turns with the
    shape. Round shapes (sphere, blobs, wobbly ball, star) wrap it around
    their axis; flat faces (and Morph, as the cube) each show the whole
    picture. The picture
    is mirrored at its seam, so the seam does not show.
  - **Project**: the picture stays still, facing the viewer, and the shape
    bends it like a glass lens. Bend sets how strongly.
  - **Mirror**: the shape is chrome and reflects the picture around it.
- **Blend**: the 8 layer blends of the other effects, for how the shape
  goes over the picture behind it.

## Settings

| Setting | What it does |
|---|---|
| Size | The shape's size, as a part of the screen height. |
| Roundness | How round the edges and corners are. 0 is sharp. At the top a cube is almost a sphere. For Blobs, how softly the blobs merge; for Star, how round its spikes are. The Sphere, Morph and Wobbly ball hide this slider. |
| Squareness | Morph only: from a star with points on the axes (0), through a ball (about 0.38), to a rounded cube (1). A range makes it flow between them. |
| Blobs | Blobs only: how many balls (2 to 8) drift on slow loops and merge. Between two whole numbers the last blob grows from nothing. |
| Bumps, Waves | Wobbly ball only: how high the waves over the ball are, and how many. They flow with the animation time. |
| Spike length | Star only: how long its spikes are; at 0 they stay inside the ball, so the star is a smooth ball. |
| Spikes | Star only: how many spikes (4 to 32), thinner as there are more. 6, 8, 12 and 20 sit on the corners of an octahedron, a cube, an icosahedron and a dodecahedron; other counts sit evenly on a spiral over the ball. |
| Spike shape | Star only: from pointed (0) to capped, as wide at the end as at the foot (1). |
| Levels | Menger sponge only: how many levels of holes (1 to 5). Between two whole numbers the next level's holes grow, so a range opens and closes them smoothly. |
| Spin | How fast the shape turns around its own axis, in turns per minute. Negative turns the other way. |
| Tumble | How fast the axis itself turns over, in turns per minute. |
| Tilt | How far the axis leans toward the viewer, in degrees. |
| Bend | Project only: how strongly the shape bends the picture. |
| Tiles | Wrap only: how many times the picture goes around the shape. |
| Light angle | The direction the light comes from, around the shape. |
| Shading | How dark the side away from the light is. 0 is flat, with no light and shade. |
| Shine | A bright highlight where the light reflects toward the viewer. |
| Shadow | A soft shadow of the shape on the picture behind it. |
| Background | The picture behind the shape: 1 shows it whole, 0 shows black. |
| Center X, Center Y | Where the shape is (Common: Pan X and Pan Y). |
| Opacity | How much the shape shows (Common). |

All of them can drift, take ranges, and link to MIDI and sound, as other
settings do. Spin and Tumble add up over time (as the Driver's speed does),
so a range on them changes the speed, not the angle.

## How it works (GPU)

- One full-screen pass. Each pixel sends a ray from the viewer. The rays
  that miss a sphere around the shape show the background at once, so
  only the shape's pixels cost much.
- The shapes are distance functions (the usual ones for a box, octahedron,
  and so on). Roundness subtracts a radius from the box's distance and
  shrinks it by the same radius, so its size stays the same. Morph is a
  superellipsoid (the points at one p-distance, p from 0.75 to 10; below
  p = 2 its distance is trusted less, and near Squareness 0 the soft
  shadow can show faint bands). Blobs are balls joined by a smooth minimum.
  The wobbly ball is a ball moved by three crossed sine waves. The star is a
  ball and capped cones (a point is a cap of width 0), joined by a smooth
  minimum; a spike whose axis is clearly farther than the nearest part so
  far is skipped, so 32 spikes stay cheap. The Menger sponge is the usual
  exact Menger distance (a cube, carved by a cross of holes per level); a
  part of a level makes that level's holes smaller. The ray walks the distance function in up to 96 steps.
- The normal (for light, Mirror and Project) comes from the distance
  function at four points around the hit.
- Wrap: the place on the surface, in the shape's own turning frame, gives
  the picture's coordinates: the angle around the axis and the height for
  round shapes, and the face for the flat shapes. A face lays the picture flat along directions
  set by the face itself, not by the curved normal, so the picture does not
  twist over a round edge (changed 2026-10-24; before, the directions came
  from the normal at each pixel). Where Roundness curves one face into the
  next, the faces' pictures blend: the box by a high power of the normal
  (each axis's face), the octahedron, icosahedron and pyramid by the same
  weights as the smooth maximum that rounds them.
- Project: the picture is read at the pixel's own place, moved by the
  normal's sideways part times Bend.
- Mirror: the reflected ray's direction gives the place in the picture
  (the picture as a ball around the shape), so the reflection moves as the
  shape turns.
- Light: as in the Camera effect: a soft shade from the angle to the light
  and a shine from the reflection. The shadow is cast (changed 2026-10-24;
  before, it was a slice through the middle of the shape, moved away from
  the light, which changed shape oddly as a flat-faced shape turned): the
  picture is a wall 0.9 shape sizes behind the shape's middle, and a ray
  from each place on it goes toward the light; how near it passes to the
  shape gives the soft edge (the usual soft shadow of a distance
  function, improved: the closest point between two samples is estimated
  from both). Only rays that cross the sphere around the shape walk it.
- A smooth edge, one pixel wide, from the distance at the last step, so
  the outline does not stair-step.

## Open points

- Next: a Mandelbulb, and a cut gem.
- Randomize picks 3D Object with a chance of about 0.2.

## Freeze background

Built 2026-10-24 (see LAYERS.md, phases 1 and 2): the effects after the 3D
Object paint the object, which is drawn last, over the picture kept at its
place. The first plan below (the object as a clear layer that the later
effects move) was built first and then changed: a kaleidoscope folded the
object's outline across the screen, and the user wanted the object painted.

The general design is in LAYERS.md (layers and effect copies); this is its
phase 2. The notes below are the first plan for it.

Asked 2026-10-24. A switch in the 3D Object effect, Freeze background: the
effects after the 3D Object in the FX list (Kaleidoscope, Warp, Particles,
any of them) change only the object, and the picture behind it stays as it
was at the 3D Object step. The effects can move the object out past its
outline (a kaleidoscope of the object over a still background).

How it works:

1. Layer mode. With Freeze background on, the 3D Object step keeps two
   pictures: the background (the picture under the shape, with Background
   and the shadow) in a texture of its own, and the object alone on a clear
   picture, with its cover as transparency (premultiplied: color times
   cover, and cover in alpha). The steps after it work on the object
   picture.
2. Every step carries transparency. Today 27 of the 35 shaders write a
   fully opaque pixel. Each gets a rule for alpha, with premultiplied
   color:
   - Steps that move pixels (Warp, Map, Kaleidoscope after a picture step,
     Smear, Driver's bend, Sort, Camera's land): the alpha moves with the
     color it was read with.
   - Steps that filter (Blur, Bloom's blur, Relief, Contours, Sharpen):
     they filter alpha with the color, so soft edges stay soft.
   - Steps that change colors (Color, Levels): they work on the color
     without the cover (divided by alpha), and keep alpha.
   - Steps that add light or marks (Particles, Light cycles, Rays, Bloom's
     glow, Color overlay): what they add also adds cover, so it shows over
     the background.
   - Trails: the trail picture keeps alpha, so the object's trails show
     over the background and fade with it.
   Without Freeze background, alpha is 1 everywhere, so every step gives the
   same picture as today.
3. The last pass puts the object picture over the kept background, with
   the 3D Object's Blend and Opacity (in layer mode they apply here, not at
   the 3D Object step). The screen and the video export get an opaque
   picture.
4. The switch: a check box in the 3D Object effect, kept with the scene
   (PlayState) and in saved scenes; Randomize leaves it as it is. With no
   step after the 3D Object, it changes nothing.

Order of the work: layer mode and the last pass with no step after the
object (it must look as today); then the steps that move pixels and the
filters; then the steps that add light; then Trails and Camera. Each step:
the shader compiles, and a check that alpha 1 in gives today's picture.

Open points: the background is kept as it is at the 3D Object step, so a
step before the object that moves (Warp, Trails) still moves it; a second
3D Object after the first draws into the object picture.
