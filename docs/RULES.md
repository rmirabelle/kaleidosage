# Kaleido Sage business rules

Each rule is one short sentence about what the app does for the user.
The rules follow the code on branch `follow-the-song` (2026-10-21).
Where a doc in `docs/` and the code disagree, the rule follows the code.

## Start-up

- A splash window of 520 × 270 px opens at the center of the screen.
- The splash has no taskbar button.
- The splash stays for at least 3 seconds.
- The main window stays hidden until the picture engine runs or fails.
- After 15 seconds, the main window shows in all cases.
- The main window takes the focus when it shows, and the splash closes.
- A page reload does not take the focus.
- The app starts on the large checkerboard pattern with every effect off.
- The first scene has no unsaved changes.
- The app gets its version and checks for an update at start-up.

## Window

- The main window opens at 1280 × 800 px.
- The main window is at least 640 × 420 px.
- The app draws its own title bar and window buttons.
- You drag the title bar to move the window.
- A double-click on the title bar maximizes or restores the window.
- The title bar shows the app name, the playlist name, "›" and the scene name.
- A red asterisk in the title bar shows unsaved changes.
- The app keeps the window size, position and maximized state between runs.
- The app always starts in a window, never in full screen.
- Only one copy of the app runs.
- A second start brings the open window to the front.
- The app is DPI-aware on each monitor.
- The right-click menu of the page works only in text fields and selectable text.
- A crash shows the error and a Reload button.
- The cursor hides over the picture after 2 seconds with no mouse movement.

## Start screen

- The start screen shows at start-up and covers the work area.
- It shows the logo, the name, "Visual FX Playground", the author and the version.
- It has two buttons: New Scene and Open Scene/Playlist.
- An image that you drop or paste on it starts a scene in a new tab.
- It closes when you start or open a scene, an image or a playlist.
- It shows again when you close the last scene or the playlist.
- On the start screen, only Ctrl+O, Ctrl+N and "?" work, and Esc and F11 leave full screen.
- On the start screen, the save, close, undo, redo and View items are off.
- The start screen hides the panels, the tabs, the bottom panel and the help line.
- The picture stops under the start screen, the Open dialog and the Export Video dialog.

## Menus

- The menu bar has six menus: File, Playlist, Scene, Edit, View and Help.
- While a menu is open, pointing at another menu opens it.
- A click outside, Esc or a loss of focus closes a menu.
- File has Open Image or Video, Save PNG, Export Video and Exit.
- Exit closes the window, so the unsaved-changes question can show.
- Playlist has Open, Save, Save As and Close Playlist.
- Close Playlist works only while a playlist is open.
- Scene has New, Open, Save, Save As and Close Scene.
- In an open playlist, Export Scene As replaces Save Scene and Save Scene As.
- Edit has Undo and Redo.
- View items change their label between "Hide" and "Show".
- Help has Keyboard Shortcuts, Enable or Disable Pointers, and About.
- A right-click menu stays inside the window.
- A click outside, Esc, a resize or a loss of focus closes a right-click menu.

## Keyboard shortcuts

- Ctrl+N starts a new scene in a new tab.
- Ctrl+O opens the Open dialog.
- Ctrl+S saves the scene, or the playlist when a playlist is open.
- Ctrl+Shift+S saves the scene as a new file, or exports a copy in a playlist.
- Ctrl+W closes the scene.
- Ctrl+Z undoes a change.
- Ctrl+Y and Ctrl+Shift+Z redo a change.
- In a text field, Ctrl+Z and Ctrl+Y act on the text.
- Ctrl+Tab and Ctrl+Page Down select the next tab.
- Ctrl+Shift+Tab and Ctrl+Page Up select the tab before.
- Tab selection goes round from the last tab to the first.
- Keys 1 to 9 select the tab with that number.
- Space plays or pauses the scene, not the music.
- Space first takes the focus from the focused control.
- Shift+Space stops the scene.
- F, F11 and a double-click on the picture turn full screen on or off.
- Esc leaves full screen.
- Esc first plays the ranges that MIDI stopped, if there are any.
- H shows or hides the panels.
- A opens or closes the Audio panel.
- M opens or closes the MIDI panel.
- P shows or hides the Performance panel.
- O opens an image or video for source A.
- S saves the picture as a PNG.
- X gives new random settings.
- N nudges every unlocked setting.
- "?" opens the shortcuts sheet, but not in a text field.
- Ctrl+V with an image on the clipboard loads it into source A.
- Keys without Ctrl do nothing while a menu or text field has the focus.
- The app ignores keys pressed with Alt or the Windows key.
- Shortcuts do not work while a dialog is open.

## Scene tabs

- Each open scene has its own tab and its own Undo history.
- A new scene is "Untitled Scene", then "Untitled Scene 2", with the lowest free number.
- A saved scene's tab shows its file name.
- The tab tooltip shows the full path.
- A tab with unsaved changes shows a red asterisk.
- The app checks for unsaved changes twice a second.
- You drag a tab to move it.
- Tabs that do not fit go on to more rows.
- The X on a tab or a middle click closes it. --- remove middle click
- The scenes play in tab order.
- In a playlist, or with Files as the input, the scenes show as a list, not tabs.
- A tab switch crossfades to the new scene over 1.5 seconds. --- I'd like to extend or consider other crossfade options
- While paused, a tab switch cuts at once.
- The new scene starts from 0 and keeps the play or pause state of the scene before.
- A tab switch ends the MIDI holds, bypass and solo of the scene before.
- New Scene makes a tab with the large checkerboard and every effect off.
- Outside a playlist, a new or opened scene sets the input to Nothing.
- Outside a playlist, a new or opened scene empties the track list.
- Opening a scene that is already open selects its tab.
- An opened scene replaces the selected tab if that tab is an unchanged untitled scene.
- Each of several opened scenes gets its own tab, and the last one shows.
- A playlist among the picked files opens alone.
- A long open shows a spinner, the step and a progress bar.
- The app does not save a scene to a file that is open in another tab.
- When you close a tab, the tab next to it shows.

## Unsaved changes

- Closing a changed scene asks: Save, Don't save or Cancel.
- In a playlist, Close Scene does not ask.
- Closing the window asks about each changed scene, the selected one first.
- With a playlist open, closing the window asks once, for the playlist.
- Opening a playlist asks about all unsaved changes first.
- Close Playlist asks about the playlist's changes first.
- Installing an update asks about all unsaved changes first.
- Cancel stops the action.
- Don't save goes on without saving.
- In a confirm dialog, Enter pushes the focused button, or else the confirm button.
- Esc or a click outside a confirm dialog cancels it.

## Play, Stop and Hold

- A new scene starts playing.
- Stop pauses the scene and puts every range at its start.
- The Stop button is off while the scene is paused.
- The scrub bar moves through the scene Length in 1000 steps.
- The countdown and the HOLD button show only with two or more scenes.
- The countdown turns yellow at 10 seconds and red at 5 seconds.
- The countdown is gray while Hold is on or no scene comes next by itself.
- With two or more scenes, a mouse or key edit turns Hold on.
- A settings change within 10 seconds of a click, drag, key or wheel counts as an edit.
- MIDI moves do not turn Hold on.
- A press in the Source and FX column turns Hold on, but not in the play toolbar.
- A message tells you how to go on when Hold comes on.
- A click on Hold, a save, a playlist save or a tab click turns Hold off.
- With one scene, Hold is off and hidden, also with Song follow on: the song plays from start to end.

## Full screen and panels

- Full screen hides the title bar, menus, tabs, scene list and help line.
- Full screen hides the panels, and leaving full screen shows them again.
- In full screen, a Settings button and an Exit full screen button show.
- Those two buttons hide while the cursor is idle and the panels are hidden.
- The Full screen button shows only while the mouse is over the picture.
- Closing the last scene or the playlist leaves full screen first.
- Hiding the panels hides the left side: panels, scene list and Playlist column.
- The open effect group stays open when the panels hide and show.
- Hide Playlist works only with Files as the input and the panels shown.
- The Playlist column is 200 to 720 px wide, and 300 px by default.
- The bottom panel starts closed, on the Audio tab.
- The key of the tab that shows closes the bottom panel.
- You drag the top edge of the bottom panel to change its height.
- The bottom panel is 120 px to 70% of the window high, and 230 px by default.
- The app opens the Audio tab with a tip when you need an audio input.

## Status messages

- A status message stays for 2.5 seconds.
- An error stays until you close it.
- You can select and copy the text of an error.
- After a PNG or video save, the message has a Show button that opens the folder.
- The PNG message stays 5 seconds, and the video message stays 8 seconds.
- While you drag a file over the window, the app says "Drop the image or video here".

## Performance panel

- The Performance panel updates 4 times a second.
- It rates the frame rate: Smooth from 55 fps, Fair from 30 fps, Slow below.
- It shows ms per frame and the slowest frame.
- It charts the last 30 seconds of frame rate against the screen refresh rate.
- Pointing at the chart shows the fps at that time.
- It shows estimated GPU memory, JS memory, CPU time and GPU time per frame.
- The JS memory meter turns orange above 60% and red above 85%.
- Without a GPU timer, GPU time shows "Not shown".
- It shows the GPU time of each drawing step in a fixed order.
- It shows the picture size, blur samples and shape versions per pixel.
- While the picture follows the song, it shows output delay, jitter and jumps.
- It says "Resting" when the app is paused and does not draw.
- The GPU timer runs only while the panel is open.

## Help

- The shortcuts sheet lists every key and gesture in eight groups.
- Esc, "?", Close or a click outside closes the shortcuts sheet.
- Pointer tips stay inside the window and do not cover each other.
- The help line shows the tip of the control under the mouse or with the focus.
- With no tip, the help line says "Point at a control to see what it does."
- The help line hides in full screen, on the start screen and with hidden panels.
- An empty list shows one sentence on how to fill it.
- Esc in a menu, card or sheet does not also leave full screen.

## Effects list

- The app has 17 effects.
- The list is empty at start-up.
- The first effect in the list acts first, and each next one works on its result.
- A shape effect (Warp, Algorithm, Kaleidoscope) moves the picture made before it.
- The Seamless and Droste spirals always move the point last.
- The New button adds an effect at the end of the list and opens it.
- The New button is off when all 17 effects are in the list.
- The Add menu shows added effects dimmed and does not let you pick them.
- The Add menu shows a preview with a note and thumbnails.
- For an effect with types, the preview shows each type in turn, 1 second each.
- A new effect starts with a strength that shows.
- Start strengths are: Trails 0.85, Time smear 1, Relief 0.6, Light rays 1.5, others 1.
- Adding Blur with no blur sets the blur to 20.
- Adding a Noise warp with no warp sets strength 0.5 and size 2.
- Adding Algorithm sets Mix and Opacity to full.
- Adding Algorithm changes a Power map at power 1 to power 2.
- Adding the Kaleidoscope starts Pan X and Pan Y looping.
- Adding Contours with no lines sets black lines, 16 levels and 1.5 px width.
- The X button takes an effect out of the list and keeps its settings.
- You drag a group by its grip to change the order, and the picture changes live.
- An effect at strength 0, or a shape effect at opacity 0, is skipped.
- Camera shows its view while on, also at opacity 0.
- Particles and Pixel sort do nothing on a GPU without float textures.
- Each shape effect has an Opacity from 0 to 1.
- Each shape effect has one of 8 blends: normal, screen, multiply, overlay, difference, lighten, darken, add.

## Effect groups

- Only one effect group is open at a time.
- A click on the open group header closes it.
- Ctrl + hold on a header bypasses the effect.
- Ctrl+Shift + hold on a header solos the effect.
- Bypass or solo ends on release, loss of focus or a hidden app.
- A header right-click gives Enable/Disable, Lock/Unlock and Remove MIDI mappings.
- A disabled group keeps its settings and shows them dimmed.
- Remove MIDI mappings asks you to confirm and lists each control.
- A locked group shows a lock and hides its dice.
- Each Type menu shows only the sliders that the type uses.
- A slider that the current type hides has no effect.
- A Type menu marks other types that have hidden MIDI-mapped sliders.
- Picking Radial sets 10 segments, a 0–45° turn and a ±0.15 pan.
- Picking the Gradient blur mask sets amount 20, angle 90 and softness 0.
- Picking Video as the Driver with no video opens the video picker.
- The common settings are Pan X, Pan Y, Zoom, Rotation and Opacity.

## Sliders

- A click on the slider well moves the handle there.
- The arrow keys move a handle one step.
- Sliders have no mouse-wheel control.
- A slider with a no-effect point shows a tick mark there.
- A handle within 2% of the span snaps to the no-effect point.
- Camera height shows its tick but does not snap.
- Segments and Droste spirals snap to whole numbers.
- A log slider has 1000 equal-ratio positions.
- A double-click on a setting name sets its default.
- With a range on, a double-click on the name sets the full range.
- Ctrl + hold on a setting name holds it at no effect until release.
- A held name is not saved and does not make an Undo step.
- A setting name lights orange for 1 second when MIDI moves it.
- The readout shows the live, moving value on each frame.
- The readout shows at least 2 decimals when the step is below 1.
- While you drag a range handle, the readout shows that handle.
- A range slider shows a thin line at the live value.
- The live line turns blue while sound or the song moves the setting.

## Ranges

- The range button turns one handle into two, and the value moves between them.
- When both new handles would be on one value, the range opens to a tenth of the slider: up from the value, or down at the top.
- With its range off, a value is its slider value.
- When a range comes on, the end handle takes the single value.
- A setting that goes below zero starts its range at ±10% around 0.
- When a range goes off, the value takes the end handle.
- A range goes from start to end in one cycle, and back in the next.
- All ranges on the shared cycle move in step.
- All shared ranges are at their start handles at time 0.
- The end handle can be below the start handle, and the range then runs the other way.
- A reversed range shows in a different color.
- The Reverse button swaps the two handles.
- A drag between the handles moves the whole range.
- Ctrl + drag on a handle mirrors the other handle around the no-effect point.
- With no no-effect point, Ctrl + drag mirrors around the middle.
- An angle with a full 0–360° range turns without a stop, one turn per cycle.
- A range on a log slider moves in equal ratios.
- The Reverse, Easing and Own-time buttons are off while the range is off.
- Own time gives a range its own loop time of 1 to 60 seconds.
- Own time runs on the real clock, so the Length does not change it.
- A range that goes back to the shared cycle moves in step with the others.

## Easing

- There are 12 curves: Smooth, Linear, Ease in-out, Ease in, Ease out, Bounce, Explode, Implode, Early, Late, Random and Drunk.
- The default curve is Smooth for waves and Linear for angles.
- Bounce falls for 80% of the trip, then bounces twice.
- Explode reaches the end in the first 3% of the trip, then falls back.
- Implode is Explode played backward.
- Early moves in the first half of the trip, then waits.
- Late waits for the first half of the trip, then moves.
- Random makes 10 to 16 peaks of different heights per trip.
- Drunk makes 10 to 16 cycles per trip, in tall and short pairs.
- Each setting has its own Random or Drunk path, the same each time.

## Clock and motion

- The scene Length is 5 to 90 seconds, and 20 seconds by default.
- A shorter Length makes all shared motion faster.
- A change to the Length keeps the place in the scene.
- Pause stops animation time.
- Stop puts the time, flows, tunnel, camera and trails back to the start.
- Scrub replays the scene from 0, so the flows are where play puts them.
- One frame moves the clock by 0.1 s at most.
- Warp flow, driver, map and camera speeds add up over time.
- The camera flies in the direction it looks.
- A single value glides to a new slider value in about 0.03 s.
- Glide also works while paused.
- A full-circle angle glides the short way around.
- Counts such as Warp detail and Steps do not glide.

## Randomize, Nudge and Clear

- Random all gives new settings to every unlocked effect.
- Random all puts each unlocked effect in the list by its own chance, in random order.
- Kaleidoscope has a 90% chance, Algorithm 75% and Warp 70%.
- Blur has a 0% chance.
- A locked effect keeps its place in the list, or stays out.
- A locked group keeps its settings, modes and colors.
- Random all does not change the Length, Crossfade, opacities or layer blends.
- Random all turns on ranges only for 15 settings that move the picture most.
- Twirl's range comes on half the time.
- Half of the random angle ranges run backward.
- Segments come from 0, 3, 4, 5, 6, 8, 10, 12 or 16.
- The random kaleidoscope type is Radial 60%, Triangle 20% or Hexagon 20%.
- A group's dice randomizes only that group's controls and modes.
- Nudge moves each unlocked value by 2.5% of its slider, up or down.
- Nudge keeps a 0 value at 0, so an off effect stays off.
- Nudge moves both handles of a range.
- Nudge does not change the Length, Crossfade, opacities, menus or colors.
- Clear all asks you to confirm first.
- Clear all removes unlocked effects and sets them to their defaults.
- Clear all leaves locked groups as they are.
- Clear all does not change the source images, Crossfade or Length.

## Colors

- Color overlay, Trail tint and Camera sky have a color swatch.
- The color picker has a square, a hue strip, a hex field and 9 presets.
- The picture changes during each drag in the picker.
- The hex field accepts 3 or 6 digits, with or without "#".
- The picker keeps the hue when the color is gray or black.
- In the app, the pointer is an eyedropper outside the picker.
- An eyedropper click applies the color and closes the picker.
- Contour Color has Black and White chips.
- A new scene's particle gradient goes from red to blue.
- A click on the gradient bar adds a stop.
- A gradient has 2 to 8 stops.
- A drag of 28 px below the bar, or a right-click, removes a stop.
- Start colors are overlay #ff7a1a, trail #2a6cff and sky #7fa6e6.

## Test patterns

- The app has 8 test patterns: 4 repeating and 4 not repeating.
- Each pattern is drawn at 3840 × 2160 when you pick it.
- The random patterns look different each time.
- Auto tiling repeats a repeating pattern and mirrors any other image.

## Picture limits

- The app needs WebGL 2.
- If the GPU context is lost, the picture stops until the app restarts.
- The canvas pixel ratio is at most 2.
- An image or video with a long side over 4096 px is scaled down.
- Blur, particle size and sort thickness scale with the picture height.
- Trails keep fading while paused.
- A new canvas size starts the trails and contours again.
- Time smear keeps 32 frames and 320 MB at most.
- The app draws at most 1,048,576 particles.
- Particles stand still while paused.
- While paused, drawing stops when nothing changes for 1 second (6 with Time smear).
- Trails, a crossfade, a snapshot or a new image or video frame always draw.

## Undo

- Undo keeps up to 200 steps.
- The app saves an Undo step about 4 times a second.
- The app does not save a step while a mouse button is down or a knob turns.
- One finished drag is one step.
- A MIDI knob turn is one step after 500 ms with no move.
- Undo covers settings, ranges, modes, colors, effect order, blends, audio links and gradient.
- Undo does not cover images, time or locks.
- Play, pause and Stop make no Undo steps.
- A new change after Undo clears Redo.
- A message says when there is nothing to undo or redo.

## Scene files

- A scene file is JSON with the extension `.ksage`.
- A scene keeps every setting, range, curve and own time.
- A scene keeps the play state, the effect list, blends and audio links.
- A scene keeps its images and its Driver video.
- A scene does not keep locks.
- A file that is not a scene gives "The file is not a Kaleido Sage scene."
- A scene with no image gives "The scene file has no image."
- A broken second image is skipped.
- Values outside the limits are clamped when a scene opens.
- Unknown modes and entries are skipped when a scene opens.
- An effect that is not in the saved list opens off.
- Older scene versions open and convert to the current one.
- The unsaved-change check ignores time and clocks.
- Save writes to the open file without a question.
- A scene that was never saved asks for a name, "Scene.ksage" by default.
- You cannot save a scene that has no source A.
- The status shows "Saving scene and embedding media…" and then "Saved".
- A scene keeps the original bytes of a still image.
- A scene keeps a test pattern as a PNG.
- A scene with no video is a plain JSON file.
- A scene with a video is a ZIP file with the video inside.
- A scene keeps no paths to outside files.
- A scene keeps the Driver video only while the Driver uses Video.
- A save writes a temporary file first, so a failed save keeps the old file.
- A scene opens only after the app reads all of it, so a bad file changes nothing.
- An embedded video plays from inside the scene file.
- A failed open shows "Could not open the scene." and the reason.

## Source slots

- The Source card has two slots, A and B.
- The picture can fade from A to B.
- Each slot can take a random photo, a photo search, a test pattern or a file.
- The Open file button shows only in the desktop app.
- You can always remove B.
- You can remove A only when B is loaded, and B then moves to A.
- Swap works only when both slots have a source.
- A new B shows at once, at full crossfade.
- Replacing B keeps the crossfade settings.
- A test pattern keeps the image under it, and one click brings that image back.
- Each slot shows a 16:9 thumbnail.
- A source that cannot be used shows "Could not use that image or video."

## File types

- Images can be PNG, JPG, JPEG, WebP, GIF, BMP or AVIF.
- Videos can be MP4, M4V, WebM, MOV or AVI.
- The app rejects MKV files.
- File extensions are not case-sensitive.
- Videos have no size limit.
- Audio files can be MP3, WAV, FLAC, OGG, Opus, M4A or AAC.

## Source videos

- Source videos are always muted.
- A video streams from disk in parts of 2 MB at most.
- If the player cannot decode a video, Windows makes an MP4 copy of it.
- The MP4 copy has no audio track.
- The app keeps the copy and uses it again while the source file does not change.
- The app makes one copy at a time.
- With Loop on, a video's end fades into its start over 1 second.
- With Loop off, a video starts again at each scene loop, with a jump.
- A video more than 0.25 s from its place jumps there.
- A paused scene pauses its video.
- The Driver accepts only a video file.
- A Driver video plays at up to 16× speed.

## Random photo

- The dice loads a random photo from Wikimedia Commons, or a NASA terrain map.
- The dice picks one of 9 groups, all equally likely: old buildings, nature, minerals, space and night sky, storms and clouds, shapes and patterns, cities and street art, land from above, and NASA terrain maps.
- In a Commons group, the photo comes from one of the group's themes, such as domes, flowers, nebulae or tessellations.
- A NASA terrain map shows a striking place (mountains, canyons, dunes, deltas, ice) as shaded relief, elevation colors, relief with the sea floor, or the Blue Marble.
- A terrain map is 3840 × 2160 px, and its land keeps its true shape.
- The app uses only JPEG and PNG photos at least 3840 px wide.
- The app downloads each photo at 3840 px wide.
- If a theme finds nothing, the app tries again, up to 5 times.
- After 5 failed tries, the app says "The image service found no photo. Try again."
- A download stops after 20 seconds.
- The app gets the next random photo early, so the next click is fast.
- The status shows the photo title without "File:", extension or underscores.
- For a terrain map, the status shows the layer and the place, such as "Shaded relief: the Alps (NASA)".
- A failed download message has a Retry button.

## Photo search

- "Quality images only" is on by default.
- The search gets 30 results at a time.
- "Show more" gets the next 30 results.
- An empty search box does not start a search.
- The dialog keeps the last search words and the check box.
- With no results, the dialog says "No 4K photos found".
- A failed search shows "The search did not work." and the reason.
- A click on a result downloads that photo into the slot.
- Esc, Close or a click outside closes the search dialog.

## Open dialog

- The app uses its own Open dialog, not the Windows dialog.
- The dialog shows only folders and supported files.
- The dialog hides dot files, hidden files and system files.
- The image dialog shows images and videos.
- The scene dialog shows scenes and playlists.
- The places list shows Home, Desktop, Documents, Pictures, Downloads and each drive.
- The dialog opens in the last folder for that kind of file.
- The first time, it opens in Pictures for images, Documents for scenes and Home for audio.
- Folders always come first.
- You sort by Name, Type, Modified or Size, and Name is the default.
- The dialog keeps its size, position, columns, search and sort.
- The dialog is at least 1040 × 700 px, or the window size if smaller.
- The search box filters the current folder by name.
- The first Esc clears the search, and the next Esc closes the dialog.
- A double-click or Enter opens a folder or file.
- Backspace goes to the parent folder.
- The preview shows images, plays videos muted and plays scenes live.
- Audio files have no preview.
- The dialog keeps up to 24 previews in memory.
- In the scene and audio dialogs, you can pick several files.
- A right-click on a file gives Rename, Copy and Delete.
- Delete moves the item to the Recycle Bin with no question.
- Copy puts the file on the clipboard for File Explorer.
- A new name cannot be empty or contain `\ / : * ? " < > |`.
- A new name cannot be the name of another item in the folder.
- A success message closes after 3.2 seconds.

## Drag, drop and paste

- The app uses only the first dropped file.
- A file dropped on the B card goes to B, and anywhere else to A.
- The app ignores a dropped file that is not an image or video.
- A pasted image is named "Pasted image".
- An image that cannot be read shows "Could not read that image."

## Snapshots

- S or File > Save PNG saves the picture as a PNG.
- The app captures the picture first, then shows the save dialog.
- The PNG has the size of the canvas.
- The default name is "Kaleido YYYY-MM-DD HH-MM-SS.png".
- The first save opens in `Pictures\Kaleido Sage`, and the app makes that folder.
- Later saves open in the last export folder.
- PNG and video exports share one last folder.
- The app adds ".png" to a name with no extension.
- The app writes exports only to `.png` or `.mp4` files.
- The Show button opens File Explorer with the file selected.
- In a browser, the PNG downloads as "kaleido.png".

## Video export

- File > Export Video opens the export dialog.
- Only one export runs at a time.
- The export is an H.264 MP4 with no sound.
- The video has the shape of the picture and fits in 1920 × 1080.
- The length is 1, 2 or 3 loops, and 1 loop by default.
- One loop is the shortest time after which the scene repeats.
- A loop is 2 cycles when a range goes there and back.
- Quality is Standard, High or Best, and High by default.
- Standard uses about 20 Mbit/s at 1080p60.
- High and Best keep a fixed picture quality, so the file size changes.
- The frame rate is 60 or 30 fps, and 60 by default.
- The video has a key frame every 2 seconds.
- The app tries the GPU encoder first.
- With no encoder, the app says "No H.264 video encoder is available on this PC."
- The video starts with every range at its start.
- Before the first frame, the scene plays unseen until the trails are full.
- The video uses the settings from the moment the export starts.
- The picture on screen plays on during the export.
- The style is Title or Seamless loop, and Seamless loop by default.
- The Title style shows the title and "made with Kaleido Sage™" in a dark box.
- The title box shows for 4 seconds, then fades out over 1 second by default.
- An empty fade time keeps the title for the whole video.
- In Seamless loop, own-time ranges change a little so they repeat.
- In Seamless loop, motion that never repeats crossfades the end into the start.
- In Seamless loop, a source video always fades its end into its start.
- The dialog keeps the last choices.
- The default file name is the title, at most 120 characters.
- With no title, the default name is "Kaleido YYYY-MM-DD HH-MM-SS.mp4".
- The app writes to a `.part` file and renames it when complete.
- You can use the app during the export.
- A bar shows the progress and a Stop button.
- Stop or a failure deletes the part file.
- A failed export shows "Could not make the video." and the reason.
- In a browser, the video downloads as "kaleido.mp4".

## Eyedropper

- The eyedropper reads the screen pixel under the pointer.
- The app has no screen capture.

## Audio input

- One audio input serves the whole app, not one scene.
- The input is PC sound, a microphone or line input, Files, or Nothing.
- At first start, the app listens to the PC sound of the default output.
- The app records a microphone only when you pick it.
- Picking Files only shows the Playlist; it does not open the Open dialog.
- Picking a PC output, a microphone, a line input or Files turns on the settings' audio buttons.
- Picking Nothing turns them off, and so does New Scene while the input is Nothing.
- A switch to Files turns Song follow on.
- While a song has no analysis yet, the Song Map shows "Analyzing" with a moving bar.
- With one scene, Auto Fill is off.
- With one scene, each slice with no pick shows a dark 1 (that scene plays there); no pick is kept.
- The first files in an empty Playlist start the Song Map tips: one at the song's name while it is analyzed, then one above the first slice.
- The first click on a slice shows a tip above the Song Map toolbar about editing the slice.
- With one scene, that tip leaves out the scene picks; they show in a tip when a second scene is added.
- At first no slice is selected, and the slice tools are off.
- While the music plays, the slice under the playhead is selected.
- The Song Map calls a slice's level of energy its Mood.
- New Scene with no scene open shows an overview tip at the right of the Scene, FX and Play cards.
- Each has its own close button; a press anywhere in the left panel closes all three.
- Each first effect that "+ New" adds to an empty list shows a tip at the right of its header.
- That tip stays until its close button, also while the effect is closed.
- Then a tip shows at the first range button of the open effect; with no effect open, it waits until one opens.
- Its close button, or a press in the FX card while it shows, ends it.
- The first range that you turn on after a first effect shows a tip at the right of that setting, and closes the effect tips and the overview tips.
- That tip hides while the range is off or the effect is closed; its close button, or a press in the FX card outside that setting, ends it.
- With the pointers on, the first scene of each run shows a welcome card over the whole window; the app takes no clicks or keys until one of its buttons is clicked.
- Its Disable Pointers button turns the pointers off; Show Me Around closes it and then shows the overview tips.
- Without the welcome card (later first scenes of the run), the overview tips show at once.
- Help, Disable Pointers hides every pointer tip, and Help, Enable Pointers shows them again; the choice stays.
- With a live input and no audio link in the scene yet, a tip at the right of the FX audio button tells what it does.
- A second tip shows the next step: "+ New" in an empty FX list, else the speaker of the first setting in view.
- A click on a button of the FX card closes the first tip; any press in the FX card closes the second.
- Both tips go when you link a setting, hide the audio buttons, or pick Nothing.
- Picking Files with an empty list shows only one tip, at the Playlist's Add File(s) button.
- That tip goes when you close it, click Add File(s), add files, or pick another input.
- An empty Playlist has an empty body; Add File(s) is in its header.
- A saved device that is not connected shows as "A device that is not connected".
- A default-device choice follows the Windows default, checked each second.
- A device picked by name stays fixed.
- A failed stream opens again after 0.5 seconds.
- If the sound does not start in 5 seconds, the app says so.
- If Windows blocks the microphone, the app tells you which setting to turn on.
- The app mixes all channels to mono.
- In silence, the levels fall to zero.
- Capture works only in the Windows app.
- With Files as the input, the app analyzes the music it plays.
- Picking any other input pauses the music.
- The app reads the device list again each time the Audio panel opens.
- The app keeps the input, device, gain and threshold between runs.

## Gain and threshold

- Master Gain is −24 to +24 dB, and 0 dB by default.
- Master Threshold is −60 to 0 dB, and −40 dB by default.
- Gain adds to every band before the threshold.
- Sound below the threshold moves nothing and gives no beats.

## Bands and beats

- Level covers 20 Hz to 16 kHz.
- Bass covers 20 to 150 Hz.
- Mids cover 150 Hz to 2 kHz.
- Highs cover 2 to 12 kHz.
- A band peak rises at once and falls to a third in 50 ms.
- A band level is 0 at the threshold and 1 at 0 dBFS.
- Beat detection is automatic and has no sensitivity setting.
- A beat is a sudden bass rise of at least 3 dB.
- A beat must also be at least half the largest recent rise.
- Two beats are at least 100 ms apart.
- A steady tone gives one beat at most.
- The meters show −60 to 0 dBFS with a mark at the threshold.
- The Beat light flashes for 120 ms on each beat.

## Audio links

- Only settings that can have a range can have an audio link.
- The scene Length cannot have an audio link.
- Each setting has one link at most.
- A link moves with Level, Bass, Mids, Highs or Beat.
- A new link has 50% Range, a ×1 release and a 0 dB threshold offset.
- A right-click on a lit speaker button removes the link.
- The speaker button glows with the push of the sound.
- The links list hides while the input is Nothing.
- A link threshold is −24 to +24 dB, added to the Master Threshold.
- Link Range is 0% to 100%.
- The scene Release is 20 ms to 3 s, and 0.25 s by default.
- A link's release factor is ×0.25 to ×4.
- A Beat link jumps to full push on each beat, then falls back.
- A push rises at once and falls to a third in one release time.
- Links react also while the scene is paused.
- With an input on, a linked range rests at its start handle.
- The sound pushes a linked range toward its end handle.
- Without a range, the sound pushes toward the slider end with more room.
- With no input, links do nothing and ranges play as normal.
- A MIDI hold wins over an audio link.
- An audio link wins over Follow the song.
- A video export ignores audio links.
- Scene files and Undo keep the links and the Release.
- A scene that opens drops links to unknown settings or sources.

## MIDI devices

- The app listens to every connected MIDI input.
- A controller plugged in later shows at once.
- Without Web MIDI, the panel says "MIDI is not available."
- Controllers with mappings come first in the device list.
- A light shows which controllers are connected.
- On a Launchkey, controls 21–28 show as Knob 1–8.
- The app reads only Control Change messages.
- The app sends nothing back to the controller.

## MIDI mapping

- A MIDI control moves only sliders.
- The scene Length cannot have a MIDI control.
- One control can move many sliders.
- One slider can have many controls.
- The app keeps the map per controller name between runs.
- The slider MIDI button shows only with a controller or a mapping.
- A click on the MIDI button waits for the next knob or fader move.
- A second click or Esc stops the wait.
- A learned control adds to the slider's other mappings.
- After a learn, the status bar names the control for 4 seconds.
- A control on a common setting moves that setting in every effect.
- A right-click on a lit MIDI button removes all its controls.
- Learn in the MIDI panel stays on for many controls.
- In panel Learn, a new control gets a row and opens the setting picker.
- Mapping a setting that has controls asks Replace or Add.
- Clear all asks you to confirm, then removes every mapping.
- A mapping row lights for 400 ms each time its control sends.

## MIDI control

- A control takes over a value where it is, so the value does not jump.
- The end of the knob takes the value to the end of the slider.
- The value follows the control in about 0.1 seconds.
- On a range, a control holds the value and stops the range.
- The play button or Esc plays held ranges again.
- A held range glides back into its motion over 2 seconds.
- Ctrl + control on a range moves the handles too.
- Play puts back the handles from before a Ctrl move.
- A control does not move a slider that the current type hides.
- Opening or starting a scene ends every MIDI hold.
- Hiding the MIDI buttons stops learn and plays every held range.
- The app finds relative encoders by itself.
- A relative control moves 1/127 of the slider per step.
- The app finds 14-bit controls by itself.
- The app keeps the relative controls between runs.

## Song analysis

- Follow the song analyzes mp3, wav, flac, ogg, opus, m4a and aac files.
- The analysis needs three model files in the app data `models` folder.
- A missing model file stops the analysis with "run fetch-models.ps1".
- The Beat This! model finds the beats and bar starts.
- The app drops beats in silence.
- The tempo comes from the mean beat spacing.
- The app measures loudness, bass, mids, highs, brightness and note density.
- The app scales each curve to the song itself.
- Intensity is 50% loudness, 20% bass, 20% note density and 10% brightness.
- The app finds kick, snare and hat hits.
- The LinkSeg model divides the song into parts.
- A part is silence, verse, chorus, intro, outro, inst or bridge.
- A song with fewer than 4 beats has no parts.
- Two part boundaries are at least 8 seconds apart.

## Song plan

- Each part start moves to the nearest bar start.
- A part shorter than 2 bars joins the part before it.
- A song with no parts is one verse.
- Each part gets a level: calm, steady, rising or peak.
- The level comes from the part's intensity compared to the other parts.
- A silence part is calm.
- An intro or outro is at most steady.
- A chorus is at least rising.
- A drop is a sudden jump into a rising or peak part.
- The strongest drop in a song has full strength.
- A build of 2 to 8 bars comes before each drop.
- A quiet last beat before a drop makes a short pause.
- A cue comes at each drop and at each change of level.

## Song script

- The song moves settings of four kinds: light, size, detail and sparkle.
- The song moves a setting only if its range is on and its effect is on.
- The song does not move a setting that the current type hides.
- All other ranges play at the pace of the music.
- Each beat makes a pulse in light and size.
- A kick near a beat sets the pulse strength.
- A bar start pulses stronger.
- Soft passages do not pulse.
- Calm parts do not pulse.
- Light and size follow the song intensity.
- Detail follows the intensity and the local intensity.
- Sparkle follows the high sounds.
- The part level limits how far the settings move.
- A level change glides over the last 2 beats of a part.
- At a drop, the change is a cut.
- Before a drop, a riser grows size, detail and sparkle.
- The pause before a drop dims the picture and stops the motion.
- At a drop, a hit boosts all four kinds and fades over about one bar.
- The pace of motion goes from 0.3 at low intensity to 1.7 at high intensity.

## Song clock

- The song clock follows the music player's time.
- A clock difference of more than 0.1 s counts as a jump.
- The clock takes away the sound output delay.
- The clock leads the sound by 10 ms, so the picture is not late.
- With Follow on, a paused song holds the picture.
- A seek puts the picture at once where the song is.
- A scene that comes in during a song starts where the song is.

## Follow the song

- Follow works only with Files as the input and an analyzed track.
- Follow is off at each start of the app.
- A click on the Follow button turns Follow on or off.
- The app analyzes each track once and keeps the result in memory.
- The app analyzes the current track first, then the others one at a time.
- A failed track is tried again when it plays.
- A failed analysis shows "Could not analyze" with the reason.
- The Follow button pulses during an analysis.
- The status line shows tempo, song time, part, level, intensity and pace.
- With two or more tracks, the status line counts the analyzed songs.
- With no range to follow, the status line tells you to give one a range.
- With Follow on, cues change the scene, not the end of the scene loop.
- At a drop cue, the next scene comes in with a cut.
- At a level cue, the next scene crossfades over 1.5 s or 2 beats, the shorter one.
- The app takes a cue one frame early, so the cut is on the beat.
- A seek skips the cues it passes.
- Cues change the scene only while the song plays, with two or more scenes and Hold off.

## Tracks

- The tracks play one after the other.
- After the last track, the first track plays.
- A list of one track repeats that track.
- New files go to the end of the list.
- The list does not add a file that is already in it.
- Added files do not start to play; the first file of an empty list becomes the current file.
- Removing the playing track stops the music, and the next track takes its place.
- A new track order keeps the current track.
- Stop pauses the music and goes back to the start of the track.
- A file that cannot play shows "Could not play" with its name.
- The footer shows the total play time.
- Outside a playlist, the track list is empty at each start.
- Each new track crossfades to the next scene, with two or more scenes and Hold off.
- A scene that you picked stays for at least half its Length before a new track changes it.
- Without Follow, a loop end does not change the scene near the end of a track.
- Tracks play only in the desktop app.

## Playlist files

- A playlist file has the `.ksplaylist` extension.
- A playlist holds its scenes, its tracks and their song analyses in one ZIP file.
- A playlist keeps the audio input, device, gain and threshold.
- A playlist keeps the selected tab, the Playlist column width and the track lengths.
- A save writes a temporary file first and replaces the target only when complete.
- The default name is "Playlist.ksplaylist".
- Save Playlist does not change the scenes' own files on disk.
- Save Playlist leaves out an empty new scene.
- A wrong file gives "The file is not a Kaleido Sage playlist."
- A missing or broken audio setting keeps the app's own value.
- A playlist from a newer version still opens.
- A saved analysis that is broken, over 64 MB or of another version is dropped.
- The app analyzes a track again when its saved analysis is dropped.
- A playlist device that this PC does not have becomes the default device.
- Opening a playlist shows the tab that was selected at save.
- Opening a playlist stops the tracks at the first track.
- The Open dialog shows a playlist's scenes and tracks without unpacking it.
- A change to the scenes, tracks, audio settings or column width marks the playlist unsaved.
- Close Playlist empties the tracks and keeps the audio settings.
- The app removes old playlist temp folders at start.

## Remembered settings

- The app keeps the bottom panel height between runs.
- The app keeps the help-button choice between runs.
- The app keeps the Playlist column width and its collapsed state between runs.
- The app keeps the audio input settings between runs.
- The app keeps the MIDI map and the relative controls between runs.
- The app starts the PC sound again if it was on at close.
- If storage fails, each setting goes back to its default.

## Updates

- The app checks for an update one time at start-up.
- The app checks the latest release of `rmirabelle/kaleidosage` on GitHub.
- A repository with no release gives no update.
- The app compares versions part by part as numbers.
- The app offers an update only for a higher version.
- A failed start-up check shows no error.
- When an update is ready, the title bar shows "Update available".
- "Update available" opens the About dialog.
- The app downloads only from the repository's own release URLs.
- The app downloads the installer into the Windows temp folder.
- The app asks to save changes before it updates.
- The installer runs with no pages and starts the app again.
- An update keeps the app data.

## About

- The About dialog shows the name, version, tagline and author.
- The About dialog gives credit for the Beat This! and LinkSeg models.
- The About dialog has a Check for Updates link.
- An available update shows the new and current versions and a Download and Install button.
- The download shows a percentage and a progress bar.
- You cannot close the About dialog during the download.
- A failed check or install shows the error and a Try again link.

## Install and uninstall

- The installer installs for the current user only, with no admin rights.
- The default install folder is `%LOCALAPPDATA%\KaleidoSage`.
- The installer checks that the app is not running.
- The installer puts the icon in `C:\Users\Public\KaleidoSage`.
- The Start menu shortcut goes straight into Programs.
- A GUI install makes a desktop shortcut only if you pick that option.
- A passive or silent install always makes a desktop shortcut.
- An existing install asks you to reinstall, upgrade or uninstall.
- The app opens no console window.
- The uninstaller removes the program, the shortcuts and the Public icon folder.
- The uninstaller removes the app from Add/Remove Programs.
- The uninstaller deletes app data only if you pick "Delete app data".

## Release

- `set-version.ps1` accepts only a version such as 1.2.3 or 1.2.3-beta.
- `set-version.ps1` writes the version into three files and makes no commit or tag.
- `publish.ps1` stops if the three versions differ.
- `publish.ps1` stops if the installer contract is broken.
- `publish.ps1` needs a clean work tree and GitHub sign-in.
- `publish.ps1` stops if the release tag already exists.
- `publish.ps1` makes a public release with the installer as the only file.
- `publish.ps1` deletes older releases only after the new one checks out.
- A manual installer test uses a GUI install, not a silent one.

## Open questions

- Undo saves a step for tiling, sort order, particle blend and driver changes, but does not restore them.
- The video export seam fade counts only the Tunnel, not the other traveling maps.
- `docs/AUDIO.md` still names beat sensitivity, an "Off" item and old timings that the code no longer has.
- `docs/MODULATION.md` describes MIDI pads, but the app reads only Control Change.
- `docs/SOURCES.md` says photo searches return only JPEG, but the code also takes PNG.
- No script checks the release files for embedded secrets.
