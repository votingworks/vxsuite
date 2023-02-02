import {
  BallotMark,
  Contest,
  ContestOption,
  MarkStatus,
  MarkThresholds,
} from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/basics';
import { getMarkStatus } from '../types';

/**
 * state of the mark for a given contest and option
 */
export function optionMarkStatus({
  markThresholds,
  marks,
  contestId,
  optionId,
}: {
  markThresholds: MarkThresholds;
  marks: BallotMark[];
  contestId: Contest['id'];
  optionId: ContestOption['id'];
}): MarkStatus {
  for (const mark of marks) {
    if (mark.contestId !== contestId) {
      continue;
    }
    switch (mark.type) {
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
