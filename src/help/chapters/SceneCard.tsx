import { Keys, Shot, Tip } from "../parts";

export function SceneCard() {
  return (
    <>
      <h1>The Scene card</h1>
      <p className="help-lead">
        The Scene card holds the picture that a scene starts from. It has two slots for images or videos,
        the controls that mix them, and the Length, which sets the pace of all motion in the scene.
      </p>

      <h2>The card</h2>
      <Shot name="scene-card" alt="The Scene card of a new scene" />
      <p>
        The Scene card is at the top of the left panel. Its title shows the name of the scene. A
        red <b>*</b> after the name shows that the scene has changes that are not saved.
      </p>
      <p>
        Below the title are the <b>Length</b> slider and the two source slots, <b>A</b> and <b>B</b>. A new
        scene has a checkerboard in slot A, and slot B is empty.
      </p>

      <h2>Length</h2>
      <Shot name="scene-length" alt="The Length slider of the Scene card" side="left" />
      <p>
        <b>Length</b> is the time, in seconds, that each moving setting takes to go from the start of its
        range to the end. You can set it from 5 to 90 seconds. A new scene has 20 seconds.
      </p>
      <p>
        Length also sets the speed of the effects that flow or travel. A shorter Length makes the full
        scene faster, and a longer Length makes it slower and calmer. In a show with a playlist, the
        Length is also the time that the scene plays before the next scene comes in.
      </p>
      <p>
        Double-click the name <b>Length</b> to go back to 20 seconds.
      </p>

      <h2>Load a picture into a slot</h2>
      <Shot name="scene-slot-buttons" alt="Slot A with the mouse on its Search button" />
      <p>
        Point at a slot. Four buttons appear at the bottom of the slot:
      </p>
      <ul>
        <li>
          <Shot name="scene-icon-random" alt="The random photo button" side="inline" /> loads a random 4K photo
          from Wikimedia Commons. The subjects include old buildings, minerals, nature, the sky, cities
          and fractal art.
        </li>
        <li>
          <Shot name="scene-icon-search" alt="The search button" side="inline" /> opens a search for photos.
        </li>
        <li>
          <Shot name="scene-icon-pattern" alt="The pattern button" side="inline" /> opens the list of test
          patterns.
        </li>
        <li>
          <Shot name="scene-icon-open" alt="The open file button" side="inline" /> opens an image or a video
          from your computer.
        </li>
      </ul>
      <p>
        There are two more ways. Drop an image or video file on the window: a file that you drop on slot
        B goes to slot B, and a file that you drop on any other place goes to slot A. Or copy an image in
        another program, and press <Keys k="Ctrl+V" /> to put it in slot A.
      </p>
      <Tip>
        Pictures with fine detail give the best results: architecture, patterns, crystals and abstract
        art. An effect has little to work with in a picture of one flat color.
      </Tip>

      <h2>Search for a photo</h2>
      <Shot name="scene-search" alt="The Search Photos dialog with results for rose window" side="block" />
      <p>
        Type one or more words and select <b>Search</b>, or press <Keys k="Enter" />. The results are 4K
        photos from Wikimedia Commons. Select a photo to load it into the slot. <b>Show more</b> gets more
        results for the same words.
      </p>
      <p>
        <b>Quality images only</b> keeps the search to the photos that Wikimedia Commons lists as quality images. Clear the
        check box if a search finds too few photos. Random photos and the search need the internet.
      </p>

      <h2>Use a test pattern</h2>
      <Shot name="scene-pattern-menu" alt="The pattern list of slot A with the mouse on Color grid" />
      <p>
        A pattern shows clearly what an effect does to the picture, because you know how the pattern
        looked before. The list stays open while you try patterns. Press <Keys k="Esc" />, or select a
        place outside the list, to close it.
      </p>
      <ul>
        <li><b>Templates</b> are dark grounds for the effects that draw their own light: <b>Dark Stage</b> and <b>Solid Black</b>.</li>
        <li><b>Repeating</b> patterns continue past their edges with no seam: <b>Checkerboard</b>, <b>Dot grid</b>, <b>Color grid</b>, <b>Truchet tiles</b> (curved paths) and <b>Honeycomb</b>.</li>
        <li><b>Not repeating</b> patterns have one picture with edges. <b>Center line</b> is always the same. <b>Rings</b>, <b>Sunburst</b>, <b>Star field</b>, <b>Spiral curves</b>, <b>Contour lines</b>, <b>Color clouds</b> and <b>Scattered lines</b> are different each time you select them. <b>Truchet tiles</b> and <b>Honeycomb</b> also change each time.</li>
      </ul>
      <p>
        When you put a pattern over a photo, Kaleido Sage keeps the photo. The slot then shows the photo
        in its left half and the pattern in its right half. Select the left half to remove the pattern and
        show the photo again.
      </p>

      <h2>Use a video</h2>
      <p>
        A slot can hold a video in place of an image. The effects then work on the video as it
        plays.
      </p>
      <p>
        A <b>Loop</b> check box shows below a slot that holds a video. With <b>Loop</b> selected, the end of
        the video fades into its start, so the video repeats with no jump. With <b>Loop</b> clear, the video
        starts again at the start of each loop.
      </p>

      <h2>Two sources and Crossfade</h2>
      <Shot name="scene-crossfade" alt="Both slots in use, with the Crossfade slider between them at 0.50" side="block" />
      <p>
        When slot B holds a picture, the <b>Crossfade</b> slider appears below the slots. At 0, the scene
        shows only slot A. At 1, it shows only slot B. Between them, it mixes the two.
      </p>
      <p>
        Crossfade can move, as all sliders can. Select its bracket button to give it a range, and the scene
        goes from one picture to the other and back. See <i>Settings that move</i>.
      </p>
      <Shot name="scene-crossfade-menu" alt="The right-click menu of Crossfade" side="left" />
      <p>
        Right-click the name <b>Crossfade</b> to select how the two pictures mix. <b>Even crossfade</b> mixes
        them equally at all points. With <b>Dissolve by brightness</b>, slot B appears first in its
        brightest areas, then in its darker areas.
      </p>

      <h2>Swap, remove and tiling</h2>
      <Shot name="scene-remove" alt="Slot B with the mouse on its remove button" />
      <p>
        <Shot name="scene-icon-swap" alt="The swap button" side="inline" /> between the slots exchanges
        the two sources. The <b>×</b> at the top right of a slot removes its source. When you remove
        source A, source B moves to slot A.
      </p>
      <Shot name="scene-tiling-menu" alt="The Tiling menu with Auto, Mirror and Repeat" />
      <p>
        Many effects show more than the picture holds, for example when they make the picture smaller or
        move it. <Shot name="scene-icon-tiling" alt="The tiling button" side="inline" /> sets how the
        picture continues past its edges:
      </p>
      <ul>
        <li><b>Mirror</b> turns each copy over, so the edges always join with no seam.</li>
        <li><b>Repeat</b> puts copies side by side. Use it for pictures that are made to repeat.</li>
        <li><b>Auto</b> uses Repeat for the repeating test patterns, and Mirror for all other pictures.</li>
      </ul>
    </>
  );
}
