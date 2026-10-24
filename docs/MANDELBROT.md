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

## Step 3 (built 2026-10-24): endless dive and cost limits

The user asked for an endless dive, and found that high Depth overloaded even
an RTX 5090.

- Every place is now a Misiurewicz point: its path from 0 lands on a loop
  of `period` rounds. Near such a point the set repeats: zoom in `depth`
  powers of ten (log10 of |product of 2z| around the loop) and turn `turn`
  degrees (that product's angle), and the picture is the same, with every
  point `period` rounds later to escape. Checked with renders of a view and
  the same view one repeat deeper.
- Speed (the map's shared Speed slider) adds depth flown, in powers of ten
  per second, to Depth. Past `MANDEL_LOOP` (6), a deeper view is drawn as
  the same view whole repeats less deep: turned back by their turn (the
  light too, since it turns with the view), with their skipped rounds added
  to the bands (`u_mandelShift`; the picture takes it modulo two picture
  widths, the terraces modulo one band). The jump back measured 0.0 to 0.3
  of 255 (Mini copies 2.5). At depth 3 the repeats did not yet match well
  enough (up to 36 of 255), so the loop sits at 6.
- So no view is deeper than 6 plus one repeat (at most 6.75), whatever
  Depth or the dive says: that is the main cost limit.
- Rounds: 250 + 100 Depth, 1250 at most (was 2500). Depth goes to 10.
- Inside tests skip the rounds of points in the set: the main heart shape
  and the large circle (each made 2% smaller), and a path that comes back
  within 1/1000 of the view's width of a point saved at rounds 8, 16, 32...
  (it is caught in a loop). They change at most 25 edge pixels of 204,000.
- Places: Seahorse valley, Spiral, Branches (new), Dendrite, Mini copies (a
  point among small copies of the set, was the cusp at -1.75), Elephant
  valley. Default Depth is now 3.

## Step 4 (built 2026-10-24): real dive with a crossfade

Step 3's endless loop looked static: at a self-repeating point the shapes
never change (the user: branches never grow or shrink). It is replaced.

- The places are now centers of small copies of the set (found with
  Newton's method on z_p(c) = 0, from each point's nearest loop length),
  sizes 4.5e-8 to 1e-6, plus the well-known Seahorse valley point. A dive
  toward one passes changing shapes and ends at the copy (depth about 6 to
  7.3). Checked with renders at depths 1, 3, 5 and 6.5.
- Speed adds depth flown (powers of ten per second). The view goes from
  Depth down by Dive length (default 4), then starts again. Over the last
  share of the dive (Crossfade, default 0.25) the start fades in, already
  diving, from as far before Depth as the view is before the end, so it
  reaches Depth just as the dive restarts: the frames on both sides of the
  restart differ by 0.4 of 255.
- The crossfade draws the shape pass a second time at the second depth,
  mixed in with the blend's constant alpha (`drawShapes`), so it costs a
  second pass only while it fades. The exact path is always made for the
  most rounds, so both depths share it.
- Step 3's cost limits stay (rounds at most 1250, inside tests). Default
  Depth is 0.5 again.

Also on 2026-10-24: the app lost the graphics card because the shape shader
took 65 s to build (ANGLE on Direct3D 11 copies every function call, and
every round of a fixed-length loop). Calling the map and the picture read
from one place each, in loops of run-time length, brought it to 11 s.

Changed the same day: Depth and Dive length were hard to tell apart, and a
small change to Dive length made the view jump (the dive's place was the
depth flown divided by the length). Now Start depth and End depth set the
dive's two ends, the dive keeps its own progress (0 to 1, in mapTravel), so
a change to either end only stretches it, and at Speed 0 the view stays at
Start depth.

Bands (2026-10-24): small Band width changes made the picture jump,
because the bands counted from round 0 and deep views are hundreds of
rounds out. Now they count from the view's lowest escape count
(`mandelStart` in renderer.ts: the corners and edge middles, worked out in
64-bit numbers each frame), so Band width changes only their spacing (a 1%
change moved the picture 4.4 of 255 on average). Band flow moves the bands
on purpose, in bands per second (state `mandelFlowTime`, saved with the
scene like warpTime).

Reverted the same day: counting the bands from the view's lowest escape
count made them jump during a dive (the lowest of the 8 sample points
changes from one point to another). The bands count from round 0 again,
and Band width has a narrow range instead: 2 to 4, in steps of 0.001
(it was 0.2 to 20). Band flow stays.

Growth (2026-10-24): the share of the escaping view that shows; the points
that escape last turn black, with a short fade (4% of the count). Its count
comes from `mandelGrowth` in renderer.ts: the escape counts of a 32 by 18
grid in 64-bit numbers, read at the Growth share among the points that
escape, averaged over five depths 0.04 apart. A single reading over all
points jumped by up to 140 rounds in a dive (points joining or leaving the
set); this one by under 5 at Seahorse valley. About 1 ms a frame. Start
depth and End depth are now labeled Start and End (a range on one Depth
slider would mean "move on its own", as everywhere else in the app).

Growth removed the same day: its one reading for the whole view still
jumped, and it hid the busiest parts. Edge light takes its place: each
pixel's distance to the set's edge (the usual estimate, |z| ln|z| / |dz/dc|,
in screen heights, as the slope is per screen unit) sets a light that is
full at the edge and falls as exp(-(distance / Edge width)^2), so the open
areas go black and the busy edges stay. It needs only the pixel, so it
moves smoothly. Edge light (0 to 1) mixes it in; Edge width is 0.002 to
0.3 screen heights.

Morph (2026-10-24): every point's path starts at a small value that
circles (Morph speed, rpm, state `mandelMorphTurns`), not at 0, so the set
itself changes shape. The start is Morph times the square root of the
view's width (it acts about like a move of c by its square), so Morph
moves the shapes by about the same share of the view at any depth (an
unscaled 0.03 left depth 4 empty, and did little at depth 1). The exact
path starts there too, so each pixel's difference still starts at 0; it is
kept per pass (slot 0 the view, slot 1 the crossfade), as the start
depends on the depth. Rebasing goes against the path's start
(d = z - start), and the heart and circle inside tests are off while
Morph is on (they hold only for a start of 0). Morph is 0 to 1.5: 0.3
changes the shapes a little, 1 a lot.
