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

Rule: one knob sets one slider's position. Nothing else is mappable.

Transport: try the Web MIDI API in the webview first (no Rust). If WebView2
blocks it with a permission prompt we cannot answer, use the `midir` crate
in `src-tauri` and emit `midi` events with channel, control number and
value. Decide this with a one-hour test before any UI work.

Mapping model:

```ts
/** Per controller name, so the LaunchKey map survives a restart and another device starts clean. */
type MidiMap = Record<string /* device name */, Record<string /* "channel:cc" */, ParamKey>>;
```

Stored in `localStorage`, like the export options and the Open dialog state.

Learn: a MIDI button in the Designer header turns on learn mode. The user
clicks a slider, then turns a knob; the map is written, and learn mode
turns off. A mapped row shows a small dot by its name; a right click on the
dot clears the map.

Knob to value:

- 0 to 127 maps onto the slider's position space (`toSlider`), then
  `fromSlider`, so a log slider feels even under the knob.
- Range off: the knob sets `value`.
- Range on: the knob slides the whole range, with `shiftRange`, so the two
  handles keep their distance. This is still "position" control; the knob
  never sets a handle on its own. (Open point: or ignore the knob while the
  range is on.)
- Soft takeover: the slider does not move until the knob's value passes
  through the slider's current position (within two steps). A knob that
  rests far from the slider never causes a jump.

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
3. MIDI transport test, then learn mode, knob mapping, soft takeover.
4. Random and Drunk.
5. Pads and shots.
