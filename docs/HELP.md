# Help design: how Kaleido Sage teaches itself

A design note, written 2026-10-18, before any code. The user expects help to
decide whether the app succeeds, so help is a core feature, with its own
design, its own source files and its own tests.

## Goal

A new user makes a first moving scene that reacts to music within five
minutes, with no manual. A returning user finds any feature by name in a
few seconds. A live performer never sees help that they did not ask for.

## Rules

1. **Help at the moment of need.** Each piece of help shows where and when
   the user needs it: an empty list says how to fill it; a panel explains
   itself from its own heading. No long text up front.
2. **Show, then tell.** Where a picture or a short animation explains a
   thing better than words (a range, a threshold, a crossfade), use it.
3. **Never in the way.** Help never covers the picture in full screen, never
   steals the focus, and never shows during a show (while the play controls
   run the music). Every part can be turned off, and stays off.
4. **One source of truth.** Each topic's text lives in one place, and every
   part of help (cards, the help page, the guide) reads it from there.
5. **Plain words.** ASD-STE100 Simplified Technical English: common words,
   short sentences, active voice. Name each control exactly as the screen
   shows it ("Master Threshold", not "the threshold slider").

## What the app has today

- About 110 tooltips (`title=`), most in ControlPanel, AudioPanel and
  MidiPanel. They vary in form: some name the control, some explain it,
  some list a gesture.
- Empty-state lines in five places: no effects, no MIDI controller, no MIDI
  mappings, no audio links, no files.
- Hidden gestures, told only in tooltips: double-click a setting's name to
  reset it; Ctrl + hold a name or a group header for no effect while held;
  right-click a lit MIDI or speaker icon to remove it; Ctrl + drag a range
  handle to mirror it; Ctrl + Tab and keys 1 to 9 for scene tabs.
- A start screen with a title, two lines and three buttons. A Help menu
  with About only. No shortcut list, no guide, no help page.

## The parts, ranked by value for a new user

### 1. First-scene guide (removed 2026-10-19)

Built on 2026-10-18 and then removed: the user found that the right
tutorial flow needs days of work, and set it aside for later. The design
below stays as the starting point. (The build had a header with the step
number and dots, a footer with Previous and Next, and a welcome text for
step 1 from the user: "Welcome to Kaleido Sage. This quick tutorial will
get you up and running in no time.")

A short guide that runs the first time the app starts, after New Scene. It
has five steps; each step points at one control (a soft highlight and a
small card beside it) and waits until the user does the step:

1. Pick a picture: a random photo, a pattern, or your own file (Source).
2. Add an effect (FX, New): the kaleidoscope is a good first one.
3. Turn on a range (the bracket button on a row): the value now moves.
4. Make it move with music: pick an Input, then click a setting's speaker.
5. Play it full screen (F, or double-click the picture).

- A step done before the guide asks for it counts as done.
- Skip (Esc) ends the guide; Help, First-scene guide runs it again.
- The guide never starts again by itself once skipped or done.

### 2. Empty states that teach

Every empty place says, in one sentence, how to fill it, with one button
that does it. Rule: an empty list never shows only "No items".

| Place | Text | Button |
|---|---|---|
| FX, no effects | Add an effect to change the picture. | New effect |
| Audio sensors, no links | Click the speaker beside a setting to make it move with the sound. | Show speakers (only while they are hidden) |
| Files, no files | Add audio files to play them one after the other. | Add File(s) |
| MIDI, no mappings | Click Learn, then move a knob or fader. | Learn |
| MIDI, no controller | Connect a MIDI controller; it shows here at once. | (none) |
| Input is Nothing (Levels) | Pick an Input to make settings move with the sound. | (none: the Input menu is right above) |

### 3. Panel help cards

A small "?" button at the right of each panel heading (FX, each effect
group, Source, Audio tab columns, MIDI tab) opens a card under it:

- What the panel does, in one or two sentences.
- Up to eight tips, one per line. Each tip tells one thing: one button, one
  key or one gesture of that panel.
- A link, "More", that opens the topic in the help page (part 4).

The card closes on Esc, a click outside it, or a second click on "?".
Help, Hide help buttons removes every "?" (for a live performer).

### 4. Help page (F1)

A side panel (or a window) with a search box and a list of topics, one
topic per panel and per idea. F1 opens it at the topic of the panel that
has the focus or the mouse. Each topic: a short text, a picture or short
animation where it helps, and the controls it names as links that point
at them in the app.

First topics:

- Scenes, tabs, crossfades (keys 1 to 9, Ctrl + Tab)
- Source: images A and B, patterns, random and searched photos, video
- FX: adding, ordering (drag), removing, random, nudge, lock, solo
- A setting's row: value, range, reverse, easing, own time, reset, bypass
- Audio: Input kinds, Master Gain, Master Threshold, Levels
- Audio sensors: what follows what, Threshold, Range, Release, beats
- MIDI: Learn, mapping, relative knobs, 14-bit controls, holds and play
- Playlists: what a playlist holds, Save Playlist, Export Scene As
- Full screen, PNG and video export
- Keyboard shortcuts (part 5)

### 5. Keyboard shortcuts sheet

Help, Keyboard Shortcuts (and the "?" key) opens one sheet with every key
and mouse gesture, in groups (Scenes, Play, View, Edit, Settings rows,
MIDI). The sheet reads the same list that the menus use, so it never goes
out of date.

### 6. One form for tooltips

Every tooltip has the same form, which the help source can check:

`<Name>: <what it does, one sentence>. <Gesture or key, if any>.`

For example: "Release: how long a setting takes to fall back after a hit.
Drag to change; double-click to reset." The current tooltips move to this
form panel by panel.

Done in part (2026-10-19): the tooltips no longer pop up. Each control
gives its tip as `data-tip` (not `title`), and the help line, a one-line
panel at the bottom of the window, shows the tip of the control under the
mouse (`src/components/HelpLine.tsx`). The tips do not have the one form yet.

### 7. Idea explainers

Three ideas need a picture more than words, and get a small animation in
their help topic and their panel card:

- **Range:** a value that moves between two handles over the scene length.
- **Audio sensor:** a level line rising over the Threshold, the setting
  moving by its Range, and falling back over its Release.
- **Scene and playlist scope:** a playlist holds copies of its scenes; the
  scene files on disk stay as they are.

### 8. What's new

After an update, one small card at the start lists the new features in one
line each, with a link to each topic. It shows once per version.

## Where help lives in the code

- `src/help/topics.ts`: every topic, keyed by id (`"audio.sensors"`,
  `"row.range"`): title, text, tips, related controls, keywords for search.
- `src/help/guide.ts`: the first-scene guide's steps (topic, target
  control, the check that tells the step is done).
- Controls mark themselves with `data-help="audio.sensors"`, so a card, the
  F1 page and the guide can find and point at them.
- A test checks that every topic id that a control names exists, that
  every panel heading has a topic, and that each tooltip has the form of
  part 6.
- `localStorage` keeps what the user turned off and what the guide has
  done (`kaleidosage.help`).

## Order of work

1. Topic source (`src/help/topics.ts`), the `data-help` marks, and the
   test. Nothing shows yet; this is the base for every other part. Done
   2026-10-18: 13 topics, 14 marks, `src/help/topics.test.ts`.
2. Empty states (part 2): small, and high value at once. Done 2026-10-18:
   `src/components/EmptyState.tsx`; the speakers' on and off moved to
   `src/lib/settingButtons.ts`, so the Audio panel can turn them on.
3. Keyboard shortcuts sheet (part 5). Done 2026-10-18: the list is
   `src/help/shortcuts.ts` (keys and mouse gestures), the sheet is
   `src/components/ShortcutsDialog.tsx`, and a test checks that every menu
   shortcut is in the list.
4. Panel help cards (part 3), with Help, Hide help buttons. Done
   2026-10-18: `src/components/HelpButton.tsx` on the Source, FX, open
   effect, tabs, play controls, Audio (Source, Levels, Files, Audio
   sensors) and MIDI headings; the "?" also hides while Files play.
   `src/lib/helpSettings.ts` keeps the choice. Since 2026-10-19 a first
   run has the badges off; Help, Show Help Buttons turns them on. The
   badges are green circles with a black "?", fixed to each panel's
   top-right corner. The "More" link waits for the help page (step 6).
5. First-scene guide (part 1). Built 2026-10-18, removed 2026-10-19 (see
   part 1); later.
6. Help page with search (part 4).
7. Tooltip form (part 6), panel by panel.
8. Idea explainers (part 7), then What's new (part 8).

## Open questions

- Help page: a side panel in the main window, or a window of its own (it
  could then stay open on a second screen during a show)?
- Pictures in topics: drawn as SVG in the app, or short screen recordings?
- Should the guide build a real scene that the user keeps, or a practice
  scene that closes at its end?
