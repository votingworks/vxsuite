import {
  AdjudicationInfo,
  AdjudicationReason,
  AdjudicationReasonInfo,
  Contests,
  MarkStatus,
  MarkThresholds,
} from '@votingworks/types';
import { assert, ballotAdjudicationReasons, find } from '@votingworks/utils';
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
        const mark = ovalMarks.find(({ gridPosition }) => {
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
        assert(mark, `mark for option ${option.id} not found`);
        return mark.score < markThresholds.marginal
          ? MarkStatus.Unmarked
          : mark.score < markThresholds.definite
          ? MarkStatus.Marginal
          : MarkStatus.Marked;
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
