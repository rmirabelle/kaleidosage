# Layers and effect copies (design)

Decided 2026-10-24. The first need: the 3D Object's Freeze background (see
SOLIDS.md), where the effects after the object change only the object. More
requests will mix layers and effects freely, so this is the design for all
of them, built in phases. Each phase leaves the app working and gives the
same pictures as before for every scene that does not use the new parts.

## Today

- One picture goes down the FX list. Each step reads the picture made so
  far and writes a new one (see `KaleidoRenderer.render`). Every step
  writes a fully opaque pixel.
- Each effect exists once per scene. Its settings are keyed by name
  (`overlayOpacity`), and MIDI mappings, audio links, song scripts, saved
  scenes and Randomize all use these names. The FX list (`fxOrder`) holds
  each step at most once.

## Rule 1: every picture carries its cover

Every picture between two steps is premultiplied RGBA: the color times the
cover, and the cover in alpha. A picture with alpha 1 everywhere is today's
picture, so each step must give exactly today's result for alpha 1. The
rules per kind of step:

- Steps that move pixels (Warp, Map, Kaleidoscope, Smear, the Driver's
  bend): alpha moves with the color it is read with. Sort moves the colors
  only: its packed picture keeps its runs in alpha, so the cover stays.
- Steps that filter (Blur, Bloom's blur, Relief, Contours, Sharpen): they
  filter alpha with the color, so a soft edge stays soft.
- Steps that change colors (Color with its overlay, Levels, the Driver's
  reveal and light, Relief's light): they work on the color without the
  cover (color divided by alpha) and keep alpha.
- Steps that add light or marks (Particles, Light cycles, Rays, Bloom's
  glow, Contours' lines, the 3D Object's shape): what they add adds cover
  too, so it shows over what is under the layer. Added light adds the
  cover of its brightest channel (`addLight` in shaders.ts); Particles add
  theirs by blending, at most up to full cover.
- The Camera shows a whole world with a sky, so its picture is opaque,
  also on a layer.
- Steps with a memory of earlier frames (Trails, Smear's history): the
  memory keeps alpha, so a trail fades its cover with its color.
- A shape step's opacity and Blend (`blendCover`): the colors blend as
  plain colors, and the covers mix by the opacity.
- The source images are opaque, also a PNG with clear parts, as they
  always were; a layer gets its clear parts from its source (the 3D
  Object), not from a picture file.

The screen and a video export always get an opaque picture: the last pass
puts the top picture over black (today it is opaque anyway).

## Rule 2: a scene is a stack of layers

- A layer is a source and its own part of the FX list. The source is the
  source images (A and B), or a 3D Object, later more kinds. A 3D Object
  source can read the picture of the layers under it (its Wrap, Project
  and Mirror read it today).
- The renderer draws each layer's source and steps into a picture of its
  own, then puts the layers together from the bottom up, each with its
  blend and opacity.
- The 3D Object's Freeze background is the first layer the user makes: the
  picture at the 3D Object's place is the layer under it, and the steps
  after it make the picture that paints the object, which is drawn last
  over that layer.

## Rule 3: effects become copies

- Each effect in a list is a copy with an id, its kind, and its own
  settings. Two Kaleidoscopes (one per layer, or two in one layer) are two
  copies.
- A setting's key is its copy's id and the setting's name. The first copy
  of each kind has the kind as its id, and its keys stay today's bare
  names, so every saved scene, MIDI mapping, audio link and song map stays
  good with no change. A second copy is `kaleidoscope#2`, with keys such as
  `kaleidoscope#2.foldCount`.
- An effect with memory (Trails, Smear, Particles, Light cycles, Sort)
  keeps its memory per copy.
- Saved scenes get a new version with the copies and layers; an older scene
  opens as one layer with one copy of each effect it has.

## Phases

1. Rule 1, with no change on the screen: every shader carries alpha, and a
   check renders scenes with the code before and after and compares the
   pixels (`tools/test-layers.mjs`).
2. Freeze background: the 3D Object's switch starts a second layer. Each
   effect is still once per scene: the layers share the one FX list, split
   at the 3D Object. The scene file saves the switch. Built 2026-10-24:
   `PlayState.solidKeep`. What the user wants is the object painted by
   the steps after it, with its outline kept: at the 3D Object's place the
   renderer keeps the picture in `keptTarget` and passes it on unchanged,
   the steps after it change it, and the 3D Object is drawn last, painted
   with that picture (u_tex), over the kept one (u_back). The first build
   made the object a clear layer that the later steps moved (a kaleidoscope
   folded its outline across the screen); that was not the effect. Phase 1
   was built the same day, checked by tools/test-layers.mjs (97 scenes,
   every pixel the same).
3. Effect copies: the data model, keys, migration, MIDI, audio links, song
   scripts, Randomize, and "+ New" that allows a second copy.
4. The layers interface: a list of layers, each with its own FX list,
   blend, opacity, and a switch to hide it.

Phase 2 already follows rules 1 and 2, so phases 3 and 4 build on it and do
not undo it.

## Open points

- The texture memory grows by one picture per layer (and one per copy with
  memory). The texture memory estimate (`textureMemory.ts`) must count it.
- Song follow and MIDI pick settings by key; the key form above keeps the
  old keys, but the MIDI panel and the Audio panel must show which copy a
  key belongs to.

## Ideas for later

Talked about 2026-10-24; none of these is planned yet.

- **Picture effect.** A new effect at a place in the FX list that lays a
  flat image (a PNG with clear parts, or an opaque one) over the picture
  made so far, with position, size, turn, blend and opacity. The effects
  above it shape the background; the effects below it change both, or,
  with Freeze, only the image. Freeze could choose what it keeps: the
  image's clear parts or its opaque parts. Preferred by the user over
  clear parts in Slot A or B (which the kaleidoscope would fold into the
  pattern). A tilting 3D plane was left out: it would do much of what the
  Camera effect does.
- **Freeze here.** A marker at any place in the FX list that works as the
  3D Object's Freeze background does: the picture at the marker is kept
  from the effects below it. Freeze does not stop time: the effects above
  the marker keep moving the kept picture; only the effects below it
  cannot change it.
- **Masks**, **video export with clear parts**, and **effect copies with a
  layers panel** (phases 3 and 4) are the other ideas from the same talk.
