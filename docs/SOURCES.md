# Source photos

A design note, written 2026-10-16. The source photo decides most of how
good the kaleidoscope looks.

## What works best

- High resolution: 4K (3840 pixels wide) at least. Smaller photos make a soft
  picture.
- Architecture with many small, repeating geometric details: ceilings, domes,
  mosque interiors, mosaics, stained glass.
- Photos with many small details, or the opposite: abstract pictures with
  few or no recognizable details (fractal art, textures).

## What the app does now

Both use Wikimedia Commons (`src/lib/images.ts`). It is free and needs no API key.

- The dice: a random photo from one of the curated themes (`THEMES`). Each
  theme is a Commons search, mostly limited to Featured pictures or Quality
  images. Each click takes the photo at a random place in the theme's
  results. Do not use the search's random sort: Commons caches each answer
  for an hour, so the same search returns the same photo for that hour.
- The search button on each source card (`ImageSearchDialog`): the user's
  words, with "Quality images only" on by default.
- Every search adds `filew:>3839 filemime:image/jpeg`, so only JPEG photos at
  least 4K wide come back. The photo downloads 3840 pixels wide.

To change the themes, test each search on Commons first: it should give at
least tens of 4K photos, and a sample of titles should look right.

## Later: generated images

We may add image generation as a third source, with a GPT Image API key,
the same as Image Sage does. Points to decide first:

- The user supplies and pays for the key. Store it the way Image Sage does,
  and never embed a key in the binary.
- Check the largest size the model makes. If it is below 4K, the picture
  will be softer than a Commons photo; an upscale step may be needed.
- A prompt can carry the same context as the themes: detailed, repeating
  geometric patterns, or abstract with no recognizable subject.
