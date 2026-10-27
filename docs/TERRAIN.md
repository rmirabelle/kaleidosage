# Terrain heights for the camera (plan)

Planned 2026-10-26. The camera effect was meant to fly over terrain, but
its land looks poor. This plan gives the camera a height source of its
own. Each step leaves the app working, and a scene that does not use the
new parts looks as before.

## Today

- The camera's land is the picture made so far, laid flat. Its heights
  come from the same picture: `CAMERA_FIELD_SHADER` turns the brightness
  (from a blurred copy, by Smooth) into a height, times Height.
- So the heights follow the colors, not the land: a bright cloud is a
  hill, a dark road is a ditch, and a photo's shading makes false slopes.
  Better shading in `CAMERA_SHADER` cannot fix this. The data must change.
- The random terrain images (NASA GIBS, see `TERRAIN_LAYERS` in
  `src/lib/images.ts`) are pictures: Shaded relief is light and shadow,
  and Elevation colors is a color scale. None holds real heights.

## Data that holds real heights (checked 2026-10-26)

- **AWS Terrain Tiles, Terrarium format:**
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`.
  Free, with no key, and open to the app (CORS `*`). The whole Earth,
  with the sea floor, as 256 x 256 PNG map tiles (Web Mercator, zoom 0
  to 15). Each pixel holds a height in meters:
  `R * 256 + G + B / 256 - 32768`.
- **NASA GIBS in the same map layout:** the WMS service at
  `https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi` gives a
  picture (for example `BlueMarble_NextGeneration`) of any area in Web
  Mercator. So a picture and its heights can cover exactly the same area.

## Decisions to make (proposed answers)

1. **Height source**, a new menu on the Camera group:
   - *Picture*: as today (the default, so old scenes do not change).
   - *Real terrain*: heights from the Terrain Tiles for a place.
   - *Generated*: mountains made from noise in the shader; no download.
2. **Color of the land**, a second new menu on the Camera group:
   - *Picture*: the picture made so far, as today.
   - *Height colors*: a gradient by height (sea blue, green, rock brown,
     snow white), with the gradient editor that Particles and Light
     cycles use. It also looks good with Generated, which has no picture
     of its own.
   - *Terrain picture*: the NASA picture of the place (Real terrain only).
3. **Real terrain's picture is the camera's own** (decided 2026-10-26), as
   the Image or Video effect keeps its own file. A place pick never
   changes Slot A or Slot B, so no warning is needed. The picture always
   fits the land exactly, because no slot fitting and no earlier effect
   changes it.
4. **Picking a place:** the list of striking places that the random
   terrain images use, without the flat ones and the deltas
   (`LAND_PLACES`), a Random button, and an
   Area setting for how wide the land is (in kilometers). A search box
   for any place name is a later step.
5. **The sea:** heights below 0 m become flat water at 0, so coasts look
   right. A switch keeps the sea floor instead.

## How it works

- **Real terrain:** the loader picks the tile zoom from the Area and the
  screen width (about one tile pixel per screen pixel), fetches the tiles
  that cover the area (at most about 16), joins them on a canvas, and
  decodes the heights into a `Float32Array` (about 1024 x 576, the screen's
  shape). The lowest and highest heights of the area become 0 and 1, so
  Height works the same for a low hill and for the Himalayas.
- **The height texture:** one channel, `R16F` (WebGL 2 can filter it),
  with mipmaps, so Smooth still blurs the land. `CAMERA_FIELD_SHADER`
  reads this texture instead of the picture's brightness when the source
  is Real terrain. The rest of the camera (the max pyramid, the ray march,
  light, shadow, fog) stays as it is.
- **Generated:** `CAMERA_FIELD_SHADER` makes the height itself: layers of
  noise (fractal), with ridges for sharp mountain tops. New settings:
  Scale, Roughness, Ridges and Seed. It costs one shader pass, as today.
- **The terrain picture:** a second texture, at the same size as the
  heights. With Terrain picture as the color, `CAMERA_SHADER` reads the
  land's color from it instead of from the picture made so far.
- **The scene file:** a scene with Real terrain keeps its heights and its
  picture in the `.ksage` file as more parts ("terrain": 16-bit heights
  plus the place, the area and the lowest and highest meters;
  "terrain picture": the NASA picture), so it opens without the
  internet. Generated keeps only its settings.
- **Undo** keeps the height source and its settings; the heights
  themselves change only with a new place pick.

## Steps

1. **Height source menu and Generated.** Built 2026-10-26. No network. It shows at once
   whether the camera's land looks good with real mountain shapes.
2. **Height colors.** Built 2026-10-26. The gradient by height, as a color choice.
3. **Real terrain.** Built 2026-10-26. The place picker, the tile loader, the height
   texture, and the terrain picture as a color choice.
4. **Save and open** the heights in the scene file; Undo; RULES.md and
   the help topics.

Each step is a commit, checked off screen (pictures of the land) before
the user tries it.

## Built notes (step 3)

- The tile zoom is the one at which the area is at most 2048 tile pixels
  wide, so the heights are about 1000 to 2048 samples across.
- The finest zoom is 12 (about 30 m per pixel, the data's own detail; it is
  about 90 m in parts of Asia). Finer zooms blew the heights up in hard
  steps, which showed as blocks. A small area now has fewer heights, and
  the field shader reads them with smooth cubic curves.
- The lowest land is the height under 0.5% of the area, so rare holes in
  the tiles (0 m in high mountains) do not stretch the range.
- The height field stays 0 to 1 (the camera starts each ray at the top of
  that range, so a higher height was cut flat: plateaus on small areas).
  The land's relief (its height range over the area's north-south size,
  times 8) scales the camera's Height, so Height 0.25 shows real terrain
  at twice its true height.
- The picture is Landsat WELD (30 m), with Blue Marble (500 m) as the
  backup. With no picture, Terrain picture colors are Height colors.
- Save keeps the land (built 2026-10-27, part of step 4): the scene's JSON
  has "terrain" (the place, the area, the heights' size and range, the
  heights as 16-bit gzip base64, and the picture as a JPEG), while Terrain
  is in the list with Real terrain heights or Terrain picture colors. A
  new load counts as an unsaved change. The dev reload keeper keeps it too.

## Open points

- A search box for any place (it needs a free place-name service).
- Moving across a large area (new tiles as the camera flies on), not one
  fixed area.
- The Terrain Tiles have about 30 m detail in most places; a very small
  Area looks soft.
