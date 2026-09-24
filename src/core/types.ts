/** Shared pure types — safe to import from anywhere, no Phaser dependency. */

export type Special = 'none' | 'lineH' | 'lineV' | 'bomb' | 'hyper';

export interface Cell {
  /** Gem colour index, or -1 for a colourless hypercube. */
  type: number;
  special: Special;
}

export type Grid = (Cell | null)[][];

export interface Pos {
  row: number;
  col: number;
}

export interface Run {
  orientation: 'h' | 'v';
  type: number;
  cells: Pos[];
}

export interface Group {
  type: number;
  cells: Pos[];
  runs: Run[];
  /** True when a horizontal and a vertical run cross (an L / T shape). */
  cross: boolean;
  crossCell: Pos | null;
  /** Length of the longest single run in the group. */
  longest: number;
}

export interface SpecialSpawn {
  pos: Pos;
  special: Special;
  type: number;
}

export interface Move {
  a: Pos;
  b: Pos;
}

export interface SerializedCell {
  t: number;
  s: Special;
}

export type SerializedGrid = (SerializedCell | null)[][];
