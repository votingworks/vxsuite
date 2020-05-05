import { VotesDict } from '@votingworks/ballot-encoder'
import { addVote } from './hmpb/votes'
import { BallotMark } from './types'

/**
 * Gets the votes where the given marks have a high enough score to count, where
 * a score of 0 means nothing is filled in and a score of 1 means everything is
 * filled in.
 */
export default function getVotesFromMarks(
  marks: readonly BallotMark[],
  { markScoreVoteThreshold }: { markScoreVoteThreshold: number }
): VotesDict {
  const votes: VotesDict = {}

  for (const mark of marks) {
    switch (mark.type) {
      case 'candidate':
        if (mark.score >= markScoreVoteThreshold) {
          addVote(votes, mark.contest, mark.option)
        }
        break

      case 'yesno':
        if (mark.score >= markScoreVoteThreshold) {
          addVote(votes, mark.contest, mark.option)
        }
        break

      case 'stray':
        // TODO
        break
    }
  }

  return votes
}
