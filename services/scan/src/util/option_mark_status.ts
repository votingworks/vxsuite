import {
  BallotMark,
  Contest,
  ContestId,
  ContestOption,
  Contests,
  MarkStatus,
  MarkThresholds,
  MsEitherNeitherContest,
} from '@votingworks/types';
import { assert, throwIllegalValue } from '@votingworks/utils';
import { getMarkStatus } from '../types';

function findMsEitherNeitherContestFromSubContest(
  contests: Contests,
  contestId: ContestId
): MsEitherNeitherContest {
  for (const contest of contests) {
    if (contest.type !== 'ms-either-neither') {
      continue;
    }

    if (
      contest.id === contestId ||
      contest.eitherNeitherContestId === contestId ||
      contest.pickOneContestId === contestId
    ) {
      return contest;
    }
  }

  throw new Error(`could not find ms-either-neither contest for ${contestId}`);
}

/**
 * state of the mark for a given contest and option
 */
export function optionMarkStatus({
  contests,
  markThresholds,
  marks,
  contestId,
  optionId,
}: {
  contests: Contests;
  markThresholds: MarkThresholds;
  marks: BallotMark[];
  contestId: Contest['id'];
  optionId: ContestOption['id'];
}): MarkStatus {
  for (const mark of marks) {
    if (mark.type !== 'ms-either-neither' && mark.contestId !== contestId) {
      continue;
    }

    // the criteria for ms-either-neither is more complex, handling it in the switch.

    switch (mark.type) {
      case 'ms-either-neither': {
        const contest = findMsEitherNeitherContestFromSubContest(
          contests,
          mark.contestId
        );

        assert(
          contest?.type === 'ms-either-neither',
          `contest ${contestId} is not ms-either-neither: got ${contest?.type}`
        );
        if (contest.eitherNeitherContestId === contestId) {
          if (
            (contest.eitherOption.id === mark.optionId && optionId === 'yes') ||
            (contest.neitherOption.id === mark.optionId && optionId === 'no')
          ) {
            return getMarkStatus(mark, markThresholds);
          }
        }

        if (contest.pickOneContestId === contestId) {
          if (
            (contest.firstOption.id === mark.optionId && optionId === 'yes') ||
            (contest.secondOption.id === mark.optionId && optionId === 'no')
          ) {
            return getMarkStatus(mark, markThresholds);
          }
        }

        break;
      }

      case 'candidate':
        if (mark.optionId === optionId) {
          return getMarkStatus(mark, markThresholds);
        }
        break;

      case 'yesno':
        if (mark.optionId === optionId) {
          return getMarkStatus(mark, markThresholds);
        }
        break;

      default:
        throwIllegalValue(mark, 'type');
    }
  }

  return MarkStatus.Unmarked;
}
