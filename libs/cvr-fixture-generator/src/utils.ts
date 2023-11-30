import { IteratorPlus, assert, iter } from '@votingworks/basics';
import { sha256 } from 'js-sha256';
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
  contestsByPage: Iterable<Contests>
): IteratorPlus<SheetOf<Contests>> {
  return iter(contestsByPage)
    .chunks(2)
    .map<SheetOf<Contests>>(([front, back = []]) => [front, back]);
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
export const IMAGE_URI_REGEX = /file:(.+)-(front|back)\.jpg/;

/**
 * Generates the path to a ballot asset, relative to an individual cast vote record directory.
 */
export function generateBallotAssetPath({
  castVoteRecordId,
  assetType,
  frontOrBack,
}: {
  castVoteRecordId: string;
  assetType: 'image' | 'layout';
  frontOrBack: 'front' | 'back';
}): string {
  const fileExtension = assetType === 'image' ? '.jpg' : '.layout.json';
  return `${castVoteRecordId}-${frontOrBack}${fileExtension}`;
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

/**
 * Length in characters of all fixture batch ids.
 */
export const BATCH_ID_LENGTH = 10;

/**
 * Returns a `batchId` for a given `scannerId` simply by hashing the `scannerId`.
 * Useful for keeping `batchId`s unique while avoiding randomly re-generating
 * them whenever a fixture needs to be refreshed.
 */
export function getBatchIdForScannerId(scannerId: string): string {
  return sha256(scannerId).slice(0, BATCH_ID_LENGTH);
}
