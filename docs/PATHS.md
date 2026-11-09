# Light Paths design: lines out from one point

A design note, written 2026-11-08 with the first version. It builds on the
line drawing of Light Cycles (`CYCLE_VERTEX_SHADER`, `CYCLE_SHADER`,
`CYCLE_MIX_SHADER`).

## Goal

Lines go out in all directions from one point. Each line is not straight: it
follows a geometric path, such as forward 1, left 1, forward 1, right 1.
Every arm follows the same path, turned around the center (the user's choice
for the first version).

## Menus

- **Preset**: sets the Path and the shape, Draw and color sliders once. A
  preset is not a mode: the menu goes back to Choose... after each pick.
  Greek sun, Circuit board, Spiral flower, Turning web, Zigzag bloom, Square
  burst.
- **Path**: Zigzag, Square wave, Greek key, Spiral, Flower, Circuit. Each
  path is a list of moves in `paths.ts` (`PLANS`): how many Step lengths to
  go, then how many Turn angles to turn.
- **Blend**: the 8 layer blends. A new effect uses Add.

## Settings

| Setting | What it does |
|---|---|
| Arms | How many copies of the path go around the center. |
| Steps | How many moves each arm has. |
| Step length | The length of one move, in screen heights. |
| Turn angle | The turn after each move. The paths are made for 90°, but every angle gives a shape. |
| Start radius | How far from the center each arm starts. It keeps the center from being a dense knot. |
| Width | The line width, in pixels at 1080p. |
| Draw | How much of each arm shows, from the center. It starts as a range, so the lines grow and go back. |
| Fade | How much dimmer the far end of each arm is. |
| Color | The color at the center. |
| Rainbow | How many times around the color wheel the color goes along an arm. |
| Picture color | How much the lines take the color of the picture under them. With Background 0, the picture shows only through the lines. |
| Background | The picture under the lines: 1 shows it whole, 0 shows black. |
| Center X, Center Y, Rotation, Opacity | Common settings. |

## How it works

- `paths.ts` walks one arm and copies it around the center, each frame. It
  has no memory, so a slider changes the whole pattern at once and a video
  export gives the same frames.
- The lines are the Light Cycles line instances, drawn into the same line
  picture with MAX blending, so crossings do not get brighter. The most lines
  is 180 arms times 512 steps, 92,160, under the 262,144 limit of the
  instance buffer.
- The Zigzag starts half a Turn angle to the right, so at every angle the arm
  goes straight out on average. The Circuit path never goes backward and ends
  in the direction it started.

## Open points

- Next: Branching (for snowflakes and lightning), and arms that differ a
  little from each other.
