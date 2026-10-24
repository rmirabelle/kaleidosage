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

Places: Seahorse valley (-0.743643887037151, 0.13182590420533), Spiral
(-0.77568377, 0.13646737), Dendrite (i), Mini copy (the cusp of the copy at
-1.75), Elephant valley (the main cusp, 0.25).

Limit: the graphics card's 32-bit numbers hold about 7 digits, so near Depth
5 (100,000 times) the picture starts to turn blocky.

## Step 2 (planned): deep zoom

Perturbation, the usual deep-zoom method: one exact path for the place,
computed in JavaScript with doubles (about 15 digits), and on the graphics
card only each pixel's small difference from that path. That reaches about
10^13. Deeper dives need more rounds, so the frame cost grows with Depth.
