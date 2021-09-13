import { strict as assert } from 'assert'
import {
  Election,
  expandEitherNeitherContests,
  getEitherNeitherContests,
  VotesDict,
  YesNoVote,
  YesOrNo,
  CastVoteRecord,
  Candidate,
  CandidateContest,
  YesNoContest,
  YesNoVoteID,
  VotingMethod,
  CandidateVote,
  ContestOptionTally,
  ContestTally,
  Dictionary,
  getDistrictIdsForPartyId,
  Tally,
  YesNoVoteOption,
} from '@votingworks/types'
import { find } from './find'

export function getSingleYesNoVote(vote?: YesNoVote): YesOrNo | undefined {
  if (vote?.length === 1) {
    return vote[0]
  }
  return undefined
}

export const writeInCandidate: Candidate = {
  id: '__write-in',
  name: 'Write-In',
  isWriteIn: true,
}

export function normalizeWriteInId(candidateId: string): string {
  if (
    candidateId.startsWith('__writein') ||
    candidateId.startsWith('__write-in') ||
    candidateId.startsWith('writein') ||
    candidateId.startsWith('write-in')
  ) {
    return writeInCandidate.id
  }

  return candidateId
}

export const buildVoteFromCvr = ({
  election,
  cvr,
}: {
  election: Election
  cvr: CastVoteRecord
}): VotesDict => {
  const vote: VotesDict = {}
  const mutableCVR = { ...cvr }

  // If the CVR is malformed for this question -- only one of the pair'ed contest IDs
  // is there -- we don't want to count this as a ballot in this contest.
  getEitherNeitherContests(election.contests).forEach((c) => {
    const hasEitherNeither = mutableCVR[c.eitherNeitherContestId] !== undefined
    const hasPickOne = mutableCVR[c.pickOneContestId] !== undefined

    if (!(hasEitherNeither && hasPickOne)) {
      mutableCVR[c.eitherNeitherContestId] = undefined
      mutableCVR[c.pickOneContestId] = undefined
    }
  })

  expandEitherNeitherContests(election.contests).forEach((contest) => {
    if (!mutableCVR[contest.id]) {
      return
    }

    if (contest.type === 'yesno') {
      // the CVR is encoded the same way
      vote[contest.id] = mutableCVR[contest.id] as unknown as YesNoVote
      return
    }

    /* istanbul ignore else */
    if (contest.type === 'candidate') {
      vote[contest.id] = (mutableCVR[contest.id] as string[])
        .map((candidateId) => normalizeWriteInId(candidateId))
        .map((candidateId) =>
          find(
            [writeInCandidate, ...contest.candidates],
            (c) => c.id === candidateId
          )
        )
    }
  })

  return vote
}

/**
 * Gets all the vote options a voter can make for a given yes/no contest.
 */
export function getContestVoteOptionsForYesNoContest(
  contest: YesNoContest
): readonly YesNoVoteID[] {
  assert.equal(contest.type, 'yesno')
  return ['yes', 'no']
}

/**
 * Gets all the vote options a voter can make for a given contest. If write-ins are allowed a single write-in candidate ID is included.
 * @returns ContestVoteOption[] ex. ['yes', 'no'] or ['aaron', 'bob', '__write-in']
 */
export function getContestVoteOptionsForCandidateContest(
  contest: CandidateContest
): readonly Candidate[] {
  const options = contest.candidates
  if (contest.allowWriteIns) {
    return options.concat(writeInCandidate)
  }
  return options
}

export function getVotingMethodForCastVoteRecord(
  CVR: CastVoteRecord
): VotingMethod {
  return Object.values(VotingMethod).includes(CVR._ballotType as VotingMethod)
    ? (CVR._ballotType as VotingMethod)
    : VotingMethod.Unknown
}

interface TallyParams {
  election: Election
  votes: VotesDict[]
  filterContestsByParty?: string
}
export function tallyVotesByContest({
  election,
  votes,
  filterContestsByParty,
}: TallyParams): Dictionary<ContestTally> {
  const contestTallies: Dictionary<ContestTally> = {}
  const { contests } = election

  const districtsForParty = filterContestsByParty
    ? getDistrictIdsForPartyId(election, filterContestsByParty)
    : []

  expandEitherNeitherContests(contests).forEach((contest) => {
    if (
      filterContestsByParty === undefined ||
      (districtsForParty.includes(contest.districtId) &&
        contest.partyId === filterContestsByParty)
    ) {
      const tallies: Dictionary<ContestOptionTally> = {}
      if (contest.type === 'yesno') {
        ;[['yes'] as YesNoVoteOption, ['no'] as YesNoVoteOption].forEach(
          (option: YesNoVoteOption) => {
            if (option.length === 1) {
              tallies[option[0]] = { option, tally: 0 }
            }
          }
        )
      }

      if (contest.type === 'candidate') {
        contest.candidates.forEach((candidate) => {
          tallies[candidate.id] = { option: candidate, tally: 0 }
        })
        if (contest.allowWriteIns) {
          tallies[writeInCandidate.id] = { option: writeInCandidate, tally: 0 }
        }
      }

      let numberOfUndervotes = 0
      let numberOfOvervotes = 0
      let numberOfVotes = 0
      votes.forEach((vote) => {
        const selected = vote[contest.id]
        if (!selected) {
          return
        }

        numberOfVotes += 1
        // overvotes & undervotes
        const maxSelectable = contest.type === 'yesno' ? 1 : contest.seats
        if (selected.length > maxSelectable) {
          numberOfOvervotes += maxSelectable
          return
        }
        if (selected.length < maxSelectable) {
          numberOfUndervotes += maxSelectable - selected.length
        }
        if (selected.length === 0) {
          return
        }

        if (contest.type === 'yesno') {
          const optionId = selected[0] as string
          const optionTally = tallies[optionId]
          assert(optionTally)
          tallies[optionId] = {
            option: optionTally.option,
            tally: optionTally.tally + 1,
          }
        } else {
          ;(selected as CandidateVote).forEach((selectedOption) => {
            const optionTally = tallies[selectedOption.id]
            assert(optionTally)
            tallies[selectedOption.id] = {
              option: optionTally.option,
              tally: optionTally.tally + 1,
            }
          })
        }
      })
      const metadataForContest = {
        undervotes: numberOfUndervotes,
        overvotes: numberOfOvervotes,
        ballots: numberOfVotes,
      }

      contestTallies[contest.id] = {
        contest,
        tallies,
        metadata: metadataForContest,
      }
    }
  })

  return contestTallies
}

export function calculateTallyForCastVoteRecords(
  election: Election,
  castVoteRecords: Set<CastVoteRecord>,
  filterContestsByParty?: string
): Tally {
  const allVotes: VotesDict[] = []
  const ballotCountsByVotingMethod: Dictionary<number> = {}
  Object.values(VotingMethod).forEach((votingMethod) => {
    ballotCountsByVotingMethod[votingMethod] = 0
  })
  for (const CVR of castVoteRecords) {
    const vote = buildVoteFromCvr({ election, cvr: CVR })
    const votingMethod = getVotingMethodForCastVoteRecord(CVR)
    const count = ballotCountsByVotingMethod[votingMethod] ?? 0
    ballotCountsByVotingMethod[votingMethod] = count + 1
    allVotes.push(vote)
  }

  const overallTally = tallyVotesByContest({
    election,
    votes: allVotes,
    filterContestsByParty,
  })

  return {
    contestTallies: overallTally,
    castVoteRecords,
    numberOfBallotsCounted: allVotes.length,
    ballotCountsByVotingMethod,
  }
}
