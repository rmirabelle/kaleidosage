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

- **Shape** (presets): Sphere, Cube, Cylinder, Cone, Torus, Capsule,
  Octahedron, Icosahedron, Pyramid.
- **Map**: how the picture goes onto the shape.
  - **Wrap**: the picture is painted on the surface and turns with the
    shape. Round shapes (sphere, cylinder, cone, capsule, torus) wrap it
    around their axis; flat faces each show the whole picture. The picture
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
| Roundness | How round the edges and corners are. 0 is sharp. At the top a cube is almost a sphere and a cylinder is almost a capsule. The Sphere has no edges, so it hides this slider. |
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
- The shapes are distance functions (the usual ones for a box, cylinder,
  cone, torus, octahedron, and so on). Roundness subtracts a radius from
  the distance and shrinks the shape by the same radius, so its size stays
  the same. The ray walks the distance function in up to 96 steps.
- The normal (for light, Mirror and Project) comes from the distance
  function at four points around the hit.
- Wrap: the place on the surface, in the shape's own turning frame, gives
  the picture's coordinates: the angle around the axis and the height for
  round shapes, the angle around and across the tube for the torus, and the
  face for the flat shapes. A face lays the picture flat along directions
  set by the face itself, not by the curved normal, so the picture does not
  twist over a round edge (changed 2026-10-24; before, the directions came
  from the normal at each pixel). Where Roundness curves one face into the
  next, the faces' pictures blend: the box by a high power of the normal
  (each axis's face), the octahedron, icosahedron and pyramid by the same
  weights as the smooth maximum that rounds them, and the cylinder, cone
  and capsule between their side and their caps.
- Project: the picture is read at the pixel's own place, moved by the
  normal's sideways part times Bend.
- Mirror: the reflected ray's direction gives the place in the picture
  (the picture as a ball around the shape), so the reflection moves as the
  shape turns.
- Light: as in the Camera effect: a soft shade from the angle to the light,
  a shine from the reflection, and a soft shadow on the background from
  the shape's distance function.
- A smooth edge, one pixel wide, from the distance at the last step, so
  the outline does not stair-step.

## Open points

- The torus knot is left out for now; a distance function for it is slow.
- Randomize picks 3D Object with a chance of about 0.2.
