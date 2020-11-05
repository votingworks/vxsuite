import {
  AnyContest,
  BallotType,
  CandidateVote,
  Contests,
  Dictionary,
  Election,
  getBallotStyle,
  getContests,
  VotesDict,
} from '@votingworks/ballot-encoder'
import {
  InterpretedBmdPage,
  InterpretedHmpbPage,
  UninterpretedHmpbPage,
} from './interpreter'
import {
  BallotMetadata,
  CastVoteRecord,
  PageInterpretationWithAdjudication as BuildCastVoteRecordInput,
  SheetOf,
} from './types'
import { MarksByContestId, MarkStatus } from './types/ballot-review'
import allContestOptions from './util/allContestOptions'
import { getMachineId } from './util/machineId'

export function buildCastVoteRecordMetadataEntries(
  ballotId: string,
  metadata: BallotMetadata
): CastVoteRecord {
  return {
    _ballotId: ballotId,
    _ballotStyleId: metadata.ballotStyleId,
    _ballotType: getCVRBallotType(metadata.ballotType),
    _precinctId: metadata.precinctId,
    _scannerId: getMachineId(),
    _testBallot: metadata.isTestMode,
    _locales: metadata.locales,
  }
}

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
      throw new Error(`unknown ballot type: ${ballotType}`)
  }
}

type ContestOptionPair = [string, string]

export function getOptionIdsForContestVote(
  contest: AnyContest,
  votes: VotesDict
): ContestOptionPair[] {
  if (contest.type === 'candidate') {
    const vote = votes[contest.id]
    return vote ? (vote as CandidateVote).map(({ id }) => [contest.id, id]) : []
  } else if (contest.type === 'yesno') {
    const vote = votes[contest.id]
    return vote ? (vote as readonly string[]).map((id) => [contest.id, id]) : []
  } else if (contest.type === 'ms-either-neither') {
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
  } else {
    // @ts-expect-error -- `contest` has type `never` since all known branches are covered
    throw new TypeError(`contest type not yet supported: ${contest.type}`)
  }
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

    for (const option of allContestOptions(contest)) {
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
  return contestIds.map((id) => election.contests.find((c) => c.id === id)!)
}

export function getContestsForBallotStyle(
  election: Election,
  ballotStyleId: string
): Contests {
  const ballotStyle = getBallotStyle({ ballotStyleId, election })!
  return getContests({ ballotStyle, election })
}

export function buildCastVoteRecordFromBmdPage(
  ballotId: string,
  election: Election,
  interpretation: InterpretedBmdPage
): CastVoteRecord {
  return {
    ...buildCastVoteRecordMetadataEntries(ballotId, interpretation.metadata),
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

export function buildCastVoteRecordFromHmpbPage(
  sheetId: string,
  ballotId: string,
  election: Election,
  [front, back]: SheetOf<
    BuildCastVoteRecordInput<InterpretedHmpbPage | UninterpretedHmpbPage>
  >
): CastVoteRecord {
  if (
    front.interpretation.metadata.pageNumber >
    back.interpretation.metadata.pageNumber
  ) {
    ;[front, back] = [back, front]
  }

  if (
    front.interpretation.metadata.pageNumber + 1 !==
    back.interpretation.metadata.pageNumber
  ) {
    throw new Error(
      `expected a sheet to have consecutive page numbers, but got front=${front.interpretation.metadata.pageNumber} back=${back.interpretation.metadata.pageNumber} with sheet ${sheetId}`
    )
  }

  if (
    front.interpretation.metadata.ballotStyleId !==
    back.interpretation.metadata.ballotStyleId
  ) {
    throw new Error(
      `expected a sheet to have the same ballot style, but got front=${front.interpretation.metadata.ballotStyleId} back=${back.interpretation.metadata.ballotStyleId} with sheet ${sheetId}`
    )
  }

  if (
    front.interpretation.metadata.precinctId !==
    back.interpretation.metadata.precinctId
  ) {
    throw new Error(
      `expected a sheet to have the same precinct, but got front=${front.interpretation.metadata.precinctId} back=${back.interpretation.metadata.precinctId} with sheet ${sheetId}`
    )
  }

  if (!front.contestIds || !back.contestIds) {
    throw new Error(`expected sheet to have contest ids with sheet ${sheetId}`)
  }

  return {
    ...buildCastVoteRecordMetadataEntries(
      ballotId,
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
  ballotId: string,
  election: Election,
  [front, back]: SheetOf<BuildCastVoteRecordInput>
): CastVoteRecord | undefined {
  const blankPages = ['BlankPage', 'UnreadablePage']

  if (blankPages.includes(front.interpretation.type)) {
    ;[front, back] = [back, front]
  }

  if (front.interpretation.type === 'InterpretedBmdPage') {
    if (!blankPages.includes(back.interpretation.type)) {
      throw new Error(
        `expected the back of a BMD page to be blank, but got '${back.interpretation.type}'`
      )
    }
    return buildCastVoteRecordFromBmdPage(
      ballotId,
      election,
      front.interpretation
    )
  }

  if (
    front.interpretation.type === 'InterpretedHmpbPage' ||
    front.interpretation.type === 'UninterpretedHmpbPage'
  ) {
    if (
      back.interpretation.type !== 'InterpretedHmpbPage' &&
      back.interpretation.type !== 'UninterpretedHmpbPage'
    ) {
      throw new Error(
        `expected the back of a HMPB page to be another HMPB page, but got '${back.interpretation.type}'`
      )
    }

    return buildCastVoteRecordFromHmpbPage(sheetId, ballotId, election, [
      front,
      back,
    ] as SheetOf<
      BuildCastVoteRecordInput<InterpretedHmpbPage | UninterpretedHmpbPage>
    >)
  }
}
