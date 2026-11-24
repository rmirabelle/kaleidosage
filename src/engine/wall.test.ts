import { describe, expect, it } from "vitest";
import { wallCells, wallGrid } from "./wall";

describe("wallGrid", () => {
  it("gives the columns that the rows need", () => {
    expect(wallGrid(4, 1)).toEqual({ rows: 1, columns: 4 });
    expect(wallGrid(4, 2)).toEqual({ rows: 2, columns: 2 });
    expect(wallGrid(4, 4)).toEqual({ rows: 4, columns: 1 });
  });

  it("never has more rows than files, or empty rows", () => {
    expect(wallGrid(3, 8)).toEqual({ rows: 3, columns: 1 });
    /* 5 files in 4 rows need 2 columns, which fill only 3 rows. */
    expect(wallGrid(5, 4)).toEqual({ rows: 3, columns: 2 });
    expect(wallGrid(0, 2)).toEqual({ rows: 0, columns: 0 });
  });
});

describe("wallCells", () => {
  it("splits the picture into equal cells, top row first", () => {
    expect(wallCells(4, 2, 0, 100, 50)).toEqual([
      { x: 0, y: 25, width: 50, height: 25 },
      { x: 50, y: 25, width: 50, height: 25 },
      { x: 0, y: 0, width: 50, height: 25 },
      { x: 50, y: 0, width: 50, height: 25 }
    ]);
  });

  it("puts the gap between the cells only", () => {
    const cells = wallCells(2, 1, 0.1, 210, 100);
    expect(cells).toEqual([
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 110, y: 0, width: 100, height: 100 }
    ]);
  });

  it("centers a last row that is not full", () => {
    const cells = wallCells(3, 2, 0, 100, 100);
    expect(cells[2]).toEqual({ x: 25, y: 0, width: 50, height: 50 });
  });
});
