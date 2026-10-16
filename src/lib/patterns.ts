/**
 * Test patterns that show the effects clearly: hard black-and-white edges,
 * repeating patterns, and patterns that never repeat. They are drawn at 4K
 * when picked, so the app ships no image files; the random ones come out
 * different each time. tools/make-test-images.py makes the same kinds as files.
 */

export const PATTERN_WIDTH = 3840;
export const PATTERN_HEIGHT = 2160;

type Draw = (context: CanvasRenderingContext2D, width: number, height: number) => void;

export interface Pattern {
  id: string;
  label: string;
  group: "Repeating" | "Not repeating";
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
    for (let row = 0; row * spacing < height; row++) {
      for (let column = 0; column * spacing < width; column++) {
        context.fillStyle = `hsl(${((row * 0.07 + column * 0.03) % 1) * 360} 85% 55%)`;
        context.beginPath();
        context.arc(column * spacing + spacing / 2, row * spacing + spacing / 2, radius, 0, Math.PI * 2);
        context.fill();
      }
    }
  };
}

function colorGrid(tile: number): Draw {
  return (context, width, height) => {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    const columns = Math.ceil(width / tile);
    for (let row = 0; row * tile < height; row++) {
      for (let column = 0; column < columns; column++) {
        context.fillStyle = `hsl(${(column / columns) * 360} 90% ${row % 2 ? 30 : 50}%)`;
        context.fillRect(column * tile + 4, row * tile + 4, tile - 8, tile - 8);
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

/** Sharp-edged circles, boxes and triangles in random sizes and colors. */
const randomShapes: Draw = (context, width, height) => {
  context.fillStyle = "#08080a";
  context.fillRect(0, 0, width, height);
  for (let index = 0; index < 2500; index++) {
    const size = pick([12, 30, 60, 120, 240]) * rand(0.6, 1.4);
    const x = rand(-size, width);
    const y = rand(-size, height);
    context.fillStyle = `hsl(${rand(0, 360)} ${rand(30, 100)}% ${rand(35, 65)}%)`;
    const kind = Math.random();
    context.beginPath();
    if (kind < 0.4) {
      context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    } else if (kind < 0.7) {
      context.rect(x, y, size, size * rand(0.3, 1.5));
    } else {
      context.moveTo(x, y + size);
      context.lineTo(x + size / 2, y);
      context.lineTo(x + size, y + size);
    }
    context.fill();
  }
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

export const PATTERNS: Pattern[] = [
  { id: "checker-large", label: "Checkerboard, large", group: "Repeating", draw: checkerboard(120) },
  { id: "checker-fine", label: "Checkerboard, fine", group: "Repeating", draw: checkerboard(24) },
  { id: "dots", label: "Dot grid", group: "Repeating", draw: dotGrid(96) },
  { id: "color-grid", label: "Color grid", group: "Repeating", draw: colorGrid(160) },
  { id: "center-line", label: "Center line", group: "Not repeating", draw: centerLine(0.25) },
  { id: "clouds", label: "Color clouds", group: "Not repeating", draw: colorClouds },
  { id: "shapes", label: "Random shapes", group: "Not repeating", draw: randomShapes },
  { id: "lines", label: "Scattered lines", group: "Not repeating", draw: scatteredLines }
];

export function drawPattern(pattern: Pattern): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = PATTERN_WIDTH;
  canvas.height = PATTERN_HEIGHT;
  pattern.draw(canvas.getContext("2d")!, PATTERN_WIDTH, PATTERN_HEIGHT);
  return canvas;
}
