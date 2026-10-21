# Modulation design: curve presets, MIDI knobs, pads

A design note, written 2026-10-15, before any code. It builds on the drift
code in `src/engine/params.ts` as it is today.

## What the animation code does today

- Every parameter is a `Param` with a single `value`, or, with the range on
  (`on`), a start handle `low` and an end handle `high`.
- `liveValue` works out the value each frame from `tripsOf`: 0 at the start
  handle, 1 at the end handle, 2 back at the start. The trip count comes from
  the shared animation time (`state.time`, one trip per `REFERENCE_CYCLE`),
  or the real clock for a range with its own seconds.
- The trip count folds into a triangle (0 → 1 → 0), and `easeCurve(kind, t)`
  bends that triangle. So one curve from 0 to 1 is played out, then played
  back, and every ease is a pure function of `t`.
- The eases are: Smooth (sine), Linear, Ease in-out, Ease in, Ease out,
  Bounce. The row's ease button (`EaseMenu`) picks one; scene files store it
  by name.
- Nothing outside the slider writes `param.value`. The row keeps its own
  React copy of the value, so an outside writer (a knob, a pad) needs a way
  to tell the row.

## 1. Curve presets

The ease slot is already "the animation curve". New presets are new `Ease`
kinds in the same menu, so there is no new UI.

Pure curves (a function of `t` only, like today):

| Preset  | Curve                                                            |
|---------|------------------------------------------------------------------|
| Explode | A blast wave, one way, once per trip: the value shoots from the start handle to the end handle in the first 3% of the trip, then falls back to the start handle, fast at first and slower later. It never leaves the range and never plays backward. |
| Implode | Explode played backward: a slow build to the end handle, then a snap back to the start handle. |
| Early   | Steps to the end handle at a quarter of the trip. Out and back, this gives a square wave that sits at the end handle three quarters of the time. |
| Late    | Steps at three quarters of the trip: a square wave that sits at the end handle one quarter of the time. |
| Pulse   | Steps up at the half: an even square wave.                       |

Curves with a memory (they need the trip count and a seed, not only `t`):

| Preset  | Curve                                                            |
|---------|------------------------------------------------------------------|
| Random  | A new value between the handles each trip, held for the trip. The value is a hash of the whole trip number and the parameter's seed, so the same time always gives the same value. |
| Drunk   | Smooth value noise along the trips, so the value wanders between the handles and never jumps. Also a hash, so it is repeatable. |

Code change: `easeCurve(kind, t)` becomes `easeCurve(kind, t, trips, seed)`,
or `liveValue` handles Random and Drunk before the triangle fold. The seed
is the parameter's index in `PARAM_KEYS`, so two Random sliders do not move
together.

Video export: `loop.ts` expects a range to be back at its start handle at
the end of the loop. Random and Drunk are repeatable but do not return to
the start, so a loop with them has a visible join. This is acceptable for
now; a later fix can give the hash a period equal to the loop length.

## 2. MIDI knobs

Rule: a knob or fader sets slider positions. Nothing else is mappable.
One control can move several sliders at once (a macro): each slider goes
to the same place along its own span. One slider can also have several
controls.

Transport: the Web MIDI API in the webview (no Rust). Tested 2026-10-16:
WebView2 gives access with no prompt and lists the Launchkey MK4 61. Built
in `src/lib/midi.ts`.

Mapping model:

```ts
/** Per controller name, so the LaunchKey map survives a restart and another device starts clean. */
type MidiMap = Record<string /* device name */, Record<string /* "channel:cc" */, ParamKey[]>>;
```

Stored in `localStorage`, like the export options and the Open dialog state.

Learn: each slider has a MIDI button (a connector icon) at the left of the slider.
A click waits for the next knob or fader move and assigns that control to
the slider. The icon is lit while a control is assigned. An assignment
only adds: a control can move several sliders (a macro: assign the same
control to each slider in turn), and a slider can have several controls.
The icon's tooltip names the slider's controls and the other sliders they
move. While the button waits, an assigned slider shows a remove button; a
right-click on the lit icon removes the controls too.

MIDI panel (`src/components/MidiPanel.tsx`): the MIDI button in the
Designer header opens a panel at the bottom of the window; the panels and
the picture above get shorter. It lists every mapping, one line per
control and setting, with a MIDI icon that lights while the control sends:
"Launchkey MK4 61, Knob 1 <-> Kaleidoscope: Pan X". The setting is a menu
of every mappable setting under group headings, so a row can be pointed at
another setting (`midi.remap`); the X removes the row (`midi.unmapOne`);
Clear all removes every mapping. A Launchkey's controls 21 to 28 on
channel 1 show as knobs 1 to 8; other controls show their CC number.

Knob to value. Every knob move is relative: the first step only takes the
slider over where it is, so nothing jumps and a small turn is never lost.
After that the value moves by value scaling (`scaledStep`): the knob's
travel left in the direction it turns is spread over the value's travel
left in that direction, so the knob's end (0 or 127) always takes the
value to its end. (A soft takeover was tried first: the slider waited
until the knob passed its value, so after a restart a small turn did
nothing. A plain one-to-one move was tried next: after a takeover near the
knob's end, the knob ran out before the value reached its end.)

- Range off: the value moves along the whole slider (`moveValue`). It is
  not rounded to the slider's steps, and a log slider moves in equal ratios.
- Range on: the knob moves the playhead, not the range, between the
  handles (`movePlayhead`). The range stops playing for this value (its handles
  stay, and its clock runs on underneath), and the slider's MIDI icon
  becomes an orange play button. A click on play curves the value back
  into the playing range over 2 seconds (`RESUME_SECONDS`). The curve aims
  at where the range will be when the curve ends, and arrives with the
  range's own speed, so the value joins the range with no jump and no
  change of speed. See `Engine.holdRange`, `resumeRange` and `planResume`.
- Ctrl + knob on a range: the playhead moves along the whole slider. When
  it passes a handle, the handle
  moves with it, so the range grows (`pushPlayhead`, `Engine.stretchRange`).
  The handles from before are kept: the play button gives them back, then
  the value curves into the range as the user set it.
- Submodes: a mapping belongs to a setting, not to a submode, so a shared
  setting (Pan X in every Kaleidoscope submode) follows the control in each
  submode. A setting that the current submode hides (Tile size in Radial)
  has no effect there, so the control leaves it alone (`isShown` in
  `src/engine/submodes.ts`). The submode menu marks the other choices that
  show such a mapped setting with the orange MIDI icon, and the section's
  MIDI dialog says "only in ..." for it.
- Common settings (`src/engine/common.ts`, added 2026-10-20): Pan X, Pan
  Y, Zoom, Rotation and Opacity show under a Common heading at the bottom
  of each effect that has them (Blend shows there too, before Opacity).
  The MIDI button on a common setting assigns the control to that setting
  in every effect at once, as a macro: one knob moves every Pan X. The
  right-click and the remove button take the control off all of them. The
  MIDI panel still lists and edits each setting on its own line.
- Smooth steps: a 7-bit control has only 128 places, and it sends them at
  uneven times. The shown value follows the control like a critically
  damped spring (`Engine.follow`, `MIDI_SMOOTH_SECONDS` = 0.1 s): it speeds
  up and slows down smoothly, as a playing range does. Straight lines from
  step to step were tried first; they still looked jumpy, because their
  speed changed at every step.
- 14-bit controls: set a knob or fader to 14-bit in Novation Components.
  It then sends a coarse part (control 0 to 31) and a fine part (32
  higher), which make one of 16384 places. The app finds such pairs by
  themselves; nothing needs to be set in the app.
- An endless knob in absolute mode stops sending at 0 and at 127, so it
  cannot move the slider further that way. Set it to Relative in Novation
  Components (Encoders custom mode, Advanced, Behaviour). It then sends 64 +
  n for n steps right and 64 - n for n steps left (`relativeMove`, one step
  is 1/127 of the travel). The app finds such a control by itself: a
  control that sends positions never repeats a value, but a relative one
  turned one way does (65, 65, 65). It keeps the finding across restarts
  (`kaleidosage.midi-relative`), and drops it when the control sends a
  value far from 64 again.

Row update: the engine gets a `onParamChange(key)` listener. The MIDI code
writes the param and fires it; `ParamRow` subscribes and copies the new
value into its React state. This is the one structural change the rows
need, and pads use it too.

LaunchKey 61 MK3 facts, for the first test: the eight knobs send CC 21 to
28 on channel 1 in the default custom mode, the nine faders send CC 53 to
61, and the sixteen pads send notes on channel 10 in drum mode.

## 3. Pads

A pad fires one preset on one mapped slider, once. The map is the same
`MidiMap`, keyed `"note:channel:number"`, and its target is a pair:
`{ param: ParamKey, preset: Ease }`.

A shot:

```ts
/** A one-time run of a curve, over the slider's normal motion. */
interface Shot { kind: Ease; from: number; to: number; startClock: number; seconds: number }
```

- `from` is the slider's live value when the pad is pressed. `to` is the end
  handle when the range is on, otherwise the slider's max (min for a pad
  pressed with Shift).
- The shot plays the curve out and back over `seconds` (default 2 s) on the
  real clock, so a pause does not freeze it, then ends. `liveValue` returns
  the shot's value while it runs and the normal value after. The slider is
  never left in a new place.
- A second press restarts the shot from the live value.

## Order of work

1. Pure curve presets (Explode, Implode, Early, Late, Pulse): one afternoon,
   no structural change, tests in `params.test.ts`.
2. `onParamChange` listener and row subscription.
3. MIDI transport test, then learn mode, knob mapping, relative knob moves.
4. Random and Drunk.
5. Pads and shots.
