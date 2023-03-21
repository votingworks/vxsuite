import { AnyContest, ContestOption } from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/basics';

/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 */
export function* allContestOptions(
  contest: AnyContest,
  writeInOptionIds?: readonly string[]
): Generator<ContestOption> {
  /* istanbul ignore else - compile-time completeness check */
  if (contest.type === 'candidate') {
    for (const [optionIndex, candidate] of contest.candidates.entries()) {
      yield {
        type: 'candidate',
        id: candidate.id,
        contestId: contest.id,
        name: candidate.name,
        isWriteIn: false,
        optionIndex,
      };
    }

    if (contest.allowWriteIns) {
      if (writeInOptionIds?.length) {
        for (const [writeInIndex, writeInId] of writeInOptionIds.entries()) {
          yield {
            type: 'candidate',
            id: writeInId,
            contestId: contest.id,
            name: 'Write-In',
            isWriteIn: true,
            optionIndex: contest.candidates.length + writeInIndex,
            writeInIndex,
          };
        }
      } else {
        for (let i = 0; i < contest.seats; i += 1) {
          yield {
            type: 'candidate',
            id: `write-in-${i}`,
            contestId: contest.id,
            name: 'Write-In',
            isWriteIn: true,
            optionIndex: contest.candidates.length + i,
            writeInIndex: i,
          };
        }
      }
    }
  } else if (contest.type === 'yesno') {
    yield {
      type: 'yesno',
      id: 'yes',
      contestId: contest.id,
      name: 'Yes',
      optionIndex: 0,
    };
    yield {
      type: 'yesno',
      id: 'no',
      contestId: contest.id,
      name: 'No',
      optionIndex: 1,
    };
  } else {
    throwIllegalValue(contest, 'type');
  }
}
