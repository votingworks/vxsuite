import {
  Candidate,
  ContestOptionId,
  Contests,
  MarkThresholds,
  Vote,
  VotesDict,
} from '@votingworks/types';
import { assert, find } from '@votingworks/utils';
import makeDebug from 'debug';
import { InterpretedOvalMark } from '../types';

const log = makeDebug('ballot-interpreter-nh:interpret');

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

    let vote: Vote;
    let optionId: ContestOptionId;

    if (contest.type === 'candidate') {
      const candidate: Candidate =
        gridPosition.type === 'option'
          ? find(contest.candidates, (c) => c.id === gridPosition.optionId)
          : {
              id: `write-in-${gridPosition.writeInIndex}`,
              name: `Write-In #${gridPosition.writeInIndex + 1}`,
              isWriteIn: true,
            };
      vote = [candidate];
      optionId = candidate.id;
    } else if (contest.type === 'yesno') {
      assert(gridPosition.type === 'option');
      vote = [gridPosition.optionId] as Vote;
      optionId = gridPosition.optionId;
    } else {
      throw new Error(`Unsupported contest type: ${contest.type}`);
    }

    if (mark.score < markThresholds.marginal) {
      log(
        `Mark for contest '%s' option '%s' will be ignored, score is too low: %d < %d (marginal threshold)`,
        contestId,
        optionId,
        mark.score,
        markThresholds.marginal
      );
      continue;
    }

    if (mark.score < markThresholds.definite) {
      log(
        `Mark for contest '%s' option '%s' is marginal, score is too low: %d < %d (definite threshold)`,
        contestId,
        optionId,
        mark.score,
        markThresholds.definite
      );
      continue;
    }

    log(
      `Mark for contest '%s' option '%s' will be counted, score is high enough: %d (definite threshold) ≤ %d`,
      contestId,
      optionId,
      markThresholds.definite,
      mark.score
    );

    if (!votes[contestId]) {
      votes[contestId] = vote;
    } else {
      const existing = votes[contestId] as Vote;
      votes[contestId] = [...existing, ...vote] as Vote;
    }
  }

  return votes;
}
