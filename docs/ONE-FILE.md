# One file type: .ksage holds the whole show

A design note, written 2026-10-25, before any code. Nothing here is built
yet. It replaces the two file types (a `.ksage` scene and a `.ksplaylist`
playlist) with one: a `.ksage` file holds one or more scenes, and the
audio files and audio settings when there are any.

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
- The three-column layout (Files, scene list, Source and FX) does not
  follow the audio links. It shows when Files is the audio input, or when a
  playlist is open (`sceneListMode`, `App.tsx` line 2269). With neither,
  the scenes show as tabs. The audio links are in each scene already.
- No Windows file association exists in `tauri.conf.json`, so the
  installer does not change.

## The new model

- The open document is the file. It holds one or more scenes in order,
  the tracks (zero or more), the audio settings, the Files width and Song
  follow. A single scene is a file with one scene in it.
- The playlist code becomes the only save and open path. The one-scene
  save path (`saveScene` writing the user's file) goes away, except as
  Export Scene As.
- The UI does not need a new word. The file is "a Kaleido Sage file".
  "Scene" stays the word for each part inside it. "Playlist" goes from the
  menus and the help; the Files card keeps its own name for the list of
  tracks.

## File format

- A new `.ksage` is a ZIP64 archive, entries stored, the same layout as a
  `.ksplaylist` today, with one change: the manifest is `kaleidosage.json`
  with `"kind": "file"` and `"version": 1`.
- The scenes inside stay one-scene files (`scenes/<n>/<name>.ksage`, plain
  JSON or a ZIP with its videos), so the scene reader does not change. A
  scene inside a file is never a file of many scenes.
- The app finds the layout from the bytes, not from the extension:
  1. Starts with `{`: an old one-scene file (JSON).
  2. A ZIP with `scene.json`: an old one-scene file with videos.
  3. A ZIP with `kaleidosage.json`: a new file.
  4. A ZIP with `playlist.json`: an old playlist (whatever its extension).
  5. Anything else: "The file is not a Kaleido Sage file."
- One new Rust command, `file_layout(path)`, returns which of these it is.
  `is_playlist_path` stays only to list old `.ksplaylist` files.

## Old files

- An old one-scene `.ksage` opens as a file with one scene. Its path stays
  the file's path. The next Save writes the new layout over it.
- An old `.ksplaylist` opens as today. Its path stays until the first
  Save, which asks for a new name with `.ksage` (the default is the same
  name). The old `.ksplaylist` stays on disk; the app never deletes it.
- The Open dialog lists `.ksage` and `.ksplaylist` files.
- Risk: Kaleido Sage 0.13 and older cannot open a file in the new layout.
  A user who saves an old scene in the new version cannot open it in an
  old version. This is acceptable for a single-user app, but the release
  notes must say it.

## Menus and keys

| Today | New |
| --- | --- |
| Playlist > Open Playlist, Scene > Open Scene (Ctrl+O) | File > Open… (Ctrl+O) |
| Playlist > Save Playlist, Scene > Save Scene (Ctrl+S) | File > Save (Ctrl+S) |
| Save Playlist As, Save Scene As (Ctrl+Shift+S) | File > Save As… (Ctrl+Shift+S) |
| Playlist > Close Playlist | File > Close |
| Scene > New Scene (Ctrl+N) | File > New (Ctrl+N): a new file with one blank scene |
| (none) | Scene > Add Scene: a blank scene in the open file |
| Open several scenes at once | Scene > Import Scenes…: adds the scenes of other files to the open file |
| Export Scene As | Scene > Export Scene As… (a one-scene file) |
| Close Scene (Ctrl+W) | Scene > Remove Scene (Ctrl+W), no question; the file counts as changed |

The start screen gets "New" and "Open". The Playlist menu goes.

## Behavior changes

- Open replaces the open file, after one "Save changes?" for the file.
  To combine files, the user uses Import Scenes.
- `quietOutsidePlaylist` goes. File > New and File > Close empty the
  tracks and set the input to Nothing, as today. Add Scene and Import
  Scenes keep the tracks and the input.
- One unsaved mark, for the file. It counts each scene's changes (as
  `playlistUnsaved` does today) and the file's own: scene order, tracks,
  audio settings, Files width, Song follow, song map edits. Each scene in
  the list can keep its own dot, so the user sees which scenes changed.
- Closing the window asks once, for the file.
- The title bar shows "Night Show.ksage › Scene 2". A file that was never
  saved shows "Untitled".
- Save As asks for a name. The default is the file's name, or the first
  scene's name for a new file.
- Rename (scene list) renames the scene inside the file. The file counts
  as changed.
- Save Scene asked "There is no source image" for a scene with no image.
  Save of the file skips a new blank scene with no changes, as Save
  Playlist does now; a changed scene with no source A stops the save with
  a message that names the scene.

## Layout (open question)

`sceneListMode` is `tracksActive || playlistPath !== null` now. With one
file type, every saved file has a path, so the rule must change. Options:

1. List when Files is the input, or when the file has 2 or more scenes;
   tabs for a single scene with no tracks. (Recommended.)
2. List only when Files is the input; tabs otherwise.
3. Always the list.

## Costs and risks

- Save speed: each Save writes the whole archive again, with every scene,
  video and track. For a one-scene file with no tracks this is about the
  same as today. For a large show it is the same as Save Playlist today.
  A later step can copy unchanged entries from the old archive with
  `raw_copy_file`, which does not decode them, but still writes them.
- Open speed: today a one-scene file with a video opens in place, and the
  video streams from inside it. A new file unpacks to the temp folder
  first, so a 2 GB video is copied before the scene shows. Option for a
  later step: stream the stored scene and track entries from inside the
  archive at their offsets, as `scene_archive.rs` does for videos now.
  Then nothing is unpacked.
- Video handles: an old one-scene file with an embedded video streams it
  from the user's file. The first Save writes the scene's copy to the temp
  folder and then replaces the user's file. Test that the video keeps
  playing after that Save, and that a second Save works.
- Disk space: each open file keeps an unpacked copy in the temp folder, as
  playlists do now. The app clears old copies at the start and at the next
  Open.
- Dev reload keeper: `reloadKeeper.ts` keeps the tabs and their paths but
  not the playlist path. With one file type, it must keep the file's path
  and saved fingerprint too, or a dev reload loses the file.
- Song follow picks follow scene positions (`songFollow.moveScenes`).
  Import Scenes and Remove Scene must keep them right, as tab moves and
  closes do now.

## Order of work

Each step is a commit, with tests passing, before the next.

1. Rust: `file_layout`, the new manifest name, read old `playlist.json`
   too. Rename `playlist_archive.rs` to `file_archive.rs` (commands
   `save_file`, `open_file`, `read_file_summary`). Tests for each layout.
2. TS: `src/lib/playlistFile.ts` becomes `src/lib/kaleidoFile.ts`, with
   the new manifest and tests. Keep `readManifest` reading the old kind.
3. App state: one file path and one saved fingerprint (from
   `playlistPathRef` and `playlistSavedRef`). `SceneDoc.path` becomes the
   scene's copy in the temp folder, never a user file. Open of an old
   one-scene file goes through the same path (a one-scene file).
4. Menus, keys, start screen, title bar, "Save changes?" and window close.
   Remove `quietOutsidePlaylist`, the Playlist menu, `saveScene` as a
   save (keep it as Export Scene As).
5. Import Scenes and Remove Scene, with Song follow picks.
6. Layout rule (from the open question).
7. Open dialog: one kind for `.ksage` and `.ksplaylist`; the preview reads
   `file_layout` and shows the scene or the summary card.
8. Reload keeper keeps the file.
9. Docs and help: `docs/RULES.md` (Scene files), `docs/AUDIO.md` part 8,
   `src/help/topics.ts` (the playlist topic), `tools/test-ui.mjs`,
   `CLAUDE.md` layout line.
10. Later, if needed: stream from inside the archive (no unpack), and raw
    copy of unchanged entries on Save.

## Checks the user does in the app

- Open an old one-scene file (JSON), an old one with a video, and an old
  playlist. Each opens with its scenes, tracks and settings.
- Save each one. Open it again. Nothing is lost.
- Save an old scene with a video, keep playing, save again.
- New, Add Scene, Import Scenes, Remove Scene, Rename, reorder. The unsaved
  mark and "Save changes?" are right after each.
- Close the window with changes: one question.

## Open questions

1. The layout rule (see Layout).
2. Should Open add the scenes when the open file is a new, untitled file
   with no changes, as opening a scene into an empty untitled tab does
   now? (Recommended: yes.)
3. Does a scene inside a file need its own unsaved dot, or is the file's
   mark enough?
