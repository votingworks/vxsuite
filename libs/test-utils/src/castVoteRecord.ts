import {
  CastVoteRecord,
  Dictionary,
  Election,
  expandEitherNeitherContests,
  getBallotStyle,
  getContests,
} from '@votingworks/types'

export interface CastVoteRecordOptions {
  readonly precinctId?: string
  readonly ballotId?: string
  readonly ballotStyleId?: string
  readonly ballotType?: 'absentee' | 'provisional' | 'standard'
  readonly testBallot?: boolean
  readonly scannerId?: string
  readonly batchId?: string
  readonly batchLabel?: string
}

export function generateCVR(
  election: Election,
  votes: Dictionary<string[]>,
  options: CastVoteRecordOptions
): CastVoteRecord {
  // If precinctId or ballotStyleId are not provided default to the first in the election
  const precinctId = options.precinctId ?? election.precincts[0].id
  const ballotStyleId = options.ballotStyleId ?? election.ballotStyles[0].id
  const ballotId = options.ballotId ?? ''
  const ballotType = options.ballotType ?? 'standard'
  const testBallot = !!options.testBallot // default to false
  const scannerId = options.scannerId ?? 'scanner-1'
  const batchId = options.batchId ?? 'batch-1'
  const batchLabel = options.batchLabel ?? 'Batch 1'

  // Add in blank votes for any contest in the ballot style not specified.
  const ballotStyle =
    getBallotStyle({
      ballotStyleId,
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
    _precinctId: precinctId,
    _ballotStyleId: ballotStyleId,
    _ballotId: ballotId,
    _ballotType: ballotType,
    _testBallot: testBallot,
    _scannerId: scannerId,
    _batchId: batchId,
    _batchLabel: batchLabel,
  }
}

export function generateFileContentFromCVRs(cvrs: CastVoteRecord[]): string {
  let fileContent = ''
  cvrs.forEach((cvr) => {
    fileContent += `${JSON.stringify(cvr)}\n`
  })
  return fileContent
}
