# One file type: .ksage holds the whole show

A design note, written 2026-10-25, before any code. Built the same day:
steps 1 to 10 are done (step 4, the conversion of the user's files, is
`tools/convert-files/`; the user runs it). Changes from the text
below (decided with the user the same day): the file is a "project" in
the UI; the File menu has New Project, Open Project, Save Project, Save
Project As, Close Project, then Add Blank Scene, Import Scene(s), Export
Scene and Remove Scene, and there is no Scene menu. Open Project always
puts the project in place of the open one; Import Scene(s) adds all
scenes of each picked project (KS Scene or KS Playlist in the dialog's
Type column), without their audio files or audio settings. The Open
dialog previews a KS Scene in place (`read_file_scene`, no unpack). It replaces the two file types (a `.ksage` scene and a `.ksplaylist`
playlist) with one: a `.ksage` file holds one or more scenes, and the
audio files and audio settings when there are any. Decisions marked
"(decided)" came from the user on 2026-10-25.

## What the app does today

- A `.ksage` file holds one scene. It is plain JSON, or a ZIP with
  `scene.json` and the scene's videos (`src-tauri/src/scene_archive.rs`).
  Each tab owns its own file (`SceneDoc.path` in `src/App.tsx`).
- A `.ksplaylist` file is a ZIP with `playlist.json` (audio settings,
  selected tab, Files width, track lengths, Song follow), a copy of each
  scene (`scenes/<n>/<name>.ksage`), each track (`tracks/<n>/<name>`) and
  each song analysis (`src-tauri/src/playlist_archive.rs`,
  `src/lib/playlistFile.ts`).
- In an open playlist, the scenes are the playlist's: Ctrl+S saves the
  playlist, Save Scene becomes Export Scene As, a tab closes with no
  question, and "Save changes?" asks once, for the playlist.
- Outside a playlist, a new or opened scene empties the track list and
  sets the input to Nothing (`quietOutsidePlaylist`), because only a
  playlist can keep tracks.
- A playlist keeps its tracks even when the input is not Files at the
  save. The user does not want this (see Audio files in the file).
- The three-column layout (Files, scene list, Source and FX) does not
  follow the audio links. It shows when Files is the audio input, or when a
  playlist is open (`sceneListMode`, `App.tsx` line 2269). With neither,
  the scenes show as tabs. The audio links are in each scene already.
- No Windows file association exists in `tauri.conf.json`, so the
  installer does not change.

## The new model

- The open document is the file. It holds one or more scenes in order,
  and, when Files is the input, the tracks and their song analyses. It
  also keeps the audio settings, the Files width and Song follow. A
  single scene is a file with one scene in it.
- The playlist code becomes the only save and open path. The one-scene
  save path (`saveScene` writing the user's file) goes away, except as
  Export Scene As.
- The UI does not need a new word. The file is "a Kaleido Sage file".
  "Scene" stays the word for each part inside it. "Playlist" goes from the
  menus and the help; the Files card keeps its own name for the list of
  tracks.
- A file with 2 or more scenes, or with audio files, is a show. A file
  with one scene and no audio files is a single scene. Both have the same
  layout on disk; the difference matters only to Open (see Open).
  (decided)

## File format

- A `.ksage` is a ZIP64 archive, entries stored, the same layout as a
  `.ksplaylist` today, with one change: the manifest is `kaleidosage.json`
  with `"kind": "file"` and `"version": 1`.
- The scenes inside stay in today's scene layout
  (`scenes/<n>/<name>.ksage`, plain JSON or a ZIP with its videos), so the
  scene reader does not change. A scene inside a file is never a file of
  many scenes.
- The app reads only this layout. A file without `kaleidosage.json` gives
  "The file is not a Kaleido Sage file." The app has no code for old
  one-scene files or for `.ksplaylist` files: a one-time conversion
  changes the user's files first (see Conversion). (decided)

## Conversion (one time, before the new app opens the files)

The user is the only user of the app. So the app does not support the old
files; a one-time program converts every file in `D:\Images\Kaleido Sage`
(45 scene files and `Robert Mirabelle.ksplaylist`, 2026-10-25). (decided)

1. Back up first: copy all 46 files, as they are, to
   `D:\Images\Kaleido Sage backup 2026-10-25\`. Check that each copy has
   the same size as its original. (decided)
2. Each old scene `X.ksage` becomes a new `X.ksage`: `kaleidosage.json`
   (input Nothing, selected scene 0) and `scenes/0/X.ksage`, the old
   file's bytes as they are.
3. `Robert Mirabelle.ksplaylist` becomes `Robert Mirabelle.ksage`: its
   `playlist.json` becomes `kaleidosage.json` (kind "file"), and every
   other entry is copied as it is, with no decode. Then the
   `.ksplaylist` is deleted (the backup keeps a copy). (decided)
4. Each new file is written to a temp file beside it, read back to check
   it, then put in place of the old one.
5. The program prints one line per file and a total. It runs once, then
   it is deleted from the repository.

The program is a small Rust program (`tools/convert-files/`), with the
`zip` and `serde_json` crates that the app uses. It runs when the new app
code can open the new layout (after step 3 of the order of work), and
only with the user's go-ahead. Note: the installed Kaleido Sage 0.13
cannot open the converted files. The backup can.

## Audio files in the file (decided)

- Save keeps the tracks only when the input is Files at the time of the
  save. With any other input (Nothing, PC sound, Microphone), Save first
  empties the track list in the app, and then saves the file with no
  tracks and no song analyses.
- So a track list that stays in the app from an earlier Files input never
  goes into the file by accident.
- The audio settings (input, device, gain, threshold) are always saved.

## Open (decided)

- On the start screen (no file open), Open opens the picked file, show or
  single scene. It becomes the open file, and Save writes to it.
- With a file open:
  - A show (2 or more scenes, or audio files) replaces the open file,
    after one "Save changes?" for the open file.
  - A single scene goes into the open file as a new scene, after the
    others. The open file counts as changed. The single scene's own file
    on disk does not change.
- Several files picked at once: the single scenes go in one after the
  other. If a show is among them, it opens alone, as a playlist does now.
- So Open also does the work of Import; there is no Import menu item.

## Menus and keys

| Today | New |
| --- | --- |
| Playlist > Open Playlist, Scene > Open Scene (Ctrl+O) | File > Open… (Ctrl+O), see Open |
| Playlist > Save Playlist, Scene > Save Scene (Ctrl+S) | File > Save (Ctrl+S) |
| Save Playlist As, Save Scene As (Ctrl+Shift+S) | File > Save As… (Ctrl+Shift+S) |
| Playlist > Close Playlist | File > Close |
| (none) | File > New: a new, untitled file with one blank scene |
| Scene > New Scene (Ctrl+N) | Scene > New Scene (Ctrl+N): a blank scene in the open file |
| Export Scene As | Scene > Export Scene As… (a file with that one scene) |
| Close Scene (Ctrl+W) | Scene > Remove Scene (Ctrl+W), no question; the file counts as changed |

The start screen gets "New" and "Open". The Playlist menu goes.

## Behavior changes

- `quietOutsidePlaylist` goes. File > New, File > Close and opening a
  file on the start screen empty the tracks and set the input to Nothing,
  as today, unless the opened file has tracks. New Scene and a single
  scene that goes into the open file keep the tracks and the input.
- One unsaved mark, for the file. It counts each scene's changes (as
  `playlistUnsaved` does today) and the file's own: scene order, tracks,
  audio settings, Files width, Song follow, song map edits. The scenes do
  not get dots of their own. (decided)
- Closing the window asks once, for the file.
- The title bar shows "Night Show.ksage › Scene 2". A file that was never
  saved shows "Untitled".
- Save As asks for a name. The default is the file's name, or the first
  scene's name for a new file.
- Rename (scene list or tab) renames the scene inside the file. The file
  counts as changed.
- Save skips a new blank scene with no changes, as Save Playlist does now.
  A changed scene with no source A stops the save with a message that
  names the scene.

## Layout (decided)

The scene list (three columns) shows only while Files is the input. With
any other input, the scenes show as tabs, also for a show with many
scenes. `sceneListMode` becomes `tracksActive`.

## Costs and risks

- Save speed: each Save writes the whole archive again, with every scene,
  video and track. For a one-scene file with no tracks this is about the
  same as today. For a large show it is the same as Save Playlist today.
  A later step can copy unchanged entries from the old archive with
  `raw_copy_file`, which does not decode them, but still writes them.
- Open speed: today a one-scene file with a video opens in place, and the
  video streams from inside it. A new file unpacks to the temp folder
  first, so a large video is copied before the scene shows
  (`Imagine.ksage` is 39 MB; `Robert Mirabelle` is 380 MB). Option for a
  later step: stream the stored scene and track entries from inside the
  archive at their offsets, as `scene_archive.rs` does for videos now.
  Then nothing is unpacked.
- Video handles: a scene with an embedded video streams it from the
  scene's copy in the temp folder. Save writes that copy again while the
  video plays from it. Test that the video keeps playing after a Save,
  and that a second Save works.
- Disk space: each open file keeps an unpacked copy in the temp folder, as
  playlists do now. The app clears old copies at the start and at the next
  Open.
- Dev reload keeper: `reloadKeeper.ts` keeps the tabs and their paths but
  not the playlist path. It must keep the file's path and saved
  fingerprint too, or a dev reload loses the file.
- Song follow picks follow scene positions (`songFollow.moveScenes`). A
  scene that goes into the open file, and Remove Scene, must keep them
  right, as tab moves and closes do now.
- Save with an input other than Files empties the track list. A user who
  switched the input for a moment loses the list in the app. The backup
  and the last saved file still have it.

## Order of work

Each step is a commit, with tests passing, before the next.

1. Rust: rename `playlist_archive.rs` to `file_archive.rs` (commands
   `save_file`, `open_file`, `read_file_summary`), with the new manifest
   name and kind. Tests. Remove `is_playlist_path`; `is_scene_path` stays
   for `.ksage`.
2. TS: `src/lib/playlistFile.ts` becomes `src/lib/kaleidoFile.ts`, with
   the new manifest, a `isShow(summary)` test (2 or more scenes, or
   tracks), and tests.
3. App state: one file path and one saved fingerprint (from
   `playlistPathRef` and `playlistSavedRef`). `SceneDoc.path` becomes the
   scene's copy in the temp folder, never a user file. Save follows the
   Audio files rule.
4. Conversion: write the program, run it with the user's go-ahead (backup
   first), then delete it.
5. Open rules, menus, keys, start screen, title bar, "Save changes?" and
   window close. Remove `quietOutsidePlaylist`, the Playlist menu, and
   `saveScene` as a save (keep it as Export Scene As).
6. Remove Scene and single scenes into the open file, with Song follow
   picks.
7. Layout rule: `sceneListMode = tracksActive`.
8. Open dialog: one kind for `.ksage`; the preview reads the summary and
   shows the scene or the show card.
9. Reload keeper keeps the file.
10. Docs and help: `docs/RULES.md` (Scene files), `docs/AUDIO.md` part 8,
    `src/help/topics.ts` (the playlist topic), `tools/test-ui.mjs`,
    `CLAUDE.md` layout line.
11. Later, if needed: stream from inside the archive (no unpack), and raw
    copy of unchanged entries on Save.

## Checks the user does in the app

- After the conversion: open `Robert Mirabelle.ksage` and a few scene
  files. Each opens with its scenes, tracks and settings.
- Save each one. Open it again. Nothing is lost.
- Save a scene with a video while it plays, then save again.
- With a show open, open a single scene: it goes in as a new scene. Open
  another show: it replaces the open one, after one question.
- Switch the input from Files to Nothing, save, open the file again: no
  tracks.
- New, New Scene, Remove Scene, Rename, reorder. The unsaved mark and
  "Save changes?" are right after each.
- Close the window with changes: one question.

## Open questions

None now. All questions from the first draft have answers above.
