import { BallotMark, Election, VotesDict } from '@votingworks/types';
import { convertMarksToVotesDict } from '@votingworks/utils';

/**
 * Gets the votes where the given marks have a high enough score to count, where
 * a score of 0 means nothing is filled in and a score of 1 means everything is
 * filled in.
 */
export function getVotesFromMarks(
  election: Election,
  marks: readonly BallotMark[],
  { markScoreVoteThreshold }: { markScoreVoteThreshold: number }
): VotesDict {
  return convertMarksToVotesDict(
    election.contests,
    {
      marginal: markScoreVoteThreshold,
      definite: markScoreVoteThreshold,
    },
    marks
  );
}
