import {
  CastVoteRecord,
  Dictionary,
  Election,
  expandEitherNeitherContests,
  getBallotStyle,
  getContests,
} from '@votingworks/types'

export interface CastVoteRecordOptions {
  readonly _precinctId?: string
  readonly _ballotId?: string
  readonly _ballotStyleId?: string
  readonly _ballotType?: 'absentee' | 'provisional' | 'standard'
  readonly _testBallot?: boolean
  readonly _scannerId?: string
}

export function generateCVR(
  election: Election,
  votes: Dictionary<string[]>,
  options: CastVoteRecordOptions
): CastVoteRecord {
  // If precinctId or ballotStyleId are not provided default to the first in the election
  const _precinctId = options._precinctId ?? election.precincts[0].id
  const _ballotStyleId = options._ballotStyleId ?? election.ballotStyles[0].id
  const _ballotId = options._ballotId ?? ''
  const _ballotType = options._ballotType ?? 'standard'
  const _testBallot = !!options._testBallot // default to false
  const _scannerId = options._scannerId ?? 'scanner-1'

  // Add in blank votes for any contest in the ballot style not specified.
  const ballotStyle =
    getBallotStyle({
      ballotStyleId: _ballotStyleId,
      election,
    }) || election.ballotStyles[0]
  const contestsInBallot = expandEitherNeitherContests(
    getContests({ ballotStyle, election })
  )
  const allVotes: Dictionary<string[]> = {}
  contestsInBallot.forEach((contest) => {
    allVotes[contest.id] = contest.id in votes ? votes[contest.id] : []
  })
  return {
    ...allVotes,
    _precinctId,
    _ballotStyleId,
    _ballotId,
    _ballotType,
    _testBallot,
    _scannerId,
  }
}

export function generateFileContentFromCVRs(cvrs: CastVoteRecord[]): string {
  let fileContent = ''
  cvrs.forEach((cvr) => {
    fileContent += `${JSON.stringify(cvr)}\n`
  })
  return fileContent
}
