import type { Grid, Group, Pos, Special, SpecialSpawn } from './types';
import { eachPos, inBounds, parseKey, posKey } from './board';

/** Cells removed by detonating `special` at `pos` (excluding the gem itself). */
export function blastCells(grid: Grid, pos: Pos, special: Special): Pos[] {
  const rows = grid.length;
  const cols = grid[0].length;
  const cells: Pos[] = [];

  switch (special) {
    case 'lineH':
      for (let col = 0; col < cols; col++) if (col !== pos.col) cells.push({ row: pos.row, col });
      break;
    case 'lineV':
      for (let row = 0; row < rows; row++) if (row !== pos.row) cells.push({ row, col: pos.col });
      break;
    case 'bomb':
      for (let row = pos.row - 1; row <= pos.row + 1; row++) {
        for (let col = pos.col - 1; col <= pos.col + 1; col++) {
          const p = { row, col };
          if (inBounds(grid, p) && !(row === pos.row && col === pos.col)) cells.push(p);
        }
      }
      break;
    default:
      break;
  }
  return cells;
}

/** Every cell holding a gem of `type` (used by the hypercube). */
export function hyperTargets(grid: Grid, type: number): Pos[] {
  const cells: Pos[] = [];
  eachPos(grid, (p, cell) => {
    if (cell.type === type) cells.push(p);
  });
  return cells;
}

export function mostCommonType(grid: Grid): number {
  const counts = new Map<number, number>();
  eachPos(grid, (_p, cell) => {
    if (cell.type < 0) return;
    counts.set(cell.type, (counts.get(cell.type) ?? 0) + 1);
  });
  let best = -1;
  let bestCount = -1;
  for (const [type, count] of counts) {
    if (count > bestCount) {
      best = type;
      bestCount = count;
    }
  }
  return best;
}

const middleOf = (cells: Pos[]): Pos => cells[Math.floor(cells.length / 2)];

/**
 * Decide which power gems a set of matches creates (spec §5.4).
 * Precedence: L/T cross → bomb, straight 5+ → hypercube, straight 4 → line blaster.
 * The player's swapped cell is preferred as the spawn point so the reward feels causal.
 */
export function planSpecials(groups: Group[], origin: Pos | null): SpecialSpawn[] {
  const spawns: SpecialSpawn[] = [];

  for (const group of groups) {
    const prefersOrigin =
      origin && group.cells.some((c) => c.row === origin.row && c.col === origin.col) ? origin : null;

    if (group.cross && group.crossCell) {
      spawns.push({ pos: prefersOrigin ?? group.crossCell, special: 'bomb', type: group.type });
      continue;
    }

    const longestRun = group.runs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));

    if (group.longest >= 5) {
      spawns.push({ pos: prefersOrigin ?? middleOf(longestRun.cells), special: 'hyper', type: -1 });
      continue;
    }

    if (group.longest === 4) {
      spawns.push({
        pos: prefersOrigin ?? middleOf(longestRun.cells),
        special: longestRun.orientation === 'h' ? 'lineH' : 'lineV',
        type: group.type,
      });
    }
  }

  return spawns;
}

export interface Detonation {
  pos: Pos;
  special: Special;
  type: number;
  /** Cells this detonation removes. */
  cells: Pos[];
}

/**
 * Expand a set of matched cells into everything that actually gets cleared, following
 * chains of power gems (a bomb inside a line blast detonates too, and so on).
 */
export function expandDetonations(
  grid: Grid,
  initial: Set<string>,
): { cleared: Set<string>; detonations: Detonation[] } {
  const cleared = new Set(initial);
  const detonations: Detonation[] = [];
  const queue: string[] = [...initial];
  const processed = new Set<string>();

  while (queue.length > 0) {
    const key = queue.shift() as string;
    if (processed.has(key)) continue;
    processed.add(key);

    const pos = parseKey(key);
    const cell = grid[pos.row]?.[pos.col];
    if (!cell || cell.special === 'none') continue;

    let cells: Pos[];
    if (cell.special === 'hyper') {
      // A hypercube caught in someone else's blast clears the board's most common colour.
      const type = mostCommonType(grid);
      cells = type < 0 ? [] : hyperTargets(grid, type);
    } else {
      cells = blastCells(grid, pos, cell.special);
    }

    detonations.push({ pos, special: cell.special, type: cell.type, cells });

    for (const c of cells) {
      const ck = posKey(c);
      cleared.add(ck);
      if (!processed.has(ck)) queue.push(ck);
    }
  }

  return { cleared, detonations };
}

/** Hypercube swapped against `other`: clear every gem sharing that gem's colour. */
export function hyperSwap(specialPos: Pos, other: Pos, grid: Grid): Set<string> {
  const otherType = grid[other.row]?.[other.col]?.type ?? -1;
  const cleared = new Set<string>([posKey(specialPos)]);
  if (otherType >= 0) for (const p of hyperTargets(grid, otherType)) cleared.add(posKey(p));
  cleared.add(posKey(other));
  return cleared;
}
