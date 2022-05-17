import {
  Candidate,
  CandidateVote,
  Contests,
  MarkThresholds,
  VotesDict,
} from '@votingworks/types';
import { assert, find } from '@votingworks/utils';
import makeDebug from 'debug';
import { InterpretedOvalMark } from '../types';

const dbg = makeDebug('ballot-interpreter-nh:interpret');

/**
 * Convert a series of oval marks into a list of candidate votes.
 */
export function convertMarksToVotes(
  contests: Contests,
  markThresholds: MarkThresholds,
  ovalMarks: readonly InterpretedOvalMark[]
): VotesDict {
  const votes: VotesDict = {};

  for (const mark of ovalMarks) {
    const { gridPosition } = mark;
    const { contestId } = gridPosition;
    const contest = find(contests, (c) => c.id === contestId);
    assert(
      contest.type === 'candidate',
      'only candidate contests are currently supported'
    );
    const candidate: Candidate =
      gridPosition.type === 'option'
        ? find(contest.candidates, (c) => c.id === gridPosition.optionId)
        : {
            id: `write-in-${gridPosition.writeInIndex}`,
            name: `Write-In #${gridPosition.writeInIndex + 1}`,
            isWriteIn: true,
          };

    if (mark.score < markThresholds.marginal) {
      dbg(
        `Mark for contest '%s' option '%s' will be ignored, score is too low: %d < %d (marginal threshold)`,
        contestId,
        candidate.id,
        mark.score,
        markThresholds.marginal
      );
      continue;
    }

    if (mark.score < markThresholds.definite) {
      dbg(
        `Mark for contest '%s' option '%s' is marginal, score is too low: %d < %d (definite threshold)`,
        contestId,
        candidate.id,
        mark.score,
        markThresholds.definite
      );
      continue;
    }

    dbg(
      `Mark for contest '%s' option '%s' will be counted, score is high enough: %d (definite threshold) ≤ %d`,
      contestId,
      candidate.id,
      markThresholds.definite,
      mark.score
    );
    votes[contestId] = [
      ...((votes[contestId] ?? []) as CandidateVote),
      candidate,
    ];
  }

  return votes;
}
