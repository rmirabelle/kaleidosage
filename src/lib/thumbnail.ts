/**
 * The YouTube thumbnail template: 1280 by 720, as the song thumbnails made
 * by hand. The picture is at the right, a dark shade comes in from the left,
 * and at the left are the artist, the title (a spaced top line and a large
 * main line in the accent color, with a glow) and "on KALEIDO SAGE" with
 * the logo. Every part is drawn on a canvas, so the app needs no other tool.
 */

export const THUMB_WIDTH = 1280;
export const THUMB_HEIGHT = 720;

export interface ThumbnailSpec {
  /** A small spaced line above the title; empty leaves it out. */
  artist: string;
  /** The spaced line above the main line; empty leaves it out. */
  topLine: string;
  /** The large line of the title. */
  mainLine: string;
  /** The accent color, as #rrggbb. */
  accent: string;
  /** Where the middle of the picture is, from 0 (the middle of the thumbnail) to 1 (the right edge). */
  pictureX: number;
  /** How large the picture is: 1 fills the height of the thumbnail. */
  zoom: number;
}

const FONT = `Bahnschrift, "Segoe UI", sans-serif`;
const LEFT = 58;
/** The main line is never wider than this, so it stays clear of the picture. */
const MAIN_MAX_WIDTH = 600;
/** How far the picture fades in from its left edge, in pixels. */
const EDGE_FADE = 320;

/** Splits a title into the top line and the main line: the last word is the main line. */
export function splitTitle(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return { topLine: "", mainLine: words[0] ?? "" };
  return { topLine: words.slice(0, -1).join(" "), mainLine: words[words.length - 1] };
}

const hex = (value: number) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0");
const toRgb = (color: string) => {
  const value = parseInt(color.replace("#", ""), 16) || 0;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};
/** "color" mixed with white: 0 keeps the color, 1 gives white. */
const lighter = (color: string, amount: number) => `#${toRgb(color).map((channel) => hex(channel + (255 - channel) * amount)).join("")}`;
const darker = (color: string, amount: number) => `#${toRgb(color).map((channel) => hex(channel * (1 - amount))).join("")}`;
const withAlpha = (color: string, alpha: number) => `rgba(${toRgb(color).join(", ")}, ${alpha})`;

/**
 * The accent color of a picture: the average color of its bright, strongly
 * colored pixels, made bright and strong. A gray picture gives a light blue.
 */
export function pickAccent(image: CanvasImageSource & { width: number; height: number }) {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size).data;
  let red = 0, green = 0, blue = 0, weight = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2];
    const high = Math.max(r, g, b), low = Math.min(r, g, b);
    const saturation = high === 0 ? 0 : (high - low) / high;
    /* Bright, colored pixels count most. */
    const w = saturation * saturation * (high / 255);
    red += r * w;
    green += g * w;
    blue += b * w;
    weight += w;
  }
  if (weight < 1) return "#5fc8ff";
  const average = [red / weight, green / weight, blue / weight];
  /* Full brightness, and the colors spread apart, so the glow is strong. */
  const high = Math.max(...average), low = Math.min(...average);
  const spread = high - low || 1;
  return `#${average.map((channel) => hex(((channel - low) / spread) * 200 + 55)).join("")}`;
}

let logo: Promise<HTMLImageElement | null> | null = null;
const loadLogo = () => logo ??= new Promise((resolve) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => resolve(null);
  image.src = "/kaleido-sage-logo.png";
});

/** Loads the font and the logo; call it before drawThumbnail. */
export async function thumbnailReady() {
  await Promise.all([
    document.fonts.load(`700 100px ${FONT}`),
    document.fonts.load(`600 100px ${FONT}`),
    document.fonts.load(`300 100px ${FONT}`)
  ]).catch(() => undefined);
  return loadLogo();
}

/** Text drawn with a glow: the blurred copies first, then the text. */
function glowText(context: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string | CanvasGradient, glows: { color: string; blur: number }[]) {
  context.save();
  context.fillStyle = fill;
  for (const glow of glows) {
    context.shadowColor = glow.color;
    context.shadowBlur = glow.blur;
    context.fillText(text, x, y);
  }
  context.shadowColor = "transparent";
  context.fillText(text, x, y);
  context.restore();
}

/** Draws the thumbnail of "picture" into "context", which is THUMB_WIDTH by THUMB_HEIGHT. */
export function drawThumbnail(context: CanvasRenderingContext2D, picture: CanvasImageSource & { width: number; height: number }, spec: ThumbnailSpec, logoImage: HTMLImageElement | null) {
  const accent = spec.accent;
  context.save();
  context.fillStyle = "#07080d";
  context.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);

  /* The picture fills the height (times the zoom), with its middle at pictureX. */
  const scale = (THUMB_HEIGHT * spec.zoom) / picture.height;
  const width = picture.width * scale;
  const height = picture.height * scale;
  const middle = THUMB_WIDTH / 2 + spec.pictureX * (THUMB_WIDTH / 2);
  context.filter = "contrast(1.15) saturate(1.1)";
  const left = middle - width / 2;
  context.drawImage(picture, left, (THUMB_HEIGHT - height) / 2, width, height);
  context.filter = "none";
  /* A picture that starts inside the thumbnail fades in from its left edge, so the edge does not show. */
  if (left > -EDGE_FADE) {
    const edge = context.createLinearGradient(left, 0, left + EDGE_FADE, 0);
    edge.addColorStop(0, "#07080d");
    edge.addColorStop(1, "rgba(7, 8, 13, 0)");
    context.fillStyle = edge;
    context.fillRect(0, 0, left + EDGE_FADE, THUMB_HEIGHT);
  }

  /* The shade from the left, and a little from the bottom, so the text reads on any picture. */
  const shade = darker(accent, 0.94);
  const across = context.createLinearGradient(0, 0, THUMB_WIDTH, 0);
  across.addColorStop(0, withAlpha(shade, 0.96));
  across.addColorStop(0.32, withAlpha(shade, 0.88));
  across.addColorStop(0.54, withAlpha(shade, 0.3));
  across.addColorStop(0.66, withAlpha(shade, 0));
  context.fillStyle = across;
  context.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
  const up = context.createLinearGradient(0, THUMB_HEIGHT, 0, THUMB_HEIGHT * 0.75);
  up.addColorStop(0, withAlpha(shade, 0.55));
  up.addColorStop(1, withAlpha(shade, 0));
  context.fillStyle = up;
  context.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);

  /* The text block: its parts and their heights, then the block in the middle of the height. */
  context.textBaseline = "alphabetic";
  context.textAlign = "left";
  const artist = spec.artist.trim().toUpperCase();
  const top = spec.topLine.trim().toUpperCase();
  const main = spec.mainLine.trim().toUpperCase();
  context.font = `700 220px ${FONT}`;
  context.fontStretch = "condensed";
  context.letterSpacing = "2px";
  const mainSize = main ? Math.max(70, Math.min(220, 220 * MAIN_MAX_WIDTH / Math.max(1, context.measureText(main).width))) : 0;
  context.fontStretch = "normal";
  /* A long top line gets smaller, to stay as wide as the main line can be. */
  context.font = `600 66px ${FONT}`;
  context.letterSpacing = "18px";
  const topSize = top ? Math.min(66, 66 * MAIN_MAX_WIDTH / Math.max(1, context.measureText(top).width)) : 0;
  const ARTIST = 30, LOGO = 78;
  const parts = [
    artist ? ARTIST + 28 : 0,
    top ? topSize + (main ? 6 : 0) : 0,
    main ? mainSize * 0.86 : 0,
    38 + LOGO
  ];
  let y = (THUMB_HEIGHT - parts.reduce((sum, part) => sum + part, 0)) / 2;

  if (artist) {
    context.font = `600 ${ARTIST}px ${FONT}`;
    context.letterSpacing = "6px";
    glowText(context, artist, LEFT, y + ARTIST * 0.85, lighter(accent, 0.55), [{ color: withAlpha(accent, 0.6), blur: 14 }]);
    y += parts[0];
  }
  if (top) {
    context.font = `600 ${topSize}px ${FONT}`;
    context.letterSpacing = `${Math.round(topSize * 0.27)}px`;
    glowText(context, top, LEFT, y + topSize * 0.86, lighter(accent, 0.85), [{ color: withAlpha(accent, 0.6), blur: 18 }]);
    y += parts[1];
  }
  if (main) {
    context.font = `700 ${mainSize}px ${FONT}`;
    context.fontStretch = "condensed";
    context.letterSpacing = "2px";
    const baseline = y + mainSize * 0.8;
    const fill = context.createLinearGradient(0, baseline - mainSize * 0.72, 0, baseline);
    fill.addColorStop(0, "#ffffff");
    fill.addColorStop(0.35, lighter(accent, 0.7));
    fill.addColorStop(0.7, accent);
    fill.addColorStop(1, darker(accent, 0.2));
    glowText(context, main, LEFT, baseline, fill, [{ color: withAlpha(accent, 0.5), blur: 44 }, { color: withAlpha(accent, 0.75), blur: 16 }]);
    context.fontStretch = "normal";
    y += parts[2];
  }

  /* "on KALEIDO SAGE" with the logo. */
  y += 38;
  let x = LEFT;
  if (logoImage) {
    context.save();
    context.shadowColor = "rgba(120, 120, 255, 0.8)";
    context.shadowBlur = 12;
    context.drawImage(logoImage, x, y, LOGO, LOGO);
    context.restore();
    x += LOGO + 16;
  }
  const rowMiddle = y + LOGO / 2;
  context.textBaseline = "middle";
  context.font = `300 34px ${FONT}`;
  context.letterSpacing = "2px";
  context.fillStyle = lighter(accent, 0.85);
  context.fillText("on", x, rowMiddle + 2);
  x += context.measureText("on").width + 16;
  context.font = `700 50px ${FONT}`;
  context.letterSpacing = "3px";
  const nameWidth = context.measureText("KALEIDO SAGE").width;
  const name = context.createLinearGradient(x, 0, x + nameWidth, 0);
  name.addColorStop(0, "#4fd9ff");
  name.addColorStop(0.5, "#7a5cff");
  name.addColorStop(1, "#ff3fd0");
  context.fillStyle = name;
  context.fillText("KALEIDO SAGE", x, rowMiddle + 2);
  context.restore();
}
