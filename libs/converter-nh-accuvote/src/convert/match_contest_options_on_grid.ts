import { iter, ok } from '@votingworks/basics';
import { Contests, GridPosition, YesNoContest } from '@votingworks/types';
import { pairColumnEntries } from './pair_column_entries';
import {
  PairColumnEntriesIssueKind,
  PairColumnEntriesResult,
  TemplateBubbleGridEntry,
} from './types';

/**
 * Matches grid positions from the election definition to ovals found in the
 * template, correcting for missing YES/NO grid positions by assuming they will
 * appear after all other contests with all YES options in one column and all NO
 * options in another.
 */
export function matchContestOptionsOnGrid(
  contests: Contests,
  gridPositions: readonly GridPosition[],
  ovalGrid: readonly TemplateBubbleGridEntry[]
): PairColumnEntriesResult<GridPosition, TemplateBubbleGridEntry> {
  const pairResult = pairColumnEntries(gridPositions, ovalGrid);

  if (pairResult.isOk() || pairResult.err().issues.length !== 2 /* YES/NO */) {
    return pairResult;
  }

  const pairs = [...pairResult.err().pairs];
  let [yesColumnIssue, noColumnIssue] = pairResult.err().issues;
  const yesNoContests = contests.filter(
    (contest): contest is YesNoContest => contest.type === 'yesno'
  );

  // Ensure we have exactly two columns with the expected number of extra
  // entries representing the YES/NO options. If not, then just return the
  // original result.
  if (
    yesColumnIssue?.kind !==
      PairColumnEntriesIssueKind.ColumnEntryCountMismatch ||
    noColumnIssue?.kind !==
      PairColumnEntriesIssueKind.ColumnEntryCountMismatch ||
    yesColumnIssue.extraLeftEntries.length !== 0 ||
    noColumnIssue.extraLeftEntries.length !== 0 ||
    yesColumnIssue.extraRightEntries.length !==
      noColumnIssue.extraRightEntries.length ||
    yesColumnIssue.extraRightEntries.length !== yesNoContests.length ||
    noColumnIssue.extraRightEntries.length !== yesNoContests.length
  ) {
    return pairResult;
  }

  // Swap the YES/NO columns if YES is to the right of NO.
  if (
    (yesColumnIssue.extraRightEntries[0]?.column ?? 0) >
    (noColumnIssue.extraRightEntries[0]?.column ?? 0)
  ) {
    [yesColumnIssue, noColumnIssue] = [noColumnIssue, yesColumnIssue];
  }

  // Add the YES/NO options to the grid.
  for (const [contest, yesGridEntry, noGridEntry] of iter(yesNoContests).zip(
    yesColumnIssue.extraRightEntries,
    noColumnIssue.extraRightEntries
  )) {
    pairs.push(
      [
        {
          type: 'option',
          contestId: contest.id,
          optionId: contest.yesOption.id,
          sheetNumber: 1,
          side: yesGridEntry.side,
          column: yesGridEntry.column,
          row: yesGridEntry.row,
        },
        yesGridEntry,
      ],
      [
        {
          type: 'option',
          contestId: contest.id,
          optionId: contest.noOption.id,
          sheetNumber: 1,
          side: noGridEntry.side,
          column: noGridEntry.column,
          row: noGridEntry.row,
        },
        noGridEntry,
      ]
    );
  }

  return ok({ pairs });
}
