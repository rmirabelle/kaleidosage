# Spirograph design: wheels that roll inside a ring

A design note, written 2026-11-11 with the first version. It builds on the
line drawing of Light Cycles and Light Paths (`drawLineLayer`,
`mixLineLayer`).

## Goal

The true lines of the Spirograph toy. A wheel rolls inside a fixed ring
without slip. A pen in a hole of the wheel draws a line. The wheel does not
have to be round, and the hole can be at any place in the wheel. Several
wheels draw in the same ring, each in its own color.

## Wheels

The wheels are a list in the play state (`spiroWheels`), 1 to 6 of them. Shape,
Teeth and Color are not sliders, so they have no ranges and no MIDI. The
hole is two sliders. Each wheel has:

| Setting | What it does |
|---|---|
| Shape | Circle, Football, Egg, Triangle, Square or Cross. |
| Teeth | The wheel's size: the length of its edge, in teeth (8 to 150). |
| Hole X, Hole Y | Two sliders for each wheel (`SPIRO_HOLE_KEYS`), with ranges, MIDI and sound links as any slider. The hole is from the wheel's center: 1 is the distance to the farthest point of the edge, X to the right, Y up. A click or a drag in the wheel's picture sets both; a slider that has a range keeps its range. The picture shows the live hole. |
| Color | The color of the wheel's line. |

## Settings

| Setting | What it does |
|---|---|
| Ring teeth | The ring's size in teeth (48 to 150). The toy's rings have 96 and 105. |
| Size | The ring's radius, in screen heights. |
| Width | The line width, in pixels at 1080p. |
| Draw | How much of each line shows, from its start. A range on Draw makes the pen draw the lines. |
| Turn, Tilt | The whole pattern turns in 3D, as in Light Paths. |
| Picture color, Background | As in Light Paths. |
| Center X, Center Y, Rotation, Opacity, Blend | Common settings. |

## How it works

- `spiro.ts` makes each wheel's line from the settings alone. A line closes
  after ring teeth / gcd(ring teeth, wheel teeth) turns of the wheel, so
  teeth with a small common part give many loops.
- The contact point goes the same distance along the wheel's edge and along
  the ring, and the two edges have the same direction there. At a corner of
  the wheel (the tips of the Football), the wheel turns around the contact
  point.
- Inner corners can not touch the ring, so the Cross rolls on the smallest
  shape with no inner corners around it: it goes from tip to tip.
- A straight side of a wheel follows the ring as if it could bend to it. A
  real straight side would touch only at its two ends. This keeps the tooth
  count exact, so every line closes.
- How a wheel rolls is kept between frames while its shape, its teeth and
  the ring teeth stay the same (at most 24 records). The hole is not a part
  of the record, so a hole that moves costs no new record. When a wheel is
  removed, the later wheels take their hole sliders' values and ranges with
  them; MIDI controls and sound links stay with the slider. A line has at most 90,000 points; all wheels
  together draw at most 262,144 lines.

## Open points

- The pen draws over time, and the line stays (now: a range on Draw).
- A wheel that rolls on the outside of the ring, and the toy's bars.
- A slider with a range for a wheel's teeth.
