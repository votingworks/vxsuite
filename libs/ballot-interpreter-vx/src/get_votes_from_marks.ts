import {
  BallotMark,
  CandidateContest,
  Election,
  unsafeParse,
  VotesDict,
  WriteInCandidateSchema,
} from '@votingworks/types';
import { find, throwIllegalValue } from '@votingworks/utils';
import makeDebug from 'debug';
import { addVote } from './hmpb/votes';

const debug = makeDebug('ballot-interpreter-vx:getVotesFromMarks');

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
  const votes: VotesDict = {};

  for (const mark of marks) {
    switch (mark.type) {
      case 'candidate':
        if (mark.score >= markScoreVoteThreshold) {
          debug(
            `'%s' contest '%s' mark score (%d) for '%s' meets vote threshold (%d)`,
            mark.type,
            mark.contestId,
            mark.score,
            mark.optionId,
            markScoreVoteThreshold
          );
          const contest = find(
            election.contests,
            (c): c is CandidateContest => c.id === mark.contestId
          );
          const option = contest.candidates.find((c) => c.id === mark.optionId);
          if (!option || option.isWriteIn) {
            addVote(
              election,
              votes,
              mark.contestId,
              unsafeParse(
                WriteInCandidateSchema,
                option ?? {
                  id: mark.optionId,
                  name: 'Write-In',
                  isWriteIn: true,
                }
              )
            );
          } else {
            addVote(election, votes, mark.contestId, mark.optionId);
          }
        }
        break;

      case 'yesno':
        if (mark.score >= markScoreVoteThreshold) {
          debug(
            `'%s' contest '%s' mark score (%d) for '%s' meets vote threshold (%d)`,
            mark.type,
            mark.contestId,
            mark.score,
            mark.optionId,
            markScoreVoteThreshold
          );
          addVote(election, votes, mark.contestId, mark.optionId);
        }
        break;

      case 'ms-either-neither':
        if (mark.score >= markScoreVoteThreshold) {
          debug(
            `'%s' contest '%s' mark score (%d) for '%s' meets vote threshold (%d)`,
            mark.type,
            mark.contestId,
            mark.score,
            mark.optionId,
            markScoreVoteThreshold
          );
          addVote(election, votes, mark.contestId, mark.optionId);
        }
        break;

      default:
        throwIllegalValue(mark, 'type');
    }
  }

  return votes;
}
