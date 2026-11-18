import type { GradientStop } from "./params";

/** How the Text effect's lines line up: 0 at the left, 1 at the center, 2 at the right. */
export type TextAlign = 0 | 1 | 2;
/** The Text effect's fill: 0 one color, 1 a linear gradient across the text. */
export type TextFill = 0 | 1;
/**
 * How the Text effect moves on its own: 0 it stays, 1 to 4 it scrolls
 * across the screen (left, right, up, down) and comes back in at the other
 * side, 5 its letters show one at a time, then it stays for Hold seconds
 * and starts again.
 */
export type TextMove = 0 | 1 | 2 | 3 | 4 | 5;

/** The text start-up words. */
export const DEFAULT_TEXT = "Kaleido Sage";
/** The longest text the effect keeps, in characters. */
export const MAX_TEXT_LENGTH = 2000;
/** Type on: letters a second at Speed 1. */
export const TYPE_RATE = 10;
/** Scroll: screens a second at Speed 1. */
export const SCROLL_RATE = 0.1;

/** What the text picture shows. Sizes are parts of the font size (em). */
export interface TextLook {
  content: string;
  font: string;
  bold: boolean;
  italic: boolean;
  align: TextAlign;
  fill: TextFill;
  color: string;
  stops: readonly GradientStop[];
  /** The gradient's direction in degrees: 0 left to right, 90 top to bottom. */
  gradientAngle: number;
  letterSpacing: number;
  lineSpacing: number;
  outline: number;
  outlineColor: string;
  glow: number;
  glowSize: number;
  glowColor: string;
  shadow: number;
  shadowSoftness: number;
  shadowDistance: number;
  shadowColor: string;
  /** How many letters show (not counting line breaks); more than the text has shows all of it. */
  shown: number;
}

/** The number of letters in the text, without its line breaks: what Type on counts. */
export const letterCount = (content: string) => content.replace(/\n/g, "").length;

/** The smallest and largest font size the picture is drawn at, in pixels. */
const MIN_PIXELS = 8;
const MAX_PIXELS = 768;
/** The longest side of the text picture, in pixels; larger text is drawn smaller and scaled up. */
const MAX_SIDE = 8192;

/**
 * The font size to draw at for a size of "pixels" on the screen: a step of
 * a quarter of an octave at or above it, so a Size that moves draws the
 * picture again only at each step (the screen scales the picture between).
 */
export function drawPixels(pixels: number): number {
  const clamped = Math.min(MAX_PIXELS, Math.max(MIN_PIXELS, pixels));
  return Math.min(MAX_PIXELS, 2 ** (Math.ceil(Math.log2(clamped) * 4) / 4));
}

/** The canvas font for a look at "pixels". The family is in quotes; a name the computer does not have falls back to the system font. */
export function canvasFont(look: Pick<TextLook, "font" | "bold" | "italic">, pixels: number): string {
  const family = look.font.replace(/["\\]/g, "").trim() || "Segoe UI";
  return `${look.italic ? "italic " : ""}${look.bold ? 700 : 400} ${pixels}px "${family}", "Segoe UI", sans-serif`;
}

/**
 * The text drawn into a canvas with its clear parts, for the Text effect
 * (see drawText in the renderer). It draws again only when its look or its
 * font size step changes. "lineHeight" is the drawn picture's line height in
 * pixels, so the renderer can scale it to the Size on the screen.
 */
export class TextPicture {
  readonly canvas = new OffscreenCanvas(1, 1);
  private readonly context = this.canvas.getContext("2d")!;
  private key = "";
  /** The font size the canvas was drawn at, in pixels. */
  pixels = 1;
  /** True when the canvas changed since the last call to take(). */
  private fresh = false;

  /** Draws the look at the font size step for "pixels" on the screen, if it is not drawn yet. Returns true when the canvas changed. */
  update(look: TextLook, pixels: number): boolean {
    let size = drawPixels(pixels);
    const key = JSON.stringify([look, size]);
    if (key === this.key) return false;
    this.key = key;
    size = this.draw(look, size);
    this.pixels = size;
    this.fresh = true;
    return true;
  }

  /** True once after each new drawing, so the renderer uploads it once. */
  take(): boolean {
    const fresh = this.fresh;
    this.fresh = false;
    return fresh;
  }

  /** Draws the text at "pixels"; a picture past MAX_SIDE draws at a smaller size. Returns the size it drew at. */
  private draw(look: TextLook, pixels: number): number {
    const ctx = this.context;
    const lines = look.content.split("\n");
    const measure = (size: number) => {
      ctx.font = canvasFont(look, size);
      ctx.letterSpacing = `${look.letterSpacing * size}px`;
      const widths = lines.map((line) => ctx.measureText(line).width);
      const lineHeight = size * Math.max(0.1, look.lineSpacing);
      /* Room around the letters for the outline, the glow and the shadow, so none is cut off. */
      const glowRoom = look.glow > 0 ? look.glowSize * 2 : 0;
      const shadowRoom = look.shadow > 0 ? look.shadowDistance + look.shadowSoftness * 2 : 0;
      const pad = Math.ceil(size * (look.outline + Math.max(glowRoom, shadowRoom) + 0.25)) + 2;
      const width = Math.max(1, ...widths);
      const height = lineHeight * lines.length;
      return { widths, lineHeight, pad, width, height, canvasWidth: Math.ceil(width + pad * 2), canvasHeight: Math.ceil(height + pad * 2) };
    };
    let size = pixels;
    let box = measure(size);
    const over = Math.max(box.canvasWidth, box.canvasHeight) / MAX_SIDE;
    if (over > 1) {
      size = Math.max(1, Math.floor(size / over));
      box = measure(size);
    }
    this.canvas.width = box.canvasWidth;
    this.canvas.height = box.canvasHeight;
    /* A new size clears the canvas and its settings. */
    ctx.font = canvasFont(look, size);
    ctx.letterSpacing = `${look.letterSpacing * size}px`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.lineJoin = "round";

    /* Each line, cut to the letters that show; a line keeps the place of its whole text, so typing does not move the letters. */
    let left = Math.max(0, Math.floor(look.shown));
    const placed = lines.map((line, index) => {
      const text = line.slice(0, left);
      left = Math.max(0, left - line.length);
      const offset = look.align === 0 ? 0 : look.align === 1 ? (box.width - box.widths[index]) / 2 : box.width - box.widths[index];
      return { text, x: box.pad + offset, y: box.pad + box.lineHeight * (index + 0.5) };
    }).filter((line) => line.text.length > 0);

    const lettersOf = (draw: (text: string, x: number, y: number) => void, dx = 0, dy = 0) => {
      for (const line of placed) draw(line.text, line.x + dx, line.y + dy);
    };
    const outlineWidth = look.outline * size * 2;
    const solid = (style: string, dx = 0, dy = 0) => {
      ctx.fillStyle = style;
      ctx.strokeStyle = style;
      lettersOf((text, x, y) => {
        if (outlineWidth > 0) {
          ctx.lineWidth = outlineWidth;
          ctx.strokeText(text, x, y);
        }
        ctx.fillText(text, x, y);
      }, dx, dy);
    };

    if (look.shadow > 0) {
      const distance = look.shadowDistance * size;
      ctx.save();
      ctx.globalAlpha = Math.min(1, look.shadow);
      ctx.filter = look.shadowSoftness > 0 ? `blur(${look.shadowSoftness * size}px)` : "none";
      solid(look.shadowColor, distance * Math.SQRT1_2, distance * Math.SQRT1_2);
      ctx.restore();
    }
    if (look.glow > 0) {
      /* A wide soft haze and a tighter one: the light of a neon tube. Glow over 1 draws the tight one again. */
      ctx.save();
      const passes: [number, number][] = [[look.glowSize, Math.min(1, look.glow)], [look.glowSize / 3, Math.min(1, look.glow)]];
      if (look.glow > 1) passes.push([look.glowSize / 3, Math.min(1, look.glow - 1)]);
      for (const [blur, alpha] of passes) {
        ctx.globalAlpha = alpha;
        ctx.filter = `blur(${Math.max(0.5, blur * size)}px)`;
        solid(look.glowColor);
      }
      ctx.restore();
    }
    if (outlineWidth > 0) {
      ctx.lineWidth = outlineWidth;
      ctx.strokeStyle = look.outlineColor;
      lettersOf((text, x, y) => ctx.strokeText(text, x, y));
    }
    ctx.fillStyle = this.fillStyle(look, box.pad, box.width, box.height);
    lettersOf((text, x, y) => ctx.fillText(text, x, y));
    return size;
  }

  /** The text's color: one color, or a gradient across the text's box at the gradient's angle. */
  private fillStyle(look: TextLook, pad: number, width: number, height: number): string | CanvasGradient {
    if (look.fill === 0 || look.stops.length === 0) return look.color;
    const angle = look.gradientAngle * Math.PI / 180;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
    const cx = pad + width / 2;
    const cy = pad + height / 2;
    const gradient = this.context.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
    for (const stop of [...look.stops].sort((a, b) => a.at - b.at)) gradient.addColorStop(Math.min(1, Math.max(0, stop.at)), stop.color);
    return gradient;
  }
}
