import { assertDefined } from '@votingworks/basics';
import { AnyContest } from '@votingworks/types';

// Maps the number of candidates in a contest to the index at which to rotate
// the candidates. These indexes are randomly selected by the state every 2
// years. Note that these use 1-based indexing.
const NH_ROTATION_INDICES: Record<number, number> = {
  2: 2,
  3: 1,
  4: 2,
  5: 1,
  6: 1,
  7: 7,
  8: 7,
  9: 2,
  10: 6,
  11: 3,
  12: 3,
  13: 8,
  14: 11,
  15: 4,
  16: 5,
  17: 7,
  18: 18,
  19: 19,
  20: 18,
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

  // Lacking structured name data, we approximate last name by using the last word
  function lastName(name: string): string {
    return assertDefined(name.split(' ').at(-1));
  }

  const orderedCandidates = [...contest.candidates].sort((a, b) =>
    lastName(a.name).localeCompare(lastName(b.name))
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
