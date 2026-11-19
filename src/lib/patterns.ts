/**
 * Test patterns that show the effects clearly: hard black-and-white edges,
 * repeating patterns, and patterns that never repeat. They are drawn at 4K
 * when picked, so the app ships no image files; the random ones come out
 * different each time. tools/make-test-images.py makes the same kinds as files.
 * The repeating patterns fit a whole number of tiles across and down (both
 * sides divide by 120), so they repeat with no seam.
 */

import { repeatingImages } from "../engine/engine";

export const PATTERN_WIDTH = 3840;
export const PATTERN_HEIGHT = 2160;

type Draw = (context: CanvasRenderingContext2D, width: number, height: number) => void;

export interface Pattern {
  id: string;
  label: string;
  group: "Templates" | "Repeating" | "Not repeating";
  draw: Draw;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];

function checkerboard(square: number): Draw {
  return (context, width, height) => {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#000";
    for (let row = 0; row * square < height; row++) {
      for (let column = 0; column * square < width; column++) {
        if ((row + column) % 2 === 0) context.fillRect(column * square, row * square, square, square);
      }
    }
  };
}

function dotGrid(spacing: number): Draw {
  return (context, width, height) => {
    context.fillStyle = "#0c0c10";
    context.fillRect(0, 0, width, height);
    const radius = spacing * 0.32;
    const rows = Math.round(height / spacing);
    const columns = Math.round(width / spacing);
    for (let row = 0; row * spacing < height; row++) {
      for (let column = 0; column * spacing < width; column++) {
        /* The hue goes once around across and once down, so the repeat meets itself. */
        context.fillStyle = `hsl(${((row / rows + column / columns) % 1) * 360} 85% 55%)`;
        context.beginPath();
        context.arc(column * spacing + spacing / 2, row * spacing + spacing / 2, radius, 0, Math.PI * 2);
        context.fill();
      }
    }
  };
}

/** The hue goes once around across. The brightness goes up and back down, so the repeat meets itself both ways. */
function colorGrid(tile: number): Draw {
  return (context, width, height) => {
    const columns = Math.ceil(width / tile);
    const rows = Math.ceil(height / tile);
    for (let row = 0; row < rows; row++) {
      const brightness = 1 - Math.abs((2 * row) / rows - 1);
      for (let column = 0; column < columns; column++) {
        context.fillStyle = `hsl(${(column / columns) * 360} 90% ${10 + 80 * brightness}%)`;
        context.fillRect(column * tile, row * tile, tile, tile);
      }
    }
  };
}

/** Layers of random color noise, each finer and fainter, enlarged smoothly: soft colored clouds. */
const colorClouds: Draw = (context, width, height) => {
  context.fillStyle = "#808080";
  context.fillRect(0, 0, width, height);
  let total = 0;
  [6, 12, 24, 48, 96].forEach((rows, octave) => {
    const weight = 0.5 ** octave;
    const small = document.createElement("canvas");
    small.height = rows;
    small.width = Math.round(rows * width / height);
    const smallContext = small.getContext("2d")!;
    const pixels = smallContext.createImageData(small.width, small.height);
    for (let index = 0; index < pixels.data.length; index++) pixels.data[index] = index % 4 === 3 ? 255 : Math.random() * 255;
    smallContext.putImageData(pixels, 0, 0);
    context.save();
    context.globalAlpha = weight / (total + weight);
    context.imageSmoothingQuality = "high";
    /* The blur hides the straight edges that plain enlarging leaves between the noise cells. */
    context.filter = `blur(${Math.round(height / rows / 3)}px)`;
    context.drawImage(small, 0, 0, width, height);
    context.restore();
    total += weight;
  });
  context.filter = "contrast(2.4) saturate(1.6)";
  context.drawImage(context.canvas, 0, 0);
  context.filter = "none";
};

/** Thin light lines at random angles on black: shows the motion blur direction clearly. */
const scatteredLines: Draw = (context, width, height) => {
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  context.lineCap = "round";
  for (let index = 0; index < 1800; index++) {
    const x = rand(0, width);
    const y = rand(0, height);
    const angle = rand(0, Math.PI * 2);
    const length = rand(40, 600);
    const gray = Math.round(rand(140, 255));
    context.strokeStyle = `rgb(${gray} ${gray} ${gray})`;
    context.lineWidth = pick([1, 2, 3, 6]);
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    context.stroke();
  }
};

/**
 * Truchet tiles: each square tile has two quarter circles around opposite
 * corners, and is turned at random. The curves meet at the middle of each
 * tile side, so they join into long paths and closed loops, different each
 * time, and the pattern repeats with no seam. A wide colored band (the hue
 * goes once around across) with a thin white line along its middle, on black.
 */
function truchetTiles(tile: number): Draw {
  return (context, width, height) => {
    const curves = new Path2D();
    const quarter = Math.PI / 2;
    for (let y = 0; y < height; y += tile) {
      for (let x = 0; x < width; x += tile) {
        const turned = Math.random() < 0.5;
        const corners = turned ? [[x + tile, y, 1], [x, y + tile, 3]] : [[x, y, 0], [x + tile, y + tile, 2]];
        for (const [cornerX, cornerY, start] of corners) {
          curves.moveTo(cornerX + Math.cos(start * quarter) * tile / 2, cornerY + Math.sin(start * quarter) * tile / 2);
          curves.arc(cornerX, cornerY, tile / 2, start * quarter, (start + 1) * quarter);
        }
      }
    }
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#fff";
    context.lineWidth = tile * 0.3;
    context.stroke(curves);
    /* The colors go on the white bands only: black times a color stays black. */
    const hues = context.createLinearGradient(0, 0, width, 0);
    for (let stop = 0; stop <= 12; stop++) hues.addColorStop(stop / 12, `hsl(${stop * 30} 90% 55%)`);
    context.globalCompositeOperation = "multiply";
    context.fillStyle = hues;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = "source-over";
    context.lineWidth = tile * 0.03;
    context.stroke(curves);
  };
}

/**
 * Rings: sharp circles around the center, out to the corners, on black. The
 * widths and the spaces between them are random, from thin lines to wide
 * bands, so each time is different. The hue goes two times around from the
 * center to the corner, from a random start; some thin rings are white.
 */
const rings: Draw = (context, width, height) => {
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  const reach = Math.hypot(width, height) / 2;
  const firstHue = rand(0, 360);
  let inner = rand(10, 60);
  while (inner < reach) {
    const ringWidth = pick([3, 6, 12, 24, 48]) * rand(0.7, 1.3);
    const white = ringWidth < 10 && Math.random() < 0.35;
    context.strokeStyle = white ? "#fff" : `hsl(${firstHue + (inner / reach) * 720} 90% 55%)`;
    context.lineWidth = ringWidth;
    context.beginPath();
    context.arc(width / 2, height / 2, inner + ringWidth / 2, 0, Math.PI * 2);
    context.stroke();
    inner += ringWidth + pick([6, 12, 24, 48]) * rand(0.7, 1.3);
  }
};

/**
 * Sunburst: sharp rays from the center out past the corners, on black. The
 * widths and the spaces between them are random, from thin lines to wide
 * wedges, so each time is different. The colors are warm only: the hue goes
 * from pink (320) through red and orange to yellow (55) and back, two times
 * around the center, from a random start. Some thin rays are white.
 */
const sunburst: Draw = (context, width, height) => {
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  const reach = Math.hypot(width, height) / 2 + 10;
  const firstTurn = Math.random();
  const degree = Math.PI / 180;
  const turn = Math.PI * 2;
  let angle = 0;
  while (angle < turn) {
    const rayWidth = Math.min(pick([0.4, 0.8, 1.5, 3, 6]) * rand(0.7, 1.3) * degree, turn - angle);
    const white = rayWidth < degree && Math.random() < 0.35;
    context.fillStyle = white ? "#fff" : `hsl(${320 + 95 * (0.5 - 0.5 * Math.cos((angle / turn + firstTurn) * 2 * turn))} 95% 55%)`;
    context.beginPath();
    context.moveTo(width / 2, height / 2);
    context.arc(width / 2, height / 2, reach, angle, angle + rayWidth);
    context.fill();
    angle += rayWidth + pick([0.8, 1.5, 3, 6]) * rand(0.7, 1.3) * degree;
  }
};

/**
 * Star field: bright points on black, different each time. Most are very
 * small, some are larger with a soft glow, and a few are large with a glow
 * and four thin rays. The colors are those of stars: white, with light blue,
 * yellow, orange and red. Much black stays open, for the effects that add
 * light (Trails, Bloom, Light rays).
 */
const starField: Draw = (context, width, height) => {
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  const star = (radius: number, glow: number, rays: number) => {
    const x = rand(0, width);
    const y = rand(0, height);
    const hue = pick([215, 215, 200, 50, 35, 20, 5]);
    const base = Math.random() < 0.4 ? "0 0% 100%" : `${hue} ${Math.round(rand(50, 100))}% ${Math.round(rand(70, 85))}%`;
    const color = (opacity: number) => `hsl(${base} / ${opacity})`;
    if (glow > 0) {
      const halo = context.createRadialGradient(x, y, radius * 0.5, x, y, radius * glow);
      halo.addColorStop(0, color(0.55));
      halo.addColorStop(0.35, color(0.12));
      halo.addColorStop(1, color(0));
      context.fillStyle = halo;
      context.fillRect(x - radius * glow, y - radius * glow, radius * glow * 2, radius * glow * 2);
    }
    if (rays > 0) {
      /* Each ray is a long thin diamond: bright at the star, a point at its end. */
      context.fillStyle = color(0.8);
      for (const [alongX, alongY] of [[1, 0], [0, 1]]) {
        context.beginPath();
        context.moveTo(x - alongX * radius * rays, y - alongY * radius * rays);
        context.lineTo(x - alongY * radius * 0.3, y - alongX * radius * 0.3);
        context.lineTo(x + alongX * radius * rays, y + alongY * radius * rays);
        context.lineTo(x + alongY * radius * 0.3, y + alongX * radius * 0.3);
        context.fill();
      }
    }
    context.fillStyle = color(glow > 0 ? 1 : rand(0.35, 1));
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  };
  for (let index = 0; index < 2600; index++) star(rand(0.8, 2.6), 0, 0);
  for (let index = 0; index < 220; index++) star(rand(3, 7), 5, 0);
  for (let index = 0; index < 28; index++) star(rand(8, 18), 7, rand(8, 14));
};

/** Black, with one white band from top to bottom through the center, "part" of the width wide. */
function centerLine(part: number): Draw {
  return (context, width, height) => {
    const lineWidth = Math.round(width * part);
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#fff";
    context.fillRect(Math.round((width - lineWidth) / 2), 0, lineWidth, height);
  };
}

/**
 * Dark Stage: not a test pattern but a plain background to build on, for
 * lasers or light rays. A top-to-bottom gradient in the app's own dark
 * colors, with a little noise so the slow gradient shows no bands.
 */
const darkStage: Draw = (context, width, height) => {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#2c303b");
  gradient.addColorStop(0.55, "#1d2029");
  gradient.addColorStop(1, "#14161c");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const noise = Math.round(Math.random() * 2 - 1);
    pixels.data[index] += noise;
    pixels.data[index + 1] += noise;
    pixels.data[index + 2] += noise;
  }
  context.putImageData(pixels, 0, 0);
};

/** Solid Black: a plain black background, so only the added effects show. */
const solidBlack: Draw = (context, width, height) => {
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
};

export const PATTERNS: Pattern[] = [
  { id: "dark-stage", label: "Dark Stage", group: "Templates", draw: darkStage },
  { id: "solid-black", label: "Solid Black", group: "Templates", draw: solidBlack },
  { id: "checker-large", label: "Checkerboard", group: "Repeating", draw: checkerboard(120) },
  { id: "dots", label: "Dot grid", group: "Repeating", draw: dotGrid(120) },
  { id: "color-grid", label: "Color grid", group: "Repeating", draw: colorGrid(120) },
  { id: "truchet", label: "Truchet tiles", group: "Repeating", draw: truchetTiles(240) },
  { id: "center-line", label: "Center line", group: "Not repeating", draw: centerLine(0.25) },
  { id: "rings", label: "Rings", group: "Not repeating", draw: rings },
  { id: "sunburst", label: "Sunburst", group: "Not repeating", draw: sunburst },
  { id: "stars", label: "Star field", group: "Not repeating", draw: starField },
  { id: "clouds", label: "Color clouds", group: "Not repeating", draw: colorClouds },
  { id: "lines", label: "Scattered lines", group: "Not repeating", draw: scatteredLines }
];

export function drawPattern(pattern: Pattern): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = PATTERN_WIDTH;
  canvas.height = PATTERN_HEIGHT;
  pattern.draw(canvas.getContext("2d")!, PATTERN_WIDTH, PATTERN_HEIGHT);
  if (pattern.group === "Repeating") repeatingImages.add(canvas);
  return canvas;
}
