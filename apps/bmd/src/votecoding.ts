import {
  Candidate,
  CandidateContest,
  CandidateVote,
  Contests,
  Vote,
  VotesDict,
} from './config/types'

export default function encodeVotes(contests: Contests, votes: VotesDict) {
  return contests
    .map(contest => {
      const contestVote: Vote = votes[contest.id]!
      if (!contestVote) {
        return ''
      }

      if (contest.type === 'yesno') {
        if (contestVote === 'yes') {
          return '1'
        } else {
          return '0'
        }
      }

      const candidateIDs = (contest as CandidateContest).candidates.map(
        (c: Candidate) => c.id
      )
      return (contestVote as CandidateVote)
        .map(c => (c.isWriteIn ? 'W' : candidateIDs.indexOf(c.id)))
        .join(',')
    })
    .join('|')
}
