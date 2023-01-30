import { assert, find } from '@votingworks/basics';
import {
  AdjudicationInfo,
  AdjudicationReason,
  AdjudicationReasonInfo,
  Contests,
  MarkStatus,
  MarkThresholds,
} from '@votingworks/types';
import { ballotAdjudicationReasons } from '@votingworks/utils';
import { InterpretedOvalMark } from '../types';

/**
 * Options for calling {@link convertMarksToAdjudicationInfo}.
 */
export interface Options {
  readonly contests: Contests;
  readonly enabledReasons: readonly AdjudicationReason[];
  readonly ovalMarks: readonly InterpretedOvalMark[];
  readonly markThresholds: MarkThresholds;
}

/**
 * Converts a series of oval marks into adjudication info.
 */
export function convertMarksToAdjudicationInfo({
  contests,
  enabledReasons,
  ovalMarks,
  markThresholds,
}: Options): AdjudicationInfo {
  const adjudicationReasonInfos = Array.from(
    ballotAdjudicationReasons(contests, {
      optionMarkStatus: (option) => {
        const contest = find(contests, (c) => c.id === option.contestId);
        const marks = ovalMarks.filter(({ gridPosition }) => {
          if (gridPosition.contestId !== option.contestId) {
            return false;
          }

          if (gridPosition.type === 'option') {
            return gridPosition.optionId === option.id;
          }

          if (gridPosition.type === 'write-in') {
            const expectedWriteInIndex =
              option.optionIndex -
              (contest.type === 'candidate' ? contest.candidates.length : 0);
            return gridPosition.writeInIndex === expectedWriteInIndex;
          }

          return false;
        });
        assert(marks.length > 0, `mark for option ${option.id} not found`);

        let fallbackStatus = MarkStatus.Unmarked;

        for (const mark of marks) {
          if (mark.score >= markThresholds.definite) {
            return MarkStatus.Marked;
          }

          if (mark.score >= markThresholds.marginal) {
            fallbackStatus = MarkStatus.Marginal;
          }
        }

        return fallbackStatus;
      },
    })
  );

  const enabledReasonInfos: AdjudicationReasonInfo[] = [];
  const ignoredReasonInfos: AdjudicationReasonInfo[] = [];

  for (const reasonInfo of adjudicationReasonInfos) {
    if (enabledReasons.includes(reasonInfo.type)) {
      enabledReasonInfos.push(reasonInfo);
    } else {
      ignoredReasonInfos.push(reasonInfo);
    }
  }

  return {
    requiresAdjudication: enabledReasonInfos.length > 0,
    enabledReasonInfos,
    enabledReasons,
    ignoredReasonInfos,
  };
}
