import { GridEntry } from '../../types';

/**
 * Comparator that sorts grid entries by column ascending, then side (front,
 * then back), and then by row ascending.
 */
export function byColumnThenSideThenRow(a: GridEntry, b: GridEntry): number {
  if (a.column !== b.column) {
    return a.column - b.column;
  }
  if (a.side !== b.side) {
    return a.side === 'front' ? -1 : 1;
  }
  return a.row - b.row;
}

/**
 * Comparator that sorts grid entries by side (front, then back) and then by
 * row ascending.
 */
export function bySideThenRow(a: GridEntry, b: GridEntry): number {
  if (a.side !== b.side) {
    return a.side === 'front' ? -1 : 1;
  }
  return a.row - b.row;
}

/**
 * Comparator that sorts grid entries by column ascending.
 */
export function byColumn(a: GridEntry, b: GridEntry): number {
  return a.column - b.column;
}

/**
 * Comparator that sorts grid entries by row ascending.
 */
export function byRow(a: GridEntry, b: GridEntry): number {
  return a.row - b.row;
}
