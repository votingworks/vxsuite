// eslint-disable-next-line import/no-cycle
import {
  ContestOption,
  ContestOptionTally,
  Dictionary,
  ElectionTally,
  FullElectionTally,
  VotesByPrecinct,
  CastVoteRecord,
} from '../config/types'
import {
  Party,
  YesNoVote,
  Candidate,
  CandidateVote,
  Election,
  VotesDict,
} from '@votingworks/ballot-encoder'

import find from '../utils/find'

// the generic write-in candidate to keep count
const writeInCandidate: Candidate = {
  id: 'writein',
  name: 'Write-In',
  isWriteIn: true,
}

// CVRs are newline-separated JSON objects
export const parseCVRs = (castVoteRecordsString: string) =>
  castVoteRecordsString
    .split('\n')
    .filter(el => el) // remove empty lines
    .map(line => JSON.parse(line) as CastVoteRecord)

interface VotesByPrecinctParams {
  election: Election
  castVoteRecords: CastVoteRecord[]
}

export function getVotesByPrecinct({
  election,
  castVoteRecords,
}: VotesByPrecinctParams): VotesByPrecinct {
  const votesByPrecinct: VotesByPrecinct = {}
  castVoteRecords.forEach(CVR => {
    const vote: VotesDict = {}
    election.contests.forEach(contest => {
      if (!CVR[contest.id]) {
        return
      }

      if (contest.type === 'yesno') {
        // the CVR is encoded the same way
        vote[contest.id] = CVR[contest.id] as YesNoVote
        return
      }

      if (contest.type === 'candidate') {
        vote[contest.id] = (CVR[contest.id] as string[]).map(candidateId =>
          find(
            [writeInCandidate, ...contest.candidates],
            c => c.id === candidateId
          )
        )
      }
    })

    let votes = votesByPrecinct[CVR._precinctId]
    if (!votes) {
      votesByPrecinct[CVR._precinctId] = votes = []
    }

    votes.push(vote)
  })

  return votesByPrecinct
}

interface TallyParams {
  election: Election
  precinctId?: string
  votes: VotesDict[]
}

export function tallyVotes({ election, precinctId, votes }: TallyParams) {
  const electionTally: ElectionTally = {
    contestTallies: [],
    precinctId,
  }

  election.contests.forEach(contest => {
    let options: ContestOption[]
    if (contest.type === 'yesno') {
      options = ['yes', 'no']
    } else {
      options = contest.candidates
    }

    const tallies: ContestOptionTally[] = options
      .map(option => {
        return { option, tally: 0 }
      })
      .concat(
        contest.type === 'candidate' && contest.allowWriteIns
          ? [{ option: writeInCandidate, tally: 0 }]
          : []
      )

    votes.forEach(vote => {
      const selected = vote[contest.id]
      if (!selected) {
        return
      }

      if (contest.type === 'yesno') {
        const optionTally = find(tallies, optionTally => {
          return optionTally.option === selected
        })
        optionTally.tally += 1
      } else {
        ; (selected as CandidateVote).forEach(selectedOption => {
          const optionTally = find(tallies, optionTally => {
            const candidateOption = optionTally.option as Candidate
            const selectedCandidateOption = selectedOption as Candidate
            return candidateOption.id === selectedCandidateOption.id
          })
          optionTally.tally += 1
        })
      }
    })

    electionTally.contestTallies.push({ contest, tallies })
  })

  return electionTally
}

interface FilterTalliesByPartyParams {
  election: Election
  electionTally: ElectionTally
  party?: Party
}

export function filterTalliesByParty({
  election,
  electionTally,
  party,
}: FilterTalliesByPartyParams) {
  if (!party) {
    return electionTally
  }

  const districts = election.ballotStyles
    .filter(bs => bs.partyId === party.id)
    .flatMap(bs => bs.districts)
  const contestIds = election.contests
    .filter(
      contest =>
        districts.includes(contest.districtId) && contest.partyId === party.id
    )
    .map(contest => contest.id)

  return {
    ...electionTally,
    contestTallies: electionTally.contestTallies.filter(contestTally =>
      contestIds.includes(contestTally.contest.id)
    ),
  }
}

interface FullTallyParams {
  election: Election
  votesByPrecinct: VotesByPrecinct
}

export function fullTallyVotes({ election, votesByPrecinct }: FullTallyParams): FullElectionTally {
  const precinctTallies: Dictionary<ElectionTally> = {}

  let allVotes: VotesDict[] = []

  for (let precinctId in votesByPrecinct) {
    const votes = votesByPrecinct[precinctId]!
    precinctTallies[precinctId] = tallyVotes({ election, precinctId, votes })
    allVotes = [...allVotes, ...votes]
  }

  const overallTally = tallyVotes({ election, votes: allVotes })

  return {
    precinctTallies,
    overallTally,
  }
}
