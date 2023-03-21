import { assert, find, iter, throwIllegalValue } from '@votingworks/basics';
import {
  BallotTargetMark,
  Contests,
  MarkThresholds,
  VotesDict,
} from '@votingworks/types';
import { convertMarksToVotesDict } from '@votingworks/utils';
import { InterpretedOvalMark } from '../types';

function convertNewHampshireMarkToSharedMark(
  contests: Contests,
  mark: InterpretedOvalMark
): BallotTargetMark {
  const contest = find(contests, (c) => c.id === mark.gridPosition.contestId);
  if (contest.type === 'candidate') {
    return {
      type: 'candidate',
      contestId: contest.id,
      optionId:
        mark.gridPosition.type === 'option'
          ? mark.gridPosition.optionId
          : `write-in-${mark.gridPosition.writeInIndex}`,
      score: mark.score,
      bounds: mark.bounds,
      scoredOffset: mark.scoredOffset,
      target: {
        inner: mark.bounds,
        bounds: mark.bounds,
      },
    };
  }

  if (contest.type === 'yesno') {
    assert(mark.gridPosition.type === 'option');
    assert(
      mark.gridPosition.optionId === 'yes' ||
        mark.gridPosition.optionId === 'no'
    );
    return {
      type: 'yesno',
      contestId: contest.id,
      optionId: mark.gridPosition.optionId,
      score: mark.score,
      bounds: mark.bounds,
      scoredOffset: mark.scoredOffset,
      target: {
        inner: mark.bounds,
        bounds: mark.bounds,
      },
    };
  }

  throwIllegalValue(contest, 'type');
}

/**
 * Convert a series of oval marks into a list of candidate votes.
 */
export function convertMarksToVotes(
  contests: Contests,
  markThresholds: MarkThresholds,
  ovalMarks: Iterable<InterpretedOvalMark>
): VotesDict {
  return convertMarksToVotesDict(
    contests,
    markThresholds,
    iter(ovalMarks).map((m) => convertNewHampshireMarkToSharedMark(contests, m))
  );
}
