import {
  AsyncIteratorPlus,
  assertDefined,
  iter,
  unique,
} from '@votingworks/basics';
import { voteToOptionId } from '@votingworks/hmpb';
import { ImageData, pdfToImages } from '@votingworks/image-utils';
import {
  ContestId,
  GridLayout,
  UnmarkedWriteIn,
  Vote,
  VotesDict,
} from '@votingworks/types';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';

export function pdfToPageImages(
  pdf: Buffer | string
): AsyncIteratorPlus<ImageData> {
  const pdfData = typeof pdf === 'string' ? readFileSync(pdf) : pdf;
  return iter(pdfToImages(pdfData, { scale: 200 / 72 })).map(
    ({ page }) => page
  );
}

function isContestOnSheet(
  gridLayout: GridLayout,
  contestId: string,
  sheetNumber: number
): boolean {
  return gridLayout.gridPositions.some(
    (position) =>
      position.contestId === contestId && position.sheetNumber === sheetNumber
  );
}

function getContestIdsForSheet(
  gridLayout: GridLayout,
  sheetNumber: number
): ContestId[] {
  return unique(
    gridLayout.gridPositions
      .filter((position) => position.sheetNumber === sheetNumber)
      .map((position) => position.contestId)
  );
}

/**
 * Extract the votes for a single sheet from a full votes dictionary. Each
 * sheet should have votes for all contests on that sheet regardless of
 * whether they were marked or not.
 */
export function votesForSheet(
  votes: VotesDict,
  sheetNumber: number,
  gridLayout: GridLayout
): VotesDict {
  const sheetVotes: VotesDict = {};
  for (const contestId of getContestIdsForSheet(gridLayout, sheetNumber)) {
    sheetVotes[contestId] = votes[contestId] ?? [];
  }
  return sheetVotes;
}

export function unmarkedWriteInsForSheet(
  unmarkedWriteIns: UnmarkedWriteIn[],
  sheetNumber: number,
  gridLayout: GridLayout
): UnmarkedWriteIn[] {
  return unmarkedWriteIns.filter(({ contestId }) =>
    isContestOnSheet(gridLayout, contestId, sheetNumber)
  );
}

export function sortVotes(vote: Vote): Vote {
  return [...vote].sort((a, b) =>
    voteToOptionId(a).localeCompare(voteToOptionId(b))
  ) as Vote;
}

export function sortVotesDict(votes: VotesDict): VotesDict {
  return Object.fromEntries(
    Object.entries(votes).map(([contestId, candidates]) => [
      contestId,
      sortVotes(assertDefined(candidates)),
    ])
  );
}

export function sortUnmarkedWriteIns(
  writeIns: UnmarkedWriteIn[]
): UnmarkedWriteIn[] {
  return [...writeIns].sort(
    (a, b) =>
      a.contestId.localeCompare(b.contestId) ||
      /* istanbul ignore next */
      a.optionId.localeCompare(b.optionId)
  );
}
