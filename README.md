<p align="center">
  <img src="public/kaleido-sage-logo.png" alt="Kaleido Sage logo" width="160">
</p>

<h1 align="center">Kaleido Sage</h1>

<p align="center"><strong>Visual FX Playground</strong></p>

<p align="center">
  Turn any image or video into moving, music-driven visuals.<br>
  Play them full screen, cast them to a projector, step inside them in VR, or export them as video.
</p>

<p align="center">
  <a href="https://github.com/rmirabelle/kaleidosage/releases/latest"><strong>Download for Windows</strong></a>
</p>

---

## What it does

Pick a picture and add effects. Set any value to move, or link it to the sound. The picture then moves with your music, live.

Use Kaleido Sage for:

- Visuals for a DJ set, a band or a party
- Music videos and looping clips for social media
- A moving picture on a second screen or a projector
- Free play with fractals, mirrors and light

## System requirements

| | |
|---|---|
| **Operating system** | Windows 10 or Windows 11, 64-bit |
| **Graphics** | A graphics card with WebGL 2 support. A dedicated card gives the smoothest picture with many effects or on a large screen. |
| **Web engine** | Microsoft Edge WebView2 Runtime. Windows 11 includes it. The installer downloads it if it is missing. |

These items are optional:

| To use | You need |
|---|---|
| Random photos, photo search, Terrain, update checks | An internet connection |
| Live sound | Sound from your PC, a microphone or a line input |
| MIDI control | A MIDI controller |
| Cast | A second screen, a projector or a virtual display |
| Live VR | A Meta Quest with the Meta Quest Link app on the PC |

Kaleido Sage is for Windows only at this time.

## Installation

1. Go to the [latest release](https://github.com/rmirabelle/kaleidosage/releases/latest).
2. Download `KaleidoSage_<version>_x64-setup.exe`.
3. Run the file and follow the steps.

The installer is about 8 MB. It installs the app for your Windows user only, so you do not need administrator rights.

Windows can show "Windows protected your PC" because the installer has no code signature. To continue, click **More info**, then **Run anyway**.

### Updates

The app checks for a new version when it starts. You can also go to **Help > About** and click **Check for Updates**. When you click **Download and Install**, the app closes, installs the update and opens again. It asks about unsaved changes first.

### Uninstall

Go to **Windows Settings > Apps > Installed apps**, find **Kaleido Sage**, and click **Uninstall**.

## Your first scene

1. Click **New Project**.
2. Point at a source slot and pick a picture: **Random**, **Search**, **Open** or **Pattern**. You can also drop a file on the window or paste an image with `Ctrl+V`.
3. In the **FX** panel, click **New** and pick **Kaleidoscope**.
4. Click the range button on a setting. The value now moves between two handles.
5. Press `A` to open the Audio panel and pick an **Input**. Then click the speaker beside a setting, and the setting moves with the sound.
6. Press `F` to play full screen.

Press `X` at any time for new random settings on every unlocked effect. Press `?` to see every key and mouse gesture. The line at the bottom of the window explains the control under your mouse.

## Features

### Sources

- **Images:** PNG, JPEG, WebP, GIF, BMP and AVIF
- **Videos:** MP4, M4V, WebM, MOV and AVI. The video codec must be one that WebView2 can play.
- **Random 4K photos** from Wikimedia Commons and NASA map imagery, with no account or key
- **Photo search** on Wikimedia Commons
- **Test patterns** that show what an effect does
- **Two slots**, A and B, with a crossfade between them

Photos from Wikimedia Commons have their own licenses. Check the license before you publish your work.

For the best result, use a picture at least 4K wide with many small, repeating details. Ceilings, domes, mosaics, stained glass and fractal art all work well.

### 24 effects

Add effects in any order. The picture goes through the list from top to bottom.

| Group | Effects |
|---|---|
| **Mirrors and math** | Kaleidoscope (radial, triangle, hexagon, square, hyperbolic), Algorithm (Mandelbrot, Julia, Möbius, Droste spiral, log spiral, seamless spiral, tunnel, sine, power) |
| **Motion and time** | Warp, Driver (caustics, smoke, ink, fire, ripples, video), Trails, Time smear, Pixel sort |
| **3D** | 3D object (sphere, cube, morph, blobs, star, Menger sponge and more), Terrain, Camera |
| **Light** | Bloom, Light rays, Lasers, Light shapes, Light cycles, Particles |
| **Line and surface** | Contours, Relief, Sharpen, Blur |
| **Color and layers** | Color, Levels, Opacity mask, Image or Video |

### Control every setting

- **Ranges:** Each value can move between two handles, with a choice of easing, direction and its own time.
- **Random and Nudge:** Get new settings for all effects or for one effect. Lock the effects that you want to keep.
- **Hold to compare:** Hold `Ctrl` on a name or an effect to turn it off for a moment.
- **Undo and redo** for your changes.

### Music

- **Three kinds of input:** the sound your PC plays (from any app), a microphone or line input, or audio files that the app plays
- **Audio files:** MP3, WAV, FLAC, OGG, Opus, M4A and AAC
- **Sound and beats:** Brightness and size follow the loudness and pulse on each beat. Sparkle follows the high sounds. Other settings move one step through their range on each beat. The app finds the beats by itself.
- **Master Gain and Master Threshold** set how much the sound moves the picture.
- **Output** sends the audio files to the speaker that you pick, for example a virtual cable for a stream.

Windows cannot capture the sound of one app only. The PC input hears all sound on that output device.

### Song Follow

Add songs to the Playlist, and the app analyzes each song and cuts it into sections. The Song Map shows these sections as slices. **Auto Fill** picks a scene for each slice, and you can change any pick. The show then moves from scene to scene with the song.

Song analysis needs three model files that the installer does not include. To add them:

1. Download [`fetch-models.ps1`](https://github.com/rmirabelle/kaleidosage/blob/main/fetch-models.ps1).
2. Open PowerShell in the folder that holds the file.
3. Run this command:

```powershell
powershell -ExecutionPolicy Bypass -File .\fetch-models.ps1
```

All other features work without these files.

### MIDI

- Click **Learn**, move a knob or fader, then pick a setting.
- One control can move several settings, and one setting can have several controls.
- A knob on a range holds the value. The orange play button, or `Esc`, plays the range again.

### Show it

- **Full screen:** Press `F` or `F11`, or double-click the picture.
- **Scene changes:** Keys `1` to `9` select a scene with a crossfade, also in full screen.
- **Cast:** Press `C` to show the picture full screen on another screen. The main window stays free, and you can even minimize it. Cast and VR do not run at the same time.
- **Live VR:** Go to **View > Enter VR** to see the picture on a large virtual screen. Set the shape, width, distance and curve with the controllers. For setup, see [Set up live VR](#set-up-live-vr).

### Export

- **PNG:** Saves the picture as it is now, to `Pictures\Kaleido Sage` unless you pick another folder.
- **MP4 video:** The video is made in the background, and you can use the app while it runs.

| Video setting | Choices |
|---|---|
| **Size** | Screen shape, 16:9 (YouTube), 9:16 (TikTok, Reels, Shorts), 1:1 and 4:5 (Instagram), 360° (VR headsets) |
| **Length** | One, two or three loops of the scene |
| **Style** | Seamless loop, or a title at the start |
| **Quality** | Standard, High or Best |
| **Frame rate** | 30 or 60 frames per second |

A video plays the ranges. Audio links do not move the picture in a video, and the video has no sound. To make a music video, add the song in a video editor.

### Projects

A project (`.ksage`) holds your scenes in order and your audio settings. When the input is Files, it also holds the audio files. A project plays the same on another PC.

You can import scenes from other projects, and export one scene as its own project.

## Set up live VR

1. Install the Meta Quest Link app on your PC and sign in.
2. In the app, go to **Settings > General** and set Meta Quest Link as the active OpenXR runtime.
3. Connect the headset with a USB 3 cable or Air Link.
4. In the headset, open **Quick Settings > Quest Link > Launch**.
5. In Kaleido Sage, go to **View > Enter VR**.

To exit, press `Esc` or use the headset's menu.

| Controller | Action |
|---|---|
| Right stick forward or back | Move the screen away or near |
| Right stick right or left | Make the screen wider or narrower |
| Left stick forward or back | More or less curve |
| A | Next screen shape |
| B | Reset the screen |
| Hold the Meta button | Bring the screen in front of you |

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play or pause the scene |
| `Shift+Space` | Stop the scene and go back to its start |
| `F` or `F11` | Full screen |
| `Esc` | Leave full screen |
| `C` | Cast to another screen, or stop |
| `1` to `9` | Select a scene tab, with a crossfade |
| `X` | Random settings for all unlocked effects |
| `H` | Hide or show the panels |
| `A` | Audio panel |
| `M` | MIDI panel |
| `P` | Show or hide performance numbers |
| `Ctrl+N` | Add a blank scene |
| `Ctrl+O` | Open a project |
| `Ctrl+S` | Save the project |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+V` | Use the image on the clipboard |
| `?` | Show all shortcuts and gestures |

## Privacy

Kaleido Sage has no account and no ads. It connects to the internet only to:

- Check for updates and download them (GitHub)
- Get random and searched photos (Wikimedia Commons, NASA)
- Get land and satellite data for the Terrain effect (Amazon Web Services, NASA)

Sound capture stays on your PC. The app does not send your sound, pictures or projects anywhere.

## Credits

Kaleido Sage is by Robert Mirabelle.

Song Follow uses these models:

- **Beat This!** by F. Foscarin, J. Schlüter and G. Widmer (MIT license; Rust port by danigb)
- **LinkSeg** by M. Buisson, B. McFee and S. Essid (model weights under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); ONNX port by linkseg-web, MIT license)
