/**
 * Video Wall: where each file's cell is on the screen. The files fill the
 * rows from the top left, row by row. Rows is never more than the files;
 * the columns are as many as the fullest row needs. A last row with fewer
 * files than columns is centered. Gap is the space between the cells, in
 * screen heights; there is no space around the outside of the wall.
 */

/** The most files a Video Wall holds. Each video decodes on its own, so more would slow most PCs. */
export const WALL_MAX = 16;

/** One cell in pixels, with its origin at the bottom left of the picture (as WebGL has it). */
export interface WallCell {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The grid for "count" files and "rows" asked for: the rows and columns that it really has. */
export function wallGrid(count: number, rows: number) {
  if (count <= 0) return { rows: 0, columns: 0 };
  const asked = Math.min(count, Math.max(1, Math.round(rows)));
  const columns = Math.ceil(count / asked);
  return { rows: Math.ceil(count / columns), columns };
}

/** The cells of "count" files in a "width" by "height" pixel picture, in file order (whole pixels, so cells do not overlap). */
export function wallCells(count: number, rows: number, gap: number, width: number, height: number): WallCell[] {
  const grid = wallGrid(count, rows);
  if (grid.rows === 0) return [];
  const space = Math.max(0, gap) * height;
  const cellWidth = Math.max(0, (width - space * (grid.columns - 1)) / grid.columns);
  const cellHeight = Math.max(0, (height - space * (grid.rows - 1)) / grid.rows);
  const cells: WallCell[] = [];
  for (let index = 0; index < count; index++) {
    const row = Math.floor(index / grid.columns);
    const column = index % grid.columns;
    const inRow = Math.min(grid.columns, count - row * grid.columns);
    const shift = (grid.columns - inRow) * (cellWidth + space) / 2;
    const left = Math.round(shift + column * (cellWidth + space));
    const right = Math.round(shift + column * (cellWidth + space) + cellWidth);
    /* Row 0 is at the top; WebGL counts from the bottom. */
    const top = Math.round(row * (cellHeight + space));
    const bottom = Math.round(row * (cellHeight + space) + cellHeight);
    cells.push({ x: left, y: height - bottom, width: right - left, height: bottom - top });
  }
  return cells;
}
