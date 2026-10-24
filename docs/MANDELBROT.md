# Mandelbrot (an Algorithm mode)

Asked 2026-10-24, after a 3D Mandelbulb (a 3D Object shape) did not give
the look the user wants. The look: a deep zoom into the Mandelbrot set's
edge, with bands, a light that makes the bands look like stacked steps, and
spirals that come back at every depth.

## Step 1 (built 2026-10-24)

Map mode 9 of the Algorithm effect (see `complexMap` in shaders.ts).

- c is the place (Place menu, `MANDEL_CENTERS` in submodes.ts) plus the
  screen point, 1.5 / 10^Depth across; Angle turns the view and Pan moves
  it in screen units.
- z = z^2 + c from 0, up to 200 + 120 Depth rounds (800 at most). A point
  that escapes past 256 gets the usual smooth escape count.
- The picture lies across the bands (one band is one picture height across;
  Band width is the rounds per band) and up by the angle z escaped at, so
  the picture shows inside each band, not only its colors.
- Light: from z over its derivative (the usual normal map of a Mandelbrot),
  toward Light angle. Terraces darkens each band toward one edge.
- Points that never escape are in the set: black.
- Where one pixel holds more than about one band, the picture blurs (its
  stretch, like the Julia map's) and the light fades to an even shade, so
  the fine edge does not sparkle.
- The dive: a range on Depth runs it over the scene's Length (or a custom
  loop time), so the dive's length is the scene's.
- Randomize does not pick Mandelbrot yet: it costs more than the other
  maps.

Places: Seahorse valley (-0.7436438870371587, 0.1318259042053120), Spiral
(-0.10109636384562, 0.95628651080914, a Misiurewicz point: spirals at every
depth), Dendrite (i), Mini copy (the cusp of the copy at -1.75), Elephant
valley (0.2892573747165706, 0.013391178939759867, a Misiurewicz point among
the elephants; the main cusp at 0.25 showed only a thin line).

Softness (added 2026-10-24) turns each terrace's sharp edge into a slope; at
1 the bands rise and fall evenly. It also blends the picture across the rings where the
escape count changes: there the angle doubles, so a point just past the
escape size also samples the picture at twice its angle (a second sample,
like the Droste spiral's edge blend), fading out through the ring.

## Step 2 (built 2026-10-24): deep zoom

Perturbation, the usual deep-zoom method. Depth now goes to 13 (10 trillion
times).

- `mandelPath` in renderer.ts works out the place's exact path in JavaScript
  with 64-bit numbers (about 15 digits), until it escapes, and sends it to the
  graphics card as a two-channel float texture, 1024 values a row. It is made
  again only when the place or the rounds change.
- The shader works only with each pixel's small difference d from that path:
  d' = 2 Z d + d^2 + dc. dc, the screen point's part of c, fits 32-bit
  numbers at any depth.
- Rebasing: where z = Z + d comes nearer 0 than d, or the path ends, the pixel
  goes on against the path's start (d = z, Z = 0). So any place works, also
  one whose path escapes early, and no pixel turns into a glitch blob.
- Rounds: 300 + 150 Depth, 2500 at most (`mandelRounds`). The frame cost
  grows with Depth.
- The slope for the light is kept per screen unit, so it does not overflow
  32-bit numbers in deep views.

Checked by renders at Depth 2.5, 6, 9 and 12 (Seahorse valley), 8 (Spiral)
and 10 (Dendrite): crisp detail, no blocks.
