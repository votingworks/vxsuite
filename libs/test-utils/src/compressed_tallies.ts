import { CompressedTally, Election } from '@votingworks/types';

// duplicated from shared utils library in order to avoid creating a cyclical dependency
function throwIllegalValue(s: never): never {
  throw new Error(`Illegal Value: ${s}`);
}

export function getZeroCompressedTally(election: Election): CompressedTally {
  // eslint-disable-next-line array-callback-return
  return election.contests.map((contest) => {
    if (contest.type === 'yesno') {
      return [0, 0, 0, 0, 0];
    }
    if (contest.type === 'candidate') {
      if (contest.allowWriteIns) {
        return [0, 0, 0, 0, ...contest.candidates.map(() => 0)];
      }
      return [0, 0, 0, ...contest.candidates.map(() => 0)];
    }
    /* istanbul ignore next - compile time check for completeness */
    throwIllegalValue(contest);
  });
}
