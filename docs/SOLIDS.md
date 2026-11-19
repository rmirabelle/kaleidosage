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

- **Shape** (presets): Sphere, Cube, Morph, Blobs, Wobbly ball, Spike ball,
  Octahedron, Icosahedron, Pyramid, Menger sponge, Moravian star. The
  Cube, Octahedron, Icosahedron, Pyramid and Moravian star are drawn as
  meshes (see below). Morph, Blobs, Wobbly ball and Spike ball (first named Star) came
  on 2026-10-24 in place of the Cylinder, Cone, Torus and Capsule (no scene
  used them; the new shapes took their numbers, 2 to 5). The Moravian star
  (2026-11-06) is the paper star: a core with a flat-sided pyramid on each
  face. At 26 points the core is a rhombicuboctahedron (18 squares, 8
  triangles), as in the paper star.
- **Map**: how the picture goes onto the shape.
  - **Wrap**: the picture is painted on the surface and turns with the
    shape. Round shapes (sphere, blobs, wobbly ball, spike ball, Moravian star) wrap it around
    their axis; flat faces (and Morph, as the cube) each show the whole
    picture. The picture
    is mirrored at its seam, so the seam does not show.
    For the Moravian star a Wrap menu picks how (2026-11-07; the globe
    pinched the picture at the top and bottom points): Globe (around the
    upright, as before), Faces (flat on each triangle), Six sides (cast
    from the six directions of a box, blended by the way each face looks)
    and Points (around each point's own direction, like a small globe per
    point; each corner of the mesh carries its point's direction).
  - **Project**: the picture stays still, facing the viewer, and the shape
    bends it like a glass lens. Bend sets how strongly.
  - **Mirror**: the shape is chrome and reflects the picture around it.
- **Source** (2026-11-07; first named Paint): what the Map puts on the
  shape. Slot A is the picture made so far (Source A after the effects
  above the 3D Object in the list), as before. Slot B is the scene's
  second image or video (with none loaded, Slot A). Image or Video is the
  3D Object's own file (a File row under it picks one; picking Image or
  Video with none opens the Open dialog). Its video plays on the scene's
  clock, as the Image or Video effect's does. The scene file keeps the
  file while the 3D Object is in the list and uses it (a video embedded
  like a source video: scene_archive.rs names the slot solidMedia). Until
  the file has a frame, Slot A paints the shape.
- **Blend**: the 8 layer blends of the other effects, for how the shape
  goes over the picture behind it.

## Settings

| Setting | What it does |
|---|---|
| Size | The shape's size, as a part of the screen height. |
| Roundness | How round the edges and corners are. 0 is sharp. At the top a cube is almost a sphere. For Blobs, how softly the blobs merge; for Spike ball, how round its spikes are; for the Menger sponge, how round its holes are (0 square, 1 round). The Sphere, Morph, Wobbly ball and Moravian star hide this slider. |
| Squareness | Morph only: from a star with points on the axes (0), through a ball (about 0.38), to a rounded cube (1). A range makes it flow between them. |
| Blobs | Blobs only: how many balls (2 to 8) drift on slow loops and merge. Between two whole numbers the last blob grows from nothing. |
| Bumps, Waves | Wobbly ball only: how high the waves over the ball are, and how many. They flow with the animation time. |
| Spike length | Spike ball only: how long its spikes are; at 0 they stay inside the ball, so it is a smooth ball. |
| Points | Moravian star only: 4 (tetrahedron), 6 (cube), 8 (octahedron: the Merkaba), 12 (dodecahedron), 14 (cuboctahedron: cube and octahedron), 20 (icosahedron), 26 (rhombicuboctahedron: the paper star) or 32 (icosidodecahedron). A count between two of them morphs between the two shapes. |
| Point length | Moravian star only: how far out the points reach; at 0 only the bare core shows. Points 8 at 0.6 is the exact Merkaba. |
| Hollow | Moravian star only, -1 to 1: 0 is solid. Above 0 each triangle opens a window and keeps bars along its edges, thinner toward 1 (a frame, like a string-art star; 0.012 wide at 1). Below 0 the bars are wider than the triangles, so each window turns over and reaches out past its triangle (a look that first came by mistake, and the user kept). |
| Spikes | Spike ball only: how many spikes (4 to 32), thinner as there are more. 6, 8, 12 and 20 sit on the corners of an octahedron, a cube, an icosahedron and a dodecahedron; other counts sit evenly on a spiral over the ball. |
| Spike shape | Spike ball only: from pointed (0) to capped, as wide at the end as at the foot (1). |
| Levels | Menger sponge only: how many levels of holes (1 to 5). Between two whole numbers the next level's holes grow, so a range opens and closes them smoothly. |
| Spin | How fast the shape turns around its own axis, in turns per minute. Negative turns the other way. |
| Tumble | How fast the axis itself turns over, in turns per minute. |
| Tilt | How far the axis leans toward the viewer, in degrees. |
| Bend | Project only: how strongly the shape bends the picture. |
| Tiles | Wrap only: how many times the picture goes around the shape. |
| Repeats | Project and Mirror (added 2026-11-07). Project: the picture seen through the shape is that many times smaller, counted from the shape's center, and repeats (mirrored) past its edges; Frost keeps its size on the screen. Mirror: how many times the picture goes around the reflection, counted from the direction straight back at the viewer. A flat face reflects only a narrow set of directions, so at 1 it shows a small part of the picture, much enlarged, that rushes past as the shape turns; more repeats show more of the picture on each face. 1 is the first Mirror look. |
| Light angle | The direction the light comes from, around the shape. |
| Shading | How dark the side away from the light is. 0 is flat, with no light and shade. |
| Shine | A bright highlight where the light reflects toward the viewer. |
| Bump | The picture's gray level as the height of the surface, for the light only (added 2026-11-11): above 0 the bright parts stand out, below 0 they go in. The shape and its outline do not change. Shading and Shine show it. The height is the picture that shows on the shape at that place, for each Map: Wrap's picture on the surface, the picture through the lens (Project), or the reflected picture (Mirror). The lens and the reflection do not change, so the picture stays in place under its bumps. |
| Frost | Project only: frosted glass. The picture through the shape gets soft, grainy and a little milky (0 = clear glass). |
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
  far is skipped, so 32 spikes stay cheap. The Menger sponge is a cube,
  carved at each level by a cross of three bars a third of each small cube
  wide; a bar's cross-section is a mix of a square distance and a circle
  distance (Roundness), and a part of a level makes that level's bars
  thinner. The ray walks the distance function in up to 96 steps.
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
- Sphere with Project or Mirror (2026-11-07): a sphere looks the same at
  every turn, so Spin, Tumble and Tilt turn a copy of the picture instead.
  Project reads the copy where the surface point was before the turn (and
  bends by the normal in the sphere's own frame), so the picture goes
  around with the sphere. Mirror turns the reflected ray into the sphere's
  own frame, so the ball of picture it reflects turns with it. The Source
  and the picture behind stay still, and with no turn both look as before.
  Other shapes keep the fixed picture (their outline shows the turn).
- Light: as in the Camera effect: a soft shade from the angle to the light
  and a shine from the reflection. The shadow is cast (changed 2026-10-24;
  before, it was a slice through the middle of the shape, moved away from
  the light, which changed shape oddly as a flat-faced shape turned): the
  picture is a wall 0.9 shape sizes behind the shape's middle, and a ray
  from each place on it goes toward the light; how near it passes to the
  shape gives the soft edge (the usual soft shadow of a distance
  function, improved: the closest point between two samples is estimated
  from both). Only rays that cross the sphere around the shape walk it.
- A smooth edge, half a pixel wide, from the nearest the ray comes to the
  shape, so the outline does not stair-step (one pixel wide until
  2026-11-06; half a pixel is nearer to a picture made with 16 rays per
  pixel).
- Creases: tried 2026-11-06 and removed the same day. A pixel next to a
  crease took four more rays; an edge filter on the finished picture was
  also tried. Both helped the hollow Moravian star's bars only a little,
  and the rays cost about 1.4 ms more at 2560 x 1440. The star became a
  mesh instead (see below).

## The Moravian star as a mesh

Changed 2026-11-06. The Moravian star is no longer drawn by rays: it is a
mesh of triangles (`starMesh.ts`), which the graphics card draws with 4
samples per pixel. The user saw its hollow bars crawl as it turned; more
rays at creases and an edge filter on the finished picture both helped
only a little, and the rays cost about 1.4 ms more at 2560 x 1440. A
mesh gets smooth edges from the graphics card at almost no cost, and the
whole star costs far less (about 0.04 ms against 0.39 ms at 960 x 540 in a
test).

- The mesh: the 8 cores (found from their corners), a point on each face.
  Point length moves the tips. Hollow makes each triangle a frame: a
  smaller triangle (the window) inside it, and three bars between them;
  no cutting, so Hollow only moves the window's corners. The bars have a
  thickness: an inner surface (each point moved in so it is the thickness
  behind all its faces) and a wall around each window. The bar width
  (barSize): just above Hollow 0 it is the largest triangle's inner radius
  (all closed), and it thins evenly to 0.012 at 1; below 0 it grows from
  that radius to 0.85 at -1, and the windows turn over. The thickness is
  the width over 1.6, at most 0.06. (Until 2026-11-06 Hollow went 0 to 1
  and the width came from the ray star's bar: 0.85 near 0, 0.048 at 1, so
  its lower half showed the turned-over windows.) The side bars of a point shrink
  away as the point gets short, so a bare core is framed only along its
  own edges.
- Standing up (2026-11-06, the user's photo of a Merkaba): each core is
  turned so one point is straight up (on a face with the most sides, so
  the 26-point star hangs from a square's point, as paper stars do), and
  the most level of the other points (the upper one, when two are as
  level) faces the viewer. The 8-point star shows a point up, a point down
  and an upper point toward the viewer, so a whole face of the upright
  tetrahedron (a big flat triangle, tip up) faces the viewer, as in the
  user's photo. Point length snaps to 0.6, the exact Merkaba.
- Points between two counts: the two meshes fade (the user's choice; a
  mesh cannot morph between cores with different faces). The first core's
  finished picture is drawn, and the second fades in over it.
- The picture behind, Background, Blend, Opacity and the Map are as for
  the rays (the painting code is shared, SOLID_PAINT_GLSL). A face seen from
  its back (the inside of a bar) turns its normal to the eye.
- The shadow: the triangles are moved along the light onto the wall
  behind (as in castLight) into a picture a quarter of the screen's size,
  and softened in two passes, across and then up and down (25 reads each,
  bell-shaped; 16 reads in a disk left steps at the edge, 2026-11-07). So its soft edge is the same width
  everywhere, where the rays' grew with the distance from the shape.
- The mesh is rebuilt only when its core, Point length or Hollow changes.

## The flat-faced shapes as meshes

Changed 2026-11-06, after the Moravian star. The Cube, Octahedron,
Icosahedron and Pyramid are meshes too (`flatMesh.ts`), so their edges are
smooth (4 samples per pixel). Each face of the sharp shape is a grid of
triangles from its middle to each edge, closer near the edges and corners.
Roundness does not change the mesh: the vertex shader moves each point
along its direction from the middle onto the rounded surface (a few
Newton's steps on the same distance the rays used: the rounded box for the
Cube, the smooth largest of the planes for the others), and takes that
surface's normal. So the rounded shapes look as before, and a moving
Roundness costs nothing on the CPU. Wrap reads the faces as the rays did
(the face planes and the picture wrap are shared GLSL: SOLID_PLANES_GLSL,
SOLID_WRAP_GLSL). The ray shader still has these shapes' distances; it
draws them no more.

## A model from a file

Built 2026-11-18, step 1 of 2 (step 2: a browser for free models, such as
Poly Haven's, inside the app). Shape 11, Model, draws a 3D model file:
glTF 2.0 in its one-file binary form (.glb).

- The file: `model.ts` reads it (parseModel): every mesh of the file's
  scene, with each node's move, turn and size worked into the corners,
  as one list of triangles per material. The model is moved and sized to
  fit a ball of radius 1, so Size works as for the other shapes. Not read:
  bones and motion (the model stands as it was made), morph shapes, colors
  per corner, a second picture layout, and packed files (Draco, Meshopt,
  KTX2), which give a clear error. Pictures beside the file (a .gltf with
  loose files) are not read; step 2 needs them.
- Source gets a choice for this shape only, Model (SolidPaint 3, the
  default when the shape is picked): the surface shows the model's own
  materials. Each material gives its color and color picture, its bump
  picture (the normal map; no tangents needed), roughness and metal (a
  smooth material has a small sharp highlight, a rough one a wide weak
  one; metal tints it), its own light, and its cut-out level. Shading and
  Shine work as for the other shapes. Map, its sliders and Bump hide.
- With another Source (Slot A, Slot B, Image or Video) the picture goes on
  the model by Map, as on the other shapes. Wrap casts the picture from the
  six directions of a box (a model's own picture layout fits its own
  pictures only).
- Drawing: as the mesh shapes (drawModel, SOLID_MODEL_SHADER): the shadow's
  outline, the picture behind, then the triangles with 4 samples per
  pixel, one draw per material.
- The scene file keeps the .glb file as it was picked (`model`: name and
  base64 data), while the 3D Object is in the list with the Model shape.
  The scene owns the model, as it owns Terrain's land (engine.model).
  Undo does not bring back a model that was taken off.
- Turn (2026-11-18, the user's wish): the Model shape has Rotate X, Y, Z
  (angles that pose it) and Spin X, Y, Z (speeds, turns per minute) in
  place of Spin, Tumble and Tilt. Each line's angle is its Rotate plus
  what its Spin has added up (solidTurnsX, Y, Z). The order is X first,
  then Y, then Z (the order 3D programs name XYZ), so the X turn is always
  around the model's own x line: a bullet that lies along x keeps its spin
  around its length while Y turns it like a coin. (First built with Y
  first, as Spin and Tilt go for the other shapes: X and Y together then
  looked like a wobble to the user. A try with one steady turn around the
  screen's lines was also not what the user wanted.)
- Pivot menu (solidPivot): Center turns the model around the middle of its
  box (calculated). Model's own turns it around the file's zero point, which
  its maker set (often at the base); that point then sits at Center X and
  Center Y.
- The File row has two buttons. File… picks a .glb on the PC with the
  system's Open dialog (the app's own Open dialog does not list .glb files
  yet). Browse… opens the model browser; picking the Model shape with no
  model opens it too.
- The model browser (step 2, 2026-11-18; `ModelBrowserDialog.tsx`,
  `lib/polyHaven.ts`): the free (CC0) models of Poly Haven, about 520.
  Its API needs no key and is open to the app. One request gets the whole
  list (name, categories, tags, triangle count, downloads, date), so the
  search box, the Category menu and the Order menu (Most used, Newest,
  Name) work with no more requests. A click on a model asks for its files
  at the picked Textures size (1K, 2K or 4K; the nearest size when the
  model has no such one), downloads the description, the data block and
  the pictures, and packs them into one .glb (packGlb in `model.ts`), so
  the scene file keeps it as it keeps a picked file. Only files on Poly
  Haven's own servers are read.
- Sketchfab (2026-11-18, the user's wish for science fiction and fantasy
  models, which Poly Haven does not have; `lib/sketchfab.ts`): the second
  tab of the model browser. Sketchfab does the search (only models that
  anyone can download, 24 at a time, with Category, License and Order
  menus); the search needs no account. A download needs the user's own
  Sketchfab API token (a free account gives one, at
  sketchfab.com/settings/password): the token row of the browser takes it,
  the app keeps it in the window's local storage, and sends it only to
  Sketchfab's API with the request for a model's download address. The
  model comes as one .glb file. Models with only a .gltf archive do not
  show.
- Credit: most Sketchfab models need a credit to their maker. The credit
  (name, maker, license, page) goes into the model file as its copyright
  text (stampGlb), and Poly Haven models get one too, so the scene file
  keeps it with no field of its own. parseModel reads it (also the credit
  that Sketchfab's own files carry), and the File row's name shows it in
  its tip.
- Random all keeps the Model shape, and does not pick it.
- Freeze background: with Source Model, the effects after the 3D Object do
  not change the model's colors (there is no Source picture to change).

## Effects for the object only

Built 2026-11-18, as a trial, in place of the Freeze background switch,
which the user found hard to understand ("it feels like a 3D object is 2
layers, and I only ever wanted it to be one layer: just the object").

- The 3D Object's panel lists the scene's other effects, each with a check
  box (PlayState.solidFx). A checked effect changes only the object. An
  effect with no check works by its place in the FX list: above the 3D
  Object it changes the picture behind it, below it the whole result. So
  "the background only" and "the background and the object" need no
  control; only "the object only" does.
- The engine splits the FX list in three (FrameValues.freeze, as Freeze
  background did): the unchecked steps before the object, the checked
  steps (in the list's order, wherever they are), and the unchecked steps
  after it.
- A shape painted with a picture (Source: Slot A, Slot B, Image or Video):
  the checked steps change that picture, and the object keeps its outline.
- A model with its own colors (Source: Model) has no Source picture. The
  model is drawn alone on a clear picture, the checked steps change that
  picture, and it goes over the picture behind, which has the shadow
  (renderOwnModel). So a step that moves the picture moves the outline.
- Camera and Terrain cannot be checked (canPaintSolid).
- The Background slider shows only in a scene that uses it: the object
  draws only itself, and a Levels or Color effect above it darkens the
  picture behind.
- Planned next, not built: 3D effects next to each other in the list in
  one space with true depth.

## The 3D model effect

Built 2026-11-18, the same day as the Model shape, which it replaces. The
user did not mean the model to be a shape of the 3D Object: one effect did
too many things, and a scene could not have a model and a 3D object.

- A new effect, "3D model" (step and group `model`), with its own
  settings: Opacity, Size, Rotate X, Y, Z, Spin X, Y, Z, Light angle,
  Shading, Shine, Shadow, Center X, Center Y, Blend, and
  its own list of effects for the object only (PlayState.modelFx). An
  effect is in the list of one 3D effect only: a check in one takes it
  out of the other.
- It shows the model's own colors, and can mix in the picture behind it
  (the user's wish, 2026-11-18: first a Chrome slider with Mirror only,
  then all three maps the same day). The Map menu (PlayState.modelMap)
  is the 3D Object's: Wrap (painted on from six sides, with Tiles),
  Project (a glass lens, with Bend, Frost and Repeats) and Mirror
  (chrome, with Repeats). Map amount (0 to 1) mixes the model's own
  colors (0) with the map's picture (1), so a look such as half marble,
  half chrome is possible. The paint code is the 3D Object's, with the
  model's bump pictures in the lens and the reflection.
- A picture of the model's own (the Model shape's Source: Slot B, Image
  or Video) is gone: the user does not need it. A model that a picture
  painted in an older scene opens with its Map at Map amount 1.
- No Pivot menu (taken out 2026-11-18, the user's wish): the model
  always turns around the middle of its box, which sits at Center X and
  Center Y. The file's own zero point (model.origin) is still read, but
  not used.
- The 3D Object has no Model shape and no Source: Model now.
- Drawing: the 3D Object's code (drawModel, solidLook), which reads the
  model's settings in the place of the 3D Object's (modelValues in
  renderer.ts).
- With effects of its own, each 3D effect cuts the FX list (see render):
  the steps before it make the picture behind, the object is drawn over
  it with its effects, and the steps after it go on from the result. Two
  3D effects with effects of their own cut the list two times.
- A scene has one model (engine.model), as before. The scene file keeps
  it while the 3D model effect is in the list.
- A scene saved with the Model shape opens with the 3D model effect at
  the 3D Object's place, with its settings (modelFromSolid in scene.ts).
- Adding the effect with no model opens the model browser. Random all
  does not pick it.

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
