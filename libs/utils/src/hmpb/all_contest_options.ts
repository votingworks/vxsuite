import { throwIllegalValue } from '@votingworks/basics';
import {
  AnyContest,
  CandidateContest,
  CandidateContestOption,
  ContestOption,
  YesNoContest,
  YesNoContestOption,
} from '@votingworks/types';

/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 */
export function allContestOptions(
  contest: CandidateContest
): Generator<CandidateContestOption>;
/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 */
export function allContestOptions(
  contest: YesNoContest
): Generator<YesNoContestOption>;
/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 */
export function allContestOptions(
  contest: AnyContest
): Generator<ContestOption>;
/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 */
export function* allContestOptions(
  contest: AnyContest
): Generator<ContestOption> {
  switch (contest.type) {
    case 'candidate': {
      for (const candidate of contest.candidates) {
        yield {
          type: 'candidate',
          id: candidate.id,
          contestId: contest.id,
          name: candidate.name,
          isWriteIn: false,
        };
      }

      if (contest.allowWriteIns) {
        for (let i = 0; i < contest.seats; i += 1) {
          yield {
            type: 'candidate',
            id: `write-in-${i}`,
            contestId: contest.id,
            name: 'Write-In',
            isWriteIn: true,
            writeInIndex: i,
          };
        }
      }
      break;
    }

    case 'yesno': {
      yield {
        type: 'yesno',
        id: contest.yesOption.id,
        contestId: contest.id,
        name: contest.yesOption.label,
      };
      yield {
        type: 'yesno',
        id: contest.noOption.id,
        contestId: contest.id,
        name: contest.noOption.label,
      };
      break;
    }

    /* istanbul ignore next */
    default:
      throwIllegalValue(contest, 'type');
  }
}
