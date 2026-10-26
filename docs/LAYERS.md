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

## Layers before effect copies (decided 2026-10-25)

Built 2026-10-25, steps 1 to 5. Two choices made while building: the 3D
Object layer's effects change the picture painted on the object (its
outline stays), which is what Freeze background did; and the 3D Object's
Paint choices are "Layers below" and "Image layer" (not the bare slot A,
which would not fit the screen). Random all no longer picks the 3D Object,
so seeded random scenes that had one now differ (tools/test-layers.mjs);
with its old chance, every one of the 97 scenes is the same.

The user works like in Photoshop: each layer has its own effects, and the
layers go together from the bottom up. Freeze background (phase 2) and
the Overlay effect gave one FX list two meanings, which was hard to
follow: after the 3D Object, every effect changed only the object, so an
Overlay there showed only on the object. So the layers come first, before
effect copies (phase 3), with one limit.

### The limit: each effect is in one layer only

- Each effect is still at most once per scene, whatever layer it is in.
  So each setting keeps its bare name (`kaleidoscope`, `foldCount`), and
  MIDI mappings, audio links, song maps, Randomize and saved scenes stay
  as they are.
- For the same reason, each kind of layer is at most once per scene: one
  Image layer (the source slots A and B), one 3D Object layer, one Image or
  Video layer. A scene has 1 to 3 layers.
- Effect copies (phase 3) lift both limits later: then each layer has its
  own copies, and a scene can have more layers of a kind.

### The model

- A scene is a stack of layers. Each layer has a kind (its source), a name,
  an eye switch (show or hide), a blend (Normal, Screen, Add, Multiply), an
  opacity, and its own FX list, which acts on that layer only.
- The renderer draws each layer that shows into a picture of its own, with
  its cover (rule 1), and puts the pictures together from the bottom up,
  each by its blend and opacity. The screen gets the result over black.
- Sources:
  - **Image:** the source slots A and B, as today. Always opaque.
  - **3D Object:** the shape, with its settings (today's 3D Object effect).
    It is clear around the shape. Its Paint setting takes the place of
    Freeze background: "Layer below" paints it with the layers under it,
    put together (the Wrap, Project and Mirror modes read that picture),
    or "Slot A" paints it with the source image.
  - **Image or Video:** its own file (today's Overlay effect), with Size, X,
    Y and Turn. A PNG keeps its clear parts.
- The 3D Object and Overlay effects leave the FX list: they become these
  layer kinds.
- Effects with memory (Trails, Smear, Particles, Light cycles, Sort) keep
  their memory as today, in the one layer that has them.

### The interface

- **Layers card**, at the top of the left panel, above Source. Its header
  keeps what belongs to the whole scene: the scene's name and Length. One
  row per layer, the top layer first: the eye switch, a small thumbnail,
  the name, the blend menu and the opacity. A drag moves a layer. "+ Layer"
  adds a kind that the scene does not have yet. A right-click menu
  renames or deletes a layer.
- A click selects a layer. The **Source** and **FX** cards then show that
  layer: its source settings, and its own FX list ("+ New" adds to it).
- In the "+ New" menu, an effect that is in another layer is dimmed, with
  that layer's name; a click moves it here, after a question.
- An effect moves to another layer by a drag of its header onto that
  layer's row, or by "Move to layer" in the effect header's right-click
  menu. Its settings stay.
- The canvas always shows the full result, whatever layer is selected.

### Old scenes

- A scene from before layers opens as one Image layer with its FX list.
- With Freeze background on, it opens as two layers: the Image layer with
  the effects before the 3D Object, and above it the 3D Object layer, with
  Paint "Layer below" and the effects after the 3D Object.
- With the Overlay effect, it opens with an Image or Video layer on top,
  with the Overlay's file, blend and opacity. Effects that were after the
  Overlay stay in the Image layer, so such a scene can look a little
  different.
- A scene file gets a new version with the layers. The app then saves only
  the new form.

### Order of work

Each step is a commit, with the old scenes still giving the same pictures
(tools/test-layers.mjs) where the step says so.

1. **Data and renderer:** the layers in the play state, the scene file
   (with the old scenes' conversion), Undo and the unsaved-change check.
   Each layer draws into its own picture, and the pictures go together.
   With one Image layer, every old scene gives the same picture.
2. **Layers card:** rows, eye, blend, opacity, order, select; the Source
   and FX cards show the selected layer; "+ New" adds to it.
3. **3D Object layer:** the 3D Object leaves the FX list; Paint "Layer
   below" or "Slot A"; Freeze background goes.
4. **Image or Video layer:** the Overlay effect leaves the FX list.
5. **Moving effects:** drag and drop onto a layer row, and "Move to layer".
6. Docs and help (RULES.md, the help topics), and the texture memory
   estimate counts one picture per layer.

### Open points

- Masks (a layer that shows only where another layer is) are not in this
  plan.
- Multiply needs a rule for clear parts: there, the layer below shows as it
  is.

### Outcome (2026-10-26)

The layers were built (steps 1 to 6) and then taken out of the UI: the
user should not have to think in layers. The effects are the layers, and
the FX list order is the only stack.

- The Layers card is gone. The 3D Object and the Image or Video (the old
  Overlay, renamed) are FX effects again.
- Image or Video lays its file over the picture made so far, with Blend,
  Opacity, Size, X, Y, Turn and a Black key. The effects after it change
  the whole picture; the file has no effects of its own.
- Freeze background stays. The engine splits the FX list (see
  FrameValues.freeze): the steps before the 3D Object, the steps after it
  up to an Image or Video (they change only the picture painted on the
  object), and the rest (they change the whole picture). The renderer
  draws these parts into pictures of their own, as the layers did.
- No saved scene had layers, so the scene file has no layers field.
- The 3D Object's background control is still open for discussion.
