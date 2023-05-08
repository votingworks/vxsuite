import { err, iter, ok } from '@votingworks/basics';
import {
  GridEntry,
  PairColumnEntriesIssue,
  PairColumnEntriesIssueKind,
  PairColumnEntriesResult,
} from './types';

function compareGridEntry(a: GridEntry, b: GridEntry): number {
  if (a.side !== b.side) {
    return a.side === 'front' ? -1 : 1;
  }
  return a.row - b.row;
}

/**
 * Pairs entries by column and row, ignoring the absolute values of the columns
 * and rows. There must be the same number of columns in both, and for each
 * column pair there must be the same number of rows in both.
 */
export function pairColumnEntries<T extends GridEntry, U extends GridEntry>(
  grid1: readonly T[],
  grid2: readonly U[]
): PairColumnEntriesResult<T, U> {
  const grid1ByColumn = iter(grid1).toMap((e) => e.column);
  const grid2ByColumn = iter(grid2).toMap((e) => e.column);
  const grid1Columns = Array.from(grid1ByColumn.entries())
    // sort by column
    .sort((a, b) => a[0] - b[0])
    // sort by side, row
    .map(([, entries]) => Array.from(entries).sort(compareGridEntry));
  const grid2Columns = Array.from(grid2ByColumn.entries())
    // sort by column
    .sort((a, b) => a[0] - b[0])
    // sort by side, row
    .map(([, entries]) => Array.from(entries).sort(compareGridEntry));
  const pairs: Array<[T, U]> = [];
  const issues: Array<PairColumnEntriesIssue<T, U>> = [];

  if (grid1Columns.length !== grid2Columns.length) {
    issues.push({
      kind: PairColumnEntriesIssueKind.ColumnCountMismatch,
      message: `Grids have different number of columns: ${grid1Columns.length} vs ${grid2Columns.length}`,
      columnCounts: [grid1Columns.length, grid2Columns.length],
    });
  }

  let columnIndex = 0;
  for (const [column1, column2] of iter(grid1Columns).zipMin(grid2Columns)) {
    if (column1.length !== column2.length) {
      issues.push({
        kind: PairColumnEntriesIssueKind.ColumnEntryCountMismatch,
        message: `Columns at index ${columnIndex} disagree on entry count: grid #1 has ${column1.length} entries, but grid #2 has ${column2.length} entries`,
        columnIndex,
        columnEntryCounts: [column1.length, column2.length],
        extraLeftEntries: column1.slice(column2.length),
        extraRightEntries: column2.slice(column1.length),
      });
    }
    for (const [entry1, entry2] of iter(column1).zipMin(column2)) {
      pairs.push([entry1, entry2]);
    }
    columnIndex += 1;
  }

  return issues.length ? err({ pairs, issues }) : ok({ pairs });
}
