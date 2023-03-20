import { assert, find, iter } from '@votingworks/basics';
import {
  AdjudicationInfo,
  AdjudicationReason,
  AdjudicationReasonInfo,
  Contests,
  MarkStatus,
  MarkThresholds,
} from '@votingworks/types';
import { ballotAdjudicationReasons, getMarkStatus } from '@votingworks/utils';
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
          const markStatus = getMarkStatus(mark.score, markThresholds);

          if (markStatus === MarkStatus.Marked) {
            return markStatus;
          }

          if (markStatus === MarkStatus.Marginal) {
            fallbackStatus = markStatus;
          }
        }

        return fallbackStatus;
      },
    })
  );

  const [enabledReasonInfos, ignoredReasonInfos] = iter(
    adjudicationReasonInfos
  ).partition((reasonInfo) => enabledReasons.includes(reasonInfo.type));

  return {
    requiresAdjudication: enabledReasonInfos.size > 0,
    enabledReasonInfos: [...enabledReasonInfos],
    enabledReasons,
    ignoredReasonInfos: [...ignoredReasonInfos],
  };
}
