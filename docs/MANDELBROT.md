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

Morph (tried 2026-10-24, removed): every point's path started at a small
circling value instead of 0. Its effect was almost all a move of the whole
picture in a circle (the start acts like a move of c by its square); with
the view made to follow the place's copy, very little change of shape was
left. Quadratic formulas with another start are the same set moved, so a
real change of shape would need another formula.

## Research notes (2026-10-24): what fractal zoom programs do

Asked by the user after Growth and Morph failed: what do Kalles Fraktaler,
zoomasm, Ultra Fractal and others know that applies here? Ranked by fit.

1. **Deep targets with a long loop give the "evolving" look.** The shapes
   change as a dive passes from one layer to the next on its way to a
   small copy; a copy with a long loop has many layers. The Seahorse
   valley point is the center of a copy with a loop of 998 rounds, which is
   why it was the only place where the user saw branches evolve; the other
   places' copies have loops of 16 to 90. Those deep views need more
   rounds (the black in the user's picture is likely the 1250-round
   limit), so this pairs with idea 2.
2. **Exponential map (log-polar) rendering.** Zoom video programs draw the
   whole dive once, as rings at evenly spaced powers around the target
   (a strip: across is the angle, down is log of the distance; it is
   conformal, so spirals keep their shape), then make each frame by
   reading that strip (zoomasm keeps about 16 strips in GPU memory and
   reads them with texelFetch). Per frame it costs a texture read, not
   rounds, so a dive can use many more rounds, stays smooth at any size,
   and its bands cannot jitter. Limits: the view must be centered on the
   target (Rotation is free, Pan is not), detail near the very center is
   thinner, and the strip costs memory (for example 2048 across by a few
   thousand down in half floats) and a one-time render, done in pieces so
   the GPU does not time out.
3. **Stripe Average and its family (Triangle Inequality Average,
   Curvature Average).** Colorings that average a function over the whole
   path, giving flame-like patterns that reach out from the set; they need
   a large escape size (about 1e20). Our loop already has the full z each
   round, so it would be one more sum per round. A possible band style.
4. **Not useful here.** Bilinear approximation (BLA) and series
   approximation skip rounds only when a view needs millions of them; ours
   stops at 1250. Histogram coloring changes with what is on the screen,
   so in a moving view it jitters, as Growth did.

Sources: [Exponential Map (Munafo)](https://mrob.com/pub/muency/exponentialmap.html),
[zoomasm](https://mathr.co.uk/zoomasm/),
[Fractals/software (Wikibooks)](https://en.wikibooks.org/wiki/Fractals/software),
[lilac exponent (Fractal Forums)](https://www.fractalforums.com/images-showcase-(rate-my-fractal)/lilac-exponent),
[Bivariate Linear Approximation (Munafo)](https://mrob.com/pub/muency/bivariatelinearapproximati.html),
[Perturbation Methods (Munafo)](https://mrob.com/pub/muency/perturbationmethods.html),
[Triangle Inequality Average (Ultra Fractal)](https://www.ultrafractal.com/help/coloring/standard/triangleinequalityaverage.html),
[Smooth iteration count (Quilez)](https://iquilezles.org/articles/msetsmooth).

## Step 5 (built 2026-10-24): deeper places

From the research: the evolving look comes from deep copies with long
loops. The places are now copies at depth 12.7 to 13.9 with loops of 455
to 1692 rounds (plus the Seahorse valley point: loop 998, depth 15.4),
found by sampling slow-escaping points near each old place, then Newton's
method from each one's nearest loop length. A dive passes their layers of
changing shapes at about half and three quarters of that depth (6 to 10).
Default End is 8.

- Rounds: 250 + 100 d + 40 d^2 (5250 at depth 10). At depth 10, 1250 left
  up to 60% of the outside points black; 5000 let 98 to 100% escape.
- A new inside test that works deep: the product of 2z over the rounds
  shrinks toward 0 for a point caught by a loop in the set (from the second
  round, as every path starts at 0). It changed no pixel in 24 test views.
- The saved-point test is off below a span of 1e-4: there its tolerance is
  tiny, and paths that pass very near 0 twice looked caught, which drew
  black arcs (a 64-bit direct render of the same view had none).
- The path is stored as two 32-bit parts per value (nearest 32-bit number
  and what it leaves out), used for the full z where the pixel goes on from
  it.
- Band flow wrapped by 2 bands, which jumps unless the picture is square;
  it now wraps by two picture widths for the picture and one band for the
  terraces.
- Cost on an RTX 5090 at 1920 by 1080: 7 to 11 ms a frame at depth 8 to 10
  (about four times that at 4K, twice during a crossfade). The log-polar
  strip (research idea 2) would remove most of it.
- Known look: at depth 8 and deeper, the bands are so dense that many
  pixels hold several, so the picture blurs and the light evens out there
  (the busy fade), which shows as flat areas.

## Step 6 (built 2026-10-24): log-polar strips

Research idea 2. The raw map around the place is drawn into strips and
read by each frame, instead of running the loop for every pixel.

- `MANDEL_GLSL` (shaders.ts) is the loop, shared by the picture shader and
  `MANDEL_STRIP_SHADER`. A strip texel stores the smooth escape count (-1
  inside; R32F) and, in RGBA16F, log10 of the distance to the edge (c
  units), the escape angle and the light's normal angle (over PI). The
  picture shader derives everything else from those: the softness ring
  position is 1 - fract(count + log2(ln 256)), the doubled angle is
  2 * angle wrapped, the band stretch is 1 / (2 * edge distance).
- Geometry: 3072 columns per turn, 2048 rows kept, rows as tall as columns
  are wide in log terms (1126 rows per power of ten, so shapes keep their
  form). Global row g lies at distance 10^(1 - g / 1126) from the place;
  texture row = g mod 2048, so as a dive moves on, rows it leaves are drawn
  over with rows ahead. 2 strips: 151 MB of GPU memory.
- `updateMandelStrips` (renderer.ts): each view (the dive, and the
  crossfade or the next crossfade's start) needs rows from its farthest
  screen point (pan included) down; it takes the strip holding most of
  them, so at the restart the strips swap roles. 32 rows a frame for the
  view, 16 for the other, outer rows first. Where rows are not ready (at
  first, and the tiny middle past the deepest row) the shader runs the loop.
- The strip shader builds in the background (KHR_parallel_shader_compile);
  until then, the loop runs as before.
- The strip runs the rounds of a view 1.5 powers deeper than one whose
  corner is at its distance, so it shows a little less black than the loop.
- Checked against the loop on the GPU at five views: 0.8 to 1.0 of 255 on
  average (Branches at depth 9: 9, from its extra rounds). Cost at 1920 by
  1080 on an RTX 5090, deep views: 0.8 to 1.3 ms a frame (7 to 11 before).
- Limits: the strip's texels are as fine as the screen at about 490 pixels
  from the view's middle, so the corners of a large screen are a little
  softer; a Speed faster than about 1.7 powers a second outruns 32 rows a
  frame, and the loop fills in.

Fixes the same day (from the user's picture: noise near the set, and black
areas that never grew):

- The picture's height follows the escape angle, which changes ln|z| / PI
  times faster than the bands' count (5 to 10 times); the blur allowed only
  for the bands, so the angle aliased into noise, and the strip's nearest
  angle reads made it move. The stretch is now the larger of the two.
- Busy areas (a pixel holds more than about a band) took an even 0.62
  shade, which made flat shores around the set. They now take a shade from
  the pixel's distance to the edge in pixels, in powers of ten: bright at
  1/100 pixel or nearer, dark at 5 pixels or farther, so the filaments show
  and nothing sparkles.
- Growth again: before the strip, the round limit rose with the view's
  depth, so slow points at the edge of the black turned to color as a dive
  went on (the growth the user liked). The strip fixed the rounds for each
  distance. Now the view has its own limit (`u_mandelLimit`, the rounds for
  its depth, before rounding, times Growth 0.1 to 1.5), and points past it
  fade to black over 3% of the limit; the strip runs 1.5 times the rounds,
  enough for Growth at its most.

## Research notes 2 (2026-10-24): clean animation

Asked by the user: how do fractal programs make zooms animate cleanly
(no noise, no flicker, no moving patterns)?

1. **Distance estimate as the mask.** The grainy noise near the edge comes
   from bands closer together than the pixels. The distance to the edge in
   pixels hides it: color = tanh(distance / pixel), dark at the edge
   (Koebe's 1/4 theorem: no point of the set lies within a quarter of the
   estimate, and one lies within 4 times it). Our busy-area shade (step 6
   fixes) is this idea.
2. **Adaptive supersampling.** Only pixels within 4 pixels of the edge (by
   the distance estimate) need more samples; mandelbrot-book splits them
   into four, again and again. Far pixels are already smooth. With the
   strip, extra samples are a few texture reads each, not more rounds.
3. **Supersampling for video.** Zoom programs render at a density of
   rho^2 samples per output pixel (5 by 5 in Heiland-Allen's examples;
   zoomasm has a samples-per-pixel setting that "reduces sparkling").
4. **Smooth count is stable.** The smooth escape count depends only on c,
   so bands built on it do not flicker; textures mapped by the escape
   angle need their own derivatives, or the mip level is wrong (step 6
   fixes added the angle's stretch).
5. **Temporal accumulation** (jittered samples blended over frames, with
   reprojection) suits a zoom, as the motion is only a scale about the
   middle; its risk is ghosting, kept down by clamping the history to the
   current pixel's neighbors and resetting when settings change.

Sources: [Optimizing zoom animations again (mathr)](https://mathr.co.uk/blog/2020-06-18_optimizing_zoom_animations_again.html),
[mandelbrot-book (adaptive supersampling, DE coloring)](https://github.com/adammaj1/Mandelbrot-book-book),
[Nebuloculars (mathr)](https://mathr.co.uk/web/nebuloculars.html),
[zoomasm](https://mathr.co.uk/zoomasm/),
[Reprojection temporal anti-aliasing](https://brashandplucky.com/2023/05/06/reprojection-temporal-antialiasing.html),
[A Survey of Temporal Antialiasing Techniques](http://behindthepixels.io/assets/files/TemporalAA.pdf).

## Step 7 (built 2026-10-24): extra samples near the edge

From research notes 2. The Growth slider is removed (the user: it did not
work well); the black edge comes from the view's round limit alone, which
rises with depth, as before the strip.

- `mandelLook` (shaders.ts) turns one sample's raw values into its look:
  shade (light, terraces), Edge light's mask, how far past the round limit
  it is, and the busy-area shade (from the distance to the edge in pixels).
- Where the strip serves the pixel and it holds an edge (within 4 pixels of
  the set by the distance estimate, inside it, or past 70% of the round
  limit), four more samples in the pixel (a turned grid) are read from the
  strip and the five looks averaged. The picture itself still comes from
  the middle sample, blurred as before. A sampled pixel keeps its light to
  about twice the band density before the busy shade takes over.
- Flicker test: two frames 0.7% of a zoom apart, the first scaled to match,
  pixels that differ by more than 40 of 255: Seahorse valley at depth 8
  4703 -> 373, Spiral at 9 7249 -> 338, Branches at 7 8530 -> 3601 (most
  left is its black edge, which moves as the round limit rises, as meant).
  Averaging only the light, not the busy shade, changed almost nothing:
  the busy shade was the noise.
- Cost at 1920 by 1080 on an RTX 5090: 0.9 to 1.6 ms a frame (0.8 to 1.3).
