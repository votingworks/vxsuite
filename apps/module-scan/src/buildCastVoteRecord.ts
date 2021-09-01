import { strict as assert } from 'assert'
import {
  AnyContest,
  BallotMetadata,
  BallotType,
  CandidateVote,
  Contests,
  Dictionary,
  Election,
  getBallotStyle,
  getContests,
  InterpretedBmdPage,
  InterpretedHmpbPage,
  UninterpretedHmpbPage,
  VotesDict,
} from '@votingworks/types'
import { find, throwIllegalValue } from '@votingworks/utils'
import { VX_MACHINE_ID } from './globals'
import {
  CastVoteRecord,
  PageInterpretationWithAdjudication as BuildCastVoteRecordInput,
  SheetOf,
} from './types'
import { MarksByContestId, MarkStatus } from './types/ballot-review'
import allContestOptions from './util/allContestOptions'
import {
  describeValidationError,
  validateSheetInterpretation,
} from './validation'

export function getCVRBallotType(
  ballotType: BallotType
): CastVoteRecord['_ballotType'] {
  switch (ballotType) {
    case BallotType.Absentee:
      return 'absentee'

    case BallotType.Provisional:
      return 'provisional'

    case BallotType.Standard:
      return 'standard'

    default:
      throwIllegalValue(ballotType)
  }
}

export function buildCastVoteRecordMetadataEntries(
  ballotId: string,
  batchId: string,
  batchLabel: string,
  metadata: BallotMetadata
): CastVoteRecord {
  return {
    _ballotId: ballotId,
    _ballotStyleId: metadata.ballotStyleId,
    _ballotType: getCVRBallotType(metadata.ballotType),
    _batchId: batchId,
    _batchLabel: batchLabel,
    _precinctId: metadata.precinctId,
    _scannerId: VX_MACHINE_ID,
    _testBallot: metadata.isTestMode,
    _locales: metadata.locales,
  }
}

type ContestOptionPair = [string, string]

export function getWriteInOptionIdsForContestVote(
  contest: AnyContest,
  votes: VotesDict
): string[] {
  if (contest.type === 'candidate') {
    if (!contest.allowWriteIns) {
      return []
    }
    const vote = votes[contest.id]
    return vote
      ? (vote as CandidateVote)
          .filter(({ isWriteIn }) => isWriteIn)
          .map(({ id }) => id)
      : []
  }
  if (contest.type === 'yesno') {
    return []
  }
  if (contest.type === 'ms-either-neither') {
    return []
  }
  // @ts-expect-error -- `contest` has type `never` since all known branches are covered
  throw new TypeError(`contest type not yet supported: ${contest.type}`)
}

export function getOptionIdsForContestVote(
  contest: AnyContest,
  votes: VotesDict
): ContestOptionPair[] {
  if (contest.type === 'candidate') {
    const vote = votes[contest.id]
    return vote ? (vote as CandidateVote).map(({ id }) => [contest.id, id]) : []
  }
  if (contest.type === 'yesno') {
    const vote = votes[contest.id]
    return vote ? (vote as readonly string[]).map((id) => [contest.id, id]) : []
  }
  if (contest.type === 'ms-either-neither') {
    return [
      ...((votes[contest.eitherNeitherContestId] ??
        []) as readonly string[]).map<[string, string]>((id) => [
        contest.eitherNeitherContestId,
        id,
      ]),
      ...((votes[contest.pickOneContestId] ?? []) as readonly string[]).map<
        [string, string]
      >((id) => [contest.pickOneContestId, id]),
    ]
  }
  // @ts-expect-error -- `contest` has type `never` since all known branches are covered
  throw new TypeError(`contest type not yet supported: ${contest.type}`)
}

export function buildCastVoteRecordVotesEntries(
  contests: Contests,
  votes: VotesDict,
  adjudication?: MarksByContestId
): Dictionary<string[]> {
  const result: Dictionary<string[]> = {}

  for (const contest of contests) {
    const resolvedOptionIds: ContestOptionPair[] = []
    const interpretedOptionIds = getOptionIdsForContestVote(contest, votes)
    const writeInOptions = getWriteInOptionIdsForContestVote(contest, votes)

    for (const option of allContestOptions(contest, writeInOptions)) {
      const optionAdjudication = adjudication?.[option.contestId]?.[option.id]

      if (
        optionAdjudication === MarkStatus.Marked ||
        (interpretedOptionIds.some(
          ([contestId, optionId]) =>
            contestId === option.contestId && option.id === optionId
        ) &&
          optionAdjudication !== MarkStatus.Unmarked)
      ) {
        resolvedOptionIds.push([option.contestId, option.id])
      }

      // Ensure all contests end up with an empty array if they have no votes.
      result[option.contestId] = result[option.contestId] ?? []
    }

    for (const [contestId, optionId] of resolvedOptionIds) {
      result[contestId] = [...(result[contestId] ?? []), optionId]
    }
  }

  return result
}

export function getContestsFromIds(
  election: Election,
  contestIds: readonly string[]
): Contests {
  return contestIds.map((id) => find(election.contests, (c) => c.id === id))
}

export function getContestsForBallotStyle(
  election: Election,
  ballotStyleId: string
): Contests {
  const ballotStyle = getBallotStyle({ ballotStyleId, election })
  assert(ballotStyle)
  return getContests({ ballotStyle, election })
}

export function buildCastVoteRecordFromBmdPage(
  ballotId: string,
  batchId: string,
  batchLabel: string,
  election: Election,
  interpretation: InterpretedBmdPage
): CastVoteRecord {
  return {
    ...buildCastVoteRecordMetadataEntries(
      ballotId,
      batchId,
      batchLabel,
      interpretation.metadata
    ),
    ...buildCastVoteRecordVotesEntries(
      getContestsForBallotStyle(
        election,
        interpretation.metadata.ballotStyleId
      ),
      interpretation.votes,
      {}
    ),
  }
}

function buildCastVoteRecordFromHmpbPage(
  sheetId: string,
  ballotId: string,
  batchId: string,
  batchLabel: string,
  election: Election,
  [front, back]: SheetOf<
    BuildCastVoteRecordInput<InterpretedHmpbPage | UninterpretedHmpbPage>
  >
): CastVoteRecord {
  if (
    front.interpretation.metadata.pageNumber >
    back.interpretation.metadata.pageNumber
  ) {
    return buildCastVoteRecordFromHmpbPage(
      sheetId,
      ballotId,
      batchId,
      batchLabel,
      election,
      [back, front]
    )
  }

  if (!front.contestIds || !back.contestIds) {
    throw new Error(`expected sheet to have contest ids with sheet ${sheetId}`)
  }

  return {
    ...buildCastVoteRecordMetadataEntries(
      ballotId,
      batchId,
      batchLabel,
      front.interpretation.metadata
    ),
    _pageNumbers: [
      front.interpretation.metadata.pageNumber,
      back.interpretation.metadata.pageNumber,
    ],
    ...buildCastVoteRecordVotesEntries(
      getContestsFromIds(election, front.contestIds),
      front.interpretation.type === 'InterpretedHmpbPage'
        ? front.interpretation.votes
        : {},
      front.adjudication
    ),
    ...buildCastVoteRecordVotesEntries(
      getContestsFromIds(election, back.contestIds),
      back.interpretation.type === 'InterpretedHmpbPage'
        ? back.interpretation.votes
        : {},
      back.adjudication
    ),
  }
}

export function buildCastVoteRecord(
  sheetId: string,
  batchId: string,
  batchLabel: string,
  ballotId: string,
  election: Election,
  [front, back]: SheetOf<BuildCastVoteRecordInput>
): CastVoteRecord | undefined {
  const validationResult = validateSheetInterpretation([
    front.interpretation,
    back.interpretation,
  ])

  if (validationResult.isErr()) {
    throw new Error(describeValidationError(validationResult.err()))
  }

  const blankPages = ['BlankPage', 'UnreadablePage']

  if (
    blankPages.includes(front.interpretation.type) &&
    !blankPages.includes(back.interpretation.type)
  ) {
    return buildCastVoteRecord(
      sheetId,
      batchId,
      batchLabel,
      ballotId,
      election,
      [back, front]
    )
  }

  if (front.interpretation.type === 'InterpretedBmdPage') {
    return buildCastVoteRecordFromBmdPage(
      ballotId,
      batchId,
      batchLabel,
      election,
      front.interpretation
    )
  }

  if (
    front.interpretation.type === 'InterpretedHmpbPage' ||
    front.interpretation.type === 'UninterpretedHmpbPage'
  ) {
    return buildCastVoteRecordFromHmpbPage(
      sheetId,
      ballotId,
      batchId,
      batchLabel,
      election,
      [front, back] as SheetOf<
        BuildCastVoteRecordInput<InterpretedHmpbPage | UninterpretedHmpbPage>
      >
    )
  }
}
