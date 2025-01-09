import { assertDefined } from '@votingworks/basics';
import { AnyContest, Candidate } from '@votingworks/types';

// Maps the number of candidates in a contest to the index at which to rotate
// the candidates. These indexes are randomly selected by the state every 2
// years. Note that these use 1-based indexing.
const NH_ROTATION_INDICES: Record<number, number> = {
  2: 1,
  3: 1,
  4: 4,
  5: 4,
  6: 2,
  7: 6,
  8: 4,
  9: 2,
  10: 3,
  11: 1,
  12: 1,
  13: 10,
  14: 9,
  15: 1,
  16: 15,
  17: 5,
  18: 10,
  19: 10,
  20: 10,
};

/**
 * Rotate a contest's candidates according to the governing statutes. Currently
 * only supports NH rules.
 *
 * The NH rotation algorithm is as follows:
 * 1. Order the candidates alphabetically by last name.
 * 2. Cut the "deck" at a randomly selected index (see NH_ROTATION_INDICES).
 */
export function rotateCandidates(contest: AnyContest): AnyContest {
  if (contest.type !== 'candidate') return contest;
  if (contest.candidates.length < 2) return contest;

  function getSortingName(candidate: Candidate): string {
    return (
      // || instead of ?? because when lastName and firstName are empty string we want to sort by
      // the last word of `name`. This supports backwards compatibility with elections that were
      // created before structured name input.
      candidate.lastName ||
      candidate.firstName ||
      assertDefined(candidate.name.split(' ').at(-1))
    );
  }

  const orderedCandidates = [...contest.candidates].sort((a, b) =>
    getSortingName(a).localeCompare(getSortingName(b))
  );

  const rotationIndex =
    assertDefined(
      NH_ROTATION_INDICES[contest.candidates.length],
      `No rotation index defined for contest with ${contest.candidates.length} candidates`
    ) - 1;

  const rotatedCandidates = [
    ...orderedCandidates.slice(rotationIndex),
    ...orderedCandidates.slice(0, rotationIndex),
  ];

  return {
    ...contest,
    candidates: rotatedCandidates,
  };
}
