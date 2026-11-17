import { MenuPath, Shot, Tip } from "../parts";

export function ExportMedia() {
  return (
    <>
      <h1>Save PNG and Export Video</h1>
      <p className="help-lead">
        A scene can leave Kaleido Sage as a still picture or as a video. <b>Save PNG</b> keeps the picture
        of this moment. <b>Export Video</b> makes an MP4 file of one scene, of all scenes, or of a full song
        with its scenes and its sound.
      </p>

      <h2>Save a picture</h2>
      <Shot name="export-menu-png" alt="The File menu with the mouse on Save PNG" />
      <p>
        Select <MenuPath path="File > Save PNG" />. Kaleido Sage takes the picture as it shows at that
        moment, at the size that the picture has on your screen, and asks where to save it.
      </p>
      <p>
        The dialog starts in the folder that you used last. The first time, that is the <b>Kaleido
        Sage</b> folder in your Pictures folder. The suggested name has the date and the time, for
        example <b>Kaleido 2026-11-17 21-30-05.png</b>.
      </p>
      <p>
        After the save, a message shows the name of the file. Select <b>Show</b> in the message to open
        its folder.
      </p>
      <Tip>
        For a larger picture, make the picture larger first: use full screen, or hide the panels
        with the H key.
      </Tip>

      <h2>Export a video</h2>
      <Shot name="export-dialog" alt="The Export Video dialog" side="right" />
      <p>
        Select <MenuPath path="File > Export Video" />. The dialog has one row for each decision. The line
        below its title shows the result: the file type, the size in pixels, and where the video starts.
      </p>
      <p>
        Kaleido Sage keeps your choices for the next video.
      </p>
      <p>
        A video of a scene starts where <b>Stop</b> puts the scene: at the start of its ranges. So the
        video does not depend on the moment when you open the dialog.
      </p>

      <h3>1. Select what to export</h3>
      <Shot name="export-scenes" alt="The Scenes row and the Song list of the Export Video dialog" side="block" />
      <p>
        The <b>Scenes</b> row shows when the project has more than one scene, or a song that Song follow
        has examined.
      </p>
      <ul>
        <li><b>Current Scene</b> makes a video of the scene on the screen.</li>
        <li>
          <b>All Scenes</b> makes a video of each scene. A <b>Files</b> row then lets you
          select <b>Separate files</b>, one video for each scene, or <b>Stitched</b>, one video in which
          the scenes join with crossfades of 2 seconds.
        </li>
        <li>
          <b>Song</b> makes the video of a song as Kaleido Sage plays it: the scenes change with the
          song, the picture moves with it, and the video has the sound of the song. Select the song in
          the <b>Song</b> list, or <b>All songs, one file each</b>.
        </li>
      </ul>
      <Tip>
        Only a <b>Song</b> video has sound. A video of a scene is silent, and the audio links of its
        settings do not move the picture in it. Its ranges move as usual.
      </Tip>

      <h3>2. Select the size</h3>
      <Shot name="export-size" alt="The Size and Resolution rows of the Export Video dialog" side="block" />
      <p>
        <b>Size</b> sets the shape of the video. <b>Screen</b> keeps the shape of your
        screen. <b>16:9</b> is for YouTube, <b>9:16</b> for TikTok, Reels and
        Shorts, and <b>1:1</b> and <b>4:5</b> for Instagram.
      </p>
      <p>
        <b>Resolution</b> sets the number of pixels. <b>4K</b> is the sharpest. <b>1080p</b> exports faster
        and makes a smaller file.
      </p>
      <p>
        <b>360°</b> makes a video that goes all around the viewer in a Quest or a different VR headset.
        The center of the picture is in front of the viewer, and its mirror image is behind. Copy the file
        to the headset and open it in the video player of the headset.
      </p>

      <h3>3. Select the length</h3>
      <p>
        For scenes, <b>Length</b> offers one, two or three loops of the scene, and shows the time of each.
        One loop takes the ranges from their start handles to their end handles and back. A song video
        runs for the full song.
      </p>

      <h3>4. Select the quality</h3>
      <Shot name="export-quality" alt="The Quality and Frame rate rows of the Export Video dialog" side="block" />
      <p>
        <b>Quality</b> sets how much detail the file keeps. <b>Standard</b> makes the smallest
        file. <b>High</b> plays in all players and is the correct choice for most videos. <b>Best</b> keeps
        all of the color detail, but many players and phones cannot open such a file. VLC can.
      </p>
      <p>
        <b>Frame rate</b> is 60 or 30 frames for each second. A video with 30 frames exports two times as
        fast.
      </p>
      <p>
        <b>Motion blur</b> at <b>Half-frame</b> makes fast motion smoother. <b>None</b> gives the sharpest
        frames, and the export can be faster.
      </p>

      <h3>5. Select the style</h3>
      <Shot name="export-style" alt="The Style and Fade out rows of the Export Video dialog" side="block" />
      <p>
        <b>Seamless loop</b> makes a video whose last frame leads into its first, so it can repeat with no
        jump. Use it for a clip that plays again and again. A scene with motion that never repeats gets a
        crossfade from its last second into its first.
      </p>
      <p>
        <b>Title</b> shows a title box at the start of the video. Type the text in the <b>Title</b> box.
        The box also shows the credit "made with Kaleido Sage". It stays for 4 seconds and then fades out
        in the <b>Fade out</b> time. With no fade-out time, the title stays for the full video. With no
        title text, only the credit shows.
      </p>
      <p>
        With <b>Separate files</b>, each video gets the name of its scene as its title. A song video gets
        the name of the song, and its second style is <b>No title</b>.
      </p>

      <h3>6. Export</h3>
      <Shot name="export-button" alt="The Cancel and Export Video buttons, with the mouse on Export Video" side="block" />
      <p>
        Select <b>Export Video</b>. For one video, Kaleido Sage asks for the file name. For several videos,
        it asks for a folder, and names each file. As for pictures, the first folder is <b>Kaleido
        Sage</b> in your Pictures folder.
      </p>
      <p>
        The work goes on in the background, and you can continue to use the app. A small panel at the
        bottom left shows the name of the file, the progress, and a <b>Stop</b> button. When the video is
        complete, a message shows its name, with <b>Show</b> to open its folder.
      </p>
      <p>
        Only one export runs at a time. If you start a second one, Kaleido Sage tells you to stop the first
        or to wait for it.
      </p>
    </>
  );
}
