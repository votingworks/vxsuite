/* eslint-disable vx/gts-identifiers */

import {
  CVR_BALLOT_IMAGES_SUBDIRECTORY,
  CVR_BALLOT_LAYOUTS_SUBDIRECTORY,
} from '@votingworks/backend';
import { assert, assertDefined } from '@votingworks/basics';
import {
  BallotPageLayout,
  Contests,
  CVR,
  Election,
  getBallotStyle,
  getContests,
  SheetOf,
  VotesDict,
} from '@votingworks/types';

/**
 * All generated cast vote records are in the same batch per scanner, with
 * this ID.
 */
export const BATCH_ID = 'batch-1';

/**
 * Generate all combinations of an array.
 * @param sourceArray - Array of input elements.
 * @param comboLength - Desired length of combinations.
 * @returns Array of combination arrays.
 */
export function generateCombinations<T>(
  sourceArray: readonly T[],
  comboLength: number
): Array<T[]> {
  const sourceLength = sourceArray.length;
  if (comboLength > sourceLength) return [];

  const combos: Array<T[]> = []; // Stores valid combinations as they are generated.

  // Accepts a partial combination, an index into sourceArray,
  // and the number of elements required to be added to create a full-length combination.
  // Called recursively to build combinations, adding subsequent elements at each call depth.
  function makeNextCombos(
    workingCombo: T[],
    currentIndex: number,
    remainingCount: number
  ) {
    const oneAwayFromComboLength = remainingCount === 1;

    // For each element that remains to be added to the working combination.
    for (
      let sourceIndex = currentIndex;
      sourceIndex < sourceLength;
      sourceIndex += 1
    ) {
      // Get next (possibly partial) combination.
      const next = [...workingCombo, sourceArray[sourceIndex] as T];

      if (oneAwayFromComboLength) {
        // Combo of right length found, save it.
        combos.push(next);
      } else {
        // Otherwise go deeper to add more elements to the current partial combination.
        makeNextCombos(next, sourceIndex + 1, remainingCount - 1);
      }
    }
  }
  makeNextCombos([], 0, comboLength);
  return combos;
}

/**
 * Splits the full list of contests in a ballot style by the pages they appear
 * on in their layouts.
 */
export function splitContestsByPage({
  ballotPageLayouts,
  election,
}: {
  allVotes: VotesDict;
  ballotPageLayouts: readonly BallotPageLayout[];
  election: Election;
}): Contests[] {
  const metadata = ballotPageLayouts[0]?.metadata;
  assert(metadata);
  const ballotStyle = getBallotStyle({
    election,
    ballotStyleId: metadata.ballotStyleId,
  });
  assert(ballotStyle);
  const allContests = getContests({
    election,
    ballotStyle,
  });

  const contestsByPage: Contests[] = [];
  let contestOffset = 0;
  for (const layout of ballotPageLayouts) {
    contestsByPage.push(
      allContests.slice(contestOffset, contestOffset + layout.contests.length)
    );

    contestOffset += layout.contests.length;
  }

  return contestsByPage;
}

/**
 * Re-arranges contests grouped by page into contests grouped by sheet and page,
 * as from [[...A], [...B], [...C], [...D]] to [[[...A], [...B]], [[...C],[...D]]]
 */
export function arrangeContestsBySheet(
  contestsByPage: Contests[]
): Array<SheetOf<Contests>> {
  const contestsBySheet: Array<SheetOf<Contests>> = [];
  const numSheets = Math.ceil(contestsByPage.length / 2);

  for (let i = 0; i < numSheets; i += 1) {
    contestsBySheet.push([
      assertDefined(contestsByPage[i * 2]),
      contestsByPage[i * 2 + 1] ?? [],
    ]);
  }

  return contestsBySheet;
}

/**
 * Returns a {@link VotesDict} with only votes from in `votes` that apply to
 * contests in `contests`.
 */
export function filterVotesByContests(
  votes: VotesDict,
  contests: Contests
): VotesDict {
  const filteredVotes: VotesDict = {};
  for (const contest of contests) {
    if (votes[contest.id]) {
      filteredVotes[contest.id] = votes[contest.id];
    }
  }
  return filteredVotes;
}

/**
 * Format of the image URIs used in generated fixtures.
 */
export const IMAGE_URI_REGEX = new RegExp(
  String.raw`file:\.\/${CVR_BALLOT_IMAGES_SUBDIRECTORY}\/${BATCH_ID}\/(.+)__(.+)__(.+)\.jpg`
);

/**
 * Generates the relative path, from the root of a cast vote record directory,
 * to an asset specified by the parameters.
 */
export function generateBallotAssetPath({
  ballotStyleId,
  precinctId,
  pageNumber,
  assetType,
}: {
  ballotStyleId: string;
  precinctId: string;
  pageNumber: number;
  assetType: 'image' | 'layout';
}): string {
  return `./${
    assetType === 'image'
      ? CVR_BALLOT_IMAGES_SUBDIRECTORY
      : CVR_BALLOT_LAYOUTS_SUBDIRECTORY
  }/${BATCH_ID}/${ballotStyleId}__${precinctId}__${pageNumber}.${
    assetType === 'image' ? 'jpg' : 'layout.json'
  }`;
}

/**
 * Takes a CVR and returns the same CVR with a different ID. Used when
 * duplicating CVRs.
 */
export function replaceUniqueId(
  castVoteRecord: CVR.CVR,
  newUniqueId: string
): CVR.CVR {
  const snapshot = castVoteRecord.CVRSnapshot[0];
  assert(snapshot);
  return {
    ...castVoteRecord,
    UniqueId: newUniqueId,
    CurrentSnapshotId: `${newUniqueId}-modified`,
    CVRSnapshot: [
      {
        ...snapshot,
        '@id': `${newUniqueId}-modified`,
      },
    ],
  };
}
