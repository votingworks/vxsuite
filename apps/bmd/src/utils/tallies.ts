import {
  CandidateVote,
  Election,
  getBallotStyle,
  getContests,
  VotesDict,
  YesNoVote,
} from '@votingworks/types'
import { CandidateVoteTally, Tally, YesNoVoteTally } from '../config/types'
import { computeTallyForEitherNeitherContests } from './eitherNeither'
import { getSingleYesNoVote } from './votes'

export const calculateTally = ({
  election,
  tally: prevTally,
  votes,
  ballotStyleId,
}: {
  election: Election
  tally: Tally
  votes: VotesDict
  ballotStyleId: string
}): Tally => {
  const ballotStyle = getBallotStyle({
    ballotStyleId,
    election,
  })!
  const contestsForBallotStyle = getContests({
    election,
    ballotStyle,
  })
  // first update the tally for either-neither contests
  const tally = computeTallyForEitherNeitherContests({
    election,
    tally: prevTally,
    votes,
    contests: contestsForBallotStyle,
  })

  for (const contest of contestsForBallotStyle) {
    if (contest.type === 'ms-either-neither') {
      continue
    }

    const contestIndex = election.contests.findIndex((c) => c.id === contest.id)
    /* istanbul ignore next */
    if (contestIndex < 0) {
      throw new Error(`No contest found for contestId: ${contest.id}`)
    }
    const contestTally = tally[contestIndex]
    /* istanbul ignore else */
    if (contest.type === 'yesno') {
      const yesnoContestTally = contestTally as YesNoVoteTally
      const vote = votes[contest.id] as YesNoVote
      const yesnovote = getSingleYesNoVote(vote)!
      if (yesnovote === undefined) {
        yesnoContestTally.undervotes++
      } else {
        yesnoContestTally[yesnovote]++
      }
    } else if (contest.type === 'candidate') {
      const candidateContestTally = contestTally as CandidateVoteTally
      const vote = (votes[contest.id] ?? []) as CandidateVote
      vote.forEach((candidate) => {
        if (candidate.isWriteIn) {
          const tallyContestWriteIns = candidateContestTally.writeIns
          const writeIn = tallyContestWriteIns.find(
            (c) => c.name === candidate.name
          )
          if (typeof writeIn === 'undefined') {
            tallyContestWriteIns.push({
              name: candidate.name,
              tally: 1,
            })
          } else {
            writeIn.tally++
          }
        } else {
          const candidateIndex = contest.candidates.findIndex(
            (c) => c.id === candidate.id
          )
          if (
            candidateIndex < 0 ||
            candidateIndex >= candidateContestTally.candidates.length
          ) {
            throw new Error(
              `unable to find a candidate with id: ${candidate.id}`
            )
          }
          candidateContestTally.candidates[candidateIndex]++
        }
      })
      candidateContestTally.undervotes += contest.seats - vote.length
    }
  }
  return tally
}
