import type { Cell, Grid, Group, Move, Pos, SerializedCell, SerializedGrid, Special } from './types';

export const posKey = (p: Pos): string => `${p.row},${p.col}`;
export const keyAt = (row: number, col: number): string => `${row},${col}`;
export const parseKey = (k: string): Pos => {
  const [row, col] = k.split(',').map(Number);
  return { row, col };
};

export const inBounds = (grid: Grid, p: Pos): boolean =>
  p.row >= 0 && p.row < grid.length && p.col >= 0 && p.col < grid[0].length;

export const areNeighbours = (a: Pos, b: Pos): boolean =>
  Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;

export const cloneCell = (cell: Cell | null): Cell | null =>
  cell ? { type: cell.type, special: cell.special } : null;

export const cloneGrid = (grid: Grid): Grid => grid.map((row) => row.map(cloneCell));

export const eachPos = (grid: Grid, fn: (p: Pos, cell: Cell) => void): void => {
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const cell = grid[row][col];
      if (cell) fn({ row, col }, cell);
    }
  }
};

export interface Fall {
  pos: Pos;
  fromRow: number;
}

export interface Spawn extends Pos {
  /** How many rows above the board this gem starts (for the drop-in animation). */
  rowsAbove: number;
}

// ── Board creation ────────────────────────────────────────────────────────────

/** Would placing `type` at (row, col) complete a run of three using already-placed cells? */
const completesRun = (grid: Grid, row: number, col: number, type: number): boolean => {
  const at = (r: number, c: number): number | undefined => grid[r]?.[c]?.type;
  return (
    (col >= 2 && at(row, col - 1) === type && at(row, col - 2) === type) ||
    (row >= 2 && at(row - 1, col) === type && at(row - 2, col) === type)
  );
};

/** Build a match-free board that already contains at least one legal move. */
export function createGrid(
  cols: number,
  rows: number,
  types: number,
  rand: () => number = Math.random,
): Grid {
  for (let attempt = 0; attempt < 40; attempt++) {
    const grid: Grid = [];
    for (let row = 0; row < rows; row++) {
      grid.push(new Array<Cell | null>(cols).fill(null));
      for (let col = 0; col < cols; col++) {
        let type = Math.floor(rand() * types);
        let guard = 0;
        while (completesRun(grid, row, col, type) && guard++ < 60) {
          type = Math.floor(rand() * types);
        }
        grid[row][col] = { type, special: 'none' };
      }
    }

    // Guarantee the board opens with something to do.
    if (findValidMoves(grid, 1).length > 0) return grid;
  }

  // Statistically unreachable, but never return a dead board.
  const fallback: Grid = [];
  for (let row = 0; row < rows; row++) {
    fallback.push(
      Array.from({ length: cols }, (_, col) => ({ type: (row + col) % types, special: 'none' as const })),
    );
  }
  return fallback;
}

// ── Mutation ──────────────────────────────────────────────────────────────────

export function swapCells(grid: Grid, a: Pos, b: Pos): void {
  const tmp = grid[a.row][a.col];
  grid[a.row][a.col] = grid[b.row][b.col];
  grid[b.row][b.col] = tmp;
}

/** Compact every column downwards; returns the position changes for animation. */
export function applyGravity(grid: Grid): Fall[] {
  const rows = grid.length;
  const cols = grid[0].length;
  const falls: Fall[] = [];

  for (let col = 0; col < cols; col++) {
    let write = rows - 1;
    for (let row = rows - 1; row >= 0; row--) {
      const cell = grid[row][col];
      if (!cell) continue;
      if (write !== row) {
        grid[write][col] = cell;
        grid[row][col] = null;
        falls.push({ pos: { row: write, col }, fromRow: row });
      }
      write--;
    }
  }
  return falls;
}

/** Fill every empty cell with a fresh gem; returns spawn descriptors for animation. */
export function refill(
  grid: Grid,
  types: number,
  rand: () => number = Math.random,
): Spawn[] {
  const rows = grid.length;
  const cols = grid[0].length;
  const spawns: Spawn[] = [];

  for (let col = 0; col < cols; col++) {
    let empties = 0;
    for (let row = 0; row < rows; row++) if (!grid[row][col]) empties++;

    let placed = 0;
    for (let row = 0; row < rows; row++) {
      if (grid[row][col]) continue;
      grid[row][col] = { type: Math.floor(rand() * types), special: 'none' };
      spawns.push({ row, col, rowsAbove: empties - placed });
      placed++;
    }
  }
  return spawns;
}

// ── Matching ──────────────────────────────────────────────────────────────────

type RunFinder = (grid: Grid) => { orientation: 'h' | 'v'; type: number; cells: Pos[] }[];

/** All horizontal/vertical runs of three or more same-coloured gems (hypercubes excluded). */
export const findRuns: RunFinder = (grid) => {
  const rows = grid.length;
  const cols = grid[0].length;
  const runs: ReturnType<RunFinder> = [];

  for (let row = 0; row < rows; row++) {
    let col = 0;
    while (col < cols) {
      const type = grid[row][col]?.type ?? -1;
      if (type < 0) {
        col++;
        continue;
      }
      let end = col + 1;
      while (end < cols && grid[row][end]?.type === type) end++;
      if (end - col >= 3) {
        const cells: Pos[] = [];
        for (let c = col; c < end; c++) cells.push({ row, col: c });
        runs.push({ orientation: 'h', type, cells });
      }
      col = end;
    }
  }

  for (let col = 0; col < cols; col++) {
    let row = 0;
    while (row < rows) {
      const type = grid[row][col]?.type ?? -1;
      if (type < 0) {
        row++;
        continue;
      }
      let end = row + 1;
      while (end < rows && grid[end][col]?.type === type) end++;
      if (end - row >= 3) {
        const cells: Pos[] = [];
        for (let r = row; r < end; r++) cells.push({ row: r, col });
        runs.push({ orientation: 'v', type, cells });
      }
      row = end;
    }
  }

  return runs;
};

/** Runs grouped into connected shapes, so L/T crosses are detectable. */
export function findGroups(grid: Grid): Group[] {
  const runs = findRuns(grid);
  const used = new Array<boolean>(runs.length).fill(false);
  const groups: Group[] = [];

  for (let i = 0; i < runs.length; i++) {
    if (used[i]) continue;

    const bucket = [runs[i]];
    used[i] = true;

    // Union-find style closure: absorb every run that shares a cell with the bucket.
    let grew = true;
    while (grew) {
      grew = false;
      for (let j = 0; j < runs.length; j++) {
        if (used[j] || runs[j].type !== bucket[0].type) continue;
        const shares = bucket.some((run) =>
          run.cells.some((a) => runs[j].cells.some((b) => a.row === b.row && a.col === b.col)),
        );
        if (shares) {
          bucket.push(runs[j]);
          used[j] = true;
          grew = true;
        }
      }
    }

    const cellMap = new Map<string, Pos>();
    for (const run of bucket) for (const cell of run.cells) cellMap.set(posKey(cell), cell);

    const hRuns = bucket.filter((r) => r.orientation === 'h');
    const vRuns = bucket.filter((r) => r.orientation === 'v');
    let crossCell: Pos | null = null;
    for (const h of hRuns) {
      for (const v of vRuns) {
        const hit = h.cells.find((a) => v.cells.some((b) => a.row === b.row && a.col === b.col));
        if (hit) {
          crossCell = hit;
          break;
        }
      }
      if (crossCell) break;
    }

    groups.push({
      type: runs[i].type,
      cells: [...cellMap.values()],
      runs: bucket,
      cross: crossCell !== null,
      crossCell,
      longest: Math.max(...bucket.map((r) => r.cells.length)),
    });
  }

  return groups;
}

// ── Legal moves ───────────────────────────────────────────────────────────────

const swapMakesMatch = (grid: Grid, a: Pos, b: Pos): boolean => {
  swapCells(grid, a, b);
  const matched = findRuns(grid).length > 0;
  swapCells(grid, a, b);
  return matched;
};

/**
 * Every swap that would produce a match. Hypercubes are always playable, so a board
 * containing one is never considered deadlocked.
 */
export function findValidMoves(grid: Grid, limit = Number.POSITIVE_INFINITY): Move[] {
  const rows = grid.length;
  const cols = grid[0].length;
  const moves: Move[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const here: Pos = { row, col };
      const partners: Pos[] = [];
      if (col + 1 < cols) partners.push({ row, col: col + 1 });
      if (row + 1 < rows) partners.push({ row: row + 1, col });

      for (const there of partners) {
        const a = grid[row][col];
        const b = grid[there.row][there.col];
        if (!a || !b) continue;
        if (a.special === 'hyper' || b.special === 'hyper' || swapMakesMatch(grid, here, there)) {
          moves.push({ a: here, b: there });
          if (moves.length >= limit) return moves;
        }
      }
    }
  }
  return moves;
}

/** A swap is only legal if it causes a match, or involves a hypercube. */
export const isLegalSwap = (grid: Grid, a: Pos, b: Pos): boolean => {
  const cellA = grid[a.row]?.[a.col];
  const cellB = grid[b.row]?.[b.col];
  if (!cellA || !cellB) return false;
  if (cellA.special === 'hyper' || cellB.special === 'hyper') return true;
  return swapMakesMatch(grid, a, b);
};

// ── Shuffle ───────────────────────────────────────────────────────────────────

const fisherYates = <T>(items: T[], rand: () => number): T[] => {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * Rearrange the existing gems in place until the board is match-free *and* has a legal
 * move. Gems (and their specials) are preserved — no new gems are created.
 */
export function shuffleGrid(grid: Grid, rand: () => number = Math.random): boolean {
  const positions: Pos[] = [];
  const cells: Cell[] = [];
  eachPos(grid, (p, cell) => {
    positions.push(p);
    cells.push(cell);
  });

  for (let attempt = 0; attempt < 120; attempt++) {
    const shuffled = fisherYates(cells, rand);
    positions.forEach((p, i) => {
      grid[p.row][p.col] = shuffled[i];
    });
    if (findRuns(grid).length === 0 && findValidMoves(grid, 1).length > 0) return true;
  }
  return false;
}

// ── Serialization ─────────────────────────────────────────────────────────────

export const serializeGrid = (grid: Grid): SerializedGrid =>
  grid.map((row) => row.map((cell) => (cell ? { t: cell.type, s: cell.special } : null)));

export function deserializeGrid(data: unknown): Grid | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const grid: Grid = [];
  for (const row of data) {
    if (!Array.isArray(row)) return null;
    const out: (Cell | null)[] = [];
    for (const raw of row) {
      if (raw === null || raw === undefined) {
        out.push(null);
      } else if (typeof raw === 'object' && typeof (raw as SerializedCell).t === 'number') {
        const cell = raw as SerializedCell;
        out.push({ type: cell.t, special: (cell.s as Special) ?? 'none' });
      } else {
        return null;
      }
    }
    grid.push(out);
  }
  return grid;
}
