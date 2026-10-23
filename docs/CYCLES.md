# Light Cycles design: generative trails, like Tron

A design note, written 2026-10-22, before any code. It builds on the
particle effect (`PARTICLE_STEP_SHADER`, state textures in
`renderer.ts`) and the sound links (`docs/AUDIO.md`).

## Goal

Cycles drive over the picture and leave lines of light. A cycle that hits a
line crashes, its whole line goes away, and a new cycle starts. The lines
take the color of the picture, so the cycles paint the image in lines.

## Place in the chain

Light Cycles is a picture step (group key `cycles`). The effect list already
lets a picture step go before the kaleidoscope. There, the fold mirrors the
lines into symmetric patterns. After the fold, the lines go on top of the
folded picture.

## Modes

- **Movement**: Grid (straight lines, 90° turns, true Tron) or Free (the
  cycles steer at any angle and draw curves). Grid Size shows only in Grid.
- **Blend**: Glow (the lines add their light) or Cover (the lines cover the
  picture), as with particles.

## Settings

| Setting | What it does |
|---|---|
| Opacity | How much the lines show. 0 is no effect. |
| Background | The picture under the lines: 1 shows it whole, 0 shows black. |
| Count | How many cycles drive at the same time. |
| Speed | How fast the cycles drive. |
| Width | The width of a line, in pixels at 1080p. |
| Trail Length | How fast a line fades behind its cycle. At the top, a line stays until its cycle crashes. |
| Turn Rate | How often a cycle turns at random. Link it to a beat band to turn on the beat. |
| Follow | How strongly the cycles turn toward bright areas, so the lines trace the picture's shapes. |
| Dodge | How often a cycle sees a line ahead and turns away. Low gives many crashes; high gives long lines that fill the screen. |
| Out of Bounds | How far past the screen's edges the cycles can drive before they die, as a part of the screen size. At 0, a cycle dies at the edge. |
| Grid Size | Grid mode only: the space between the lanes that the cycles can turn into. |
| Head Glow | How much brighter the cycle's head is than its line. |

All of them can drift, take ranges, and link to MIDI and sound, as other
settings do.

## Rules

- Color: a line takes the color of the picture under the cycle's head at
  the time the cycle passes. So the line keeps that color when the picture
  moves on.
- Crash: a cycle crashes when the place ahead of it holds a line (its own
  line or another cycle's), but not the last few pixels of its own line.
- Clear: on a crash, the cycle's line goes away in a short fade (about a
  quarter second), and a new cycle starts at a random place and direction.
- Edges: a cycle can drive off the screen. Out there it keeps its line,
  and it can still crash into lines, its own or another cycle's. It can
  turn and come back onto the screen. A cycle dies when it reaches the
  outer edge of the Out of Bounds space, and its line goes away as on a
  crash.
- Pause: the cycles stand still, and the lines do not fade.
- Saved scenes keep the settings, not the lines. A scene starts with no
  lines, and the cycles start at random places.

## How it works (vectors)

Decided 2026-10-22: the lines are vectors, not pixels in a texture.

- **Cycles** (`src/engine/cycles.ts`, no GL, no React): each cycle has a
  place, a direction and its line. A line is a list of points (each with
  its time and color); a point is added at each turn, and every short
  distance in between, so the color and the fade follow the line. The
  cycles move in the app's code each frame, in small steps (less than one
  cell), so a fast cycle cannot jump over a line.
- **Crash grid**: a grid of cells over the screen and the largest Out of
  Bounds space (a cell is about 2.7 pixels at 1080p). A cell holds the line
  that covers it, and when. A cycle marks the cells under its line (as wide
  as the line), and tests the cell just ahead of it. Its own newest cells do
  not count. When a line fades or goes away, its cells are free again. The
  grid has the same size for every Width and Out of Bounds value, so a
  change of these does not start the lines again; only a new screen shape
  does.
- **The picture on the CPU**: the cycles need the picture's colors and
  brightness. Each frame the GPU makes a small copy of the picture (about
  256 pixels wide) and reads it back without waiting, so the cycles see a
  picture one or two frames old.
- **Draw pass**: each line segment is one instance of a quad, drawn as a
  round-ended line with a smooth edge. The lines go into a texture with MAX
  blending, so the joins and crossings do not get brighter. Then that
  texture goes over the picture (Glow adds it, Cover covers). The heads are
  round dots, brighter by Head Glow.

## Open points

- Count goes up to 2000 cycles. The draw pass has a limit of about 260,000
  segments; more do not show.
- Randomize picks Light Cycles with a chance of about 0.25.
