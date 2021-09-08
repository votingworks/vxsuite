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
 * @returns ContestVoteOption[] ex. ['yes', 'no']
 */
export function getContestVoteOptionsForYesNoContest(
  contest: YesNoContest
): readonly YesNoVoteID[] {
  assert(contest.type === 'yesno')
  return ['yes', 'no']
}

/**
 * Gets all the vote options a voter can make for a given contest. If write ins are allowed a single write in candidate ID is included.
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
