import {
  AnyContest,
  CandidateVote,
  Contests,
  Dictionary,
  Election,
  getBallotStyle,
  getContests,
  Vote,
  VotesDict,
  YesNoVote,
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
    _precinctId: metadata.precinctId,
    _scannerId: getMachineId(),
    _testBallot: metadata.isTestBallot,
    _locales: metadata.locales,
  }
}

export function getOptionIdsForVote(
  contest: AnyContest,
  vote?: Vote
): string[] {
  if (!vote) {
    return []
  } else if (contest.type === 'candidate') {
    return (vote as CandidateVote).map(({ id }) => id)
  } else if (contest.type === 'yesno') {
    return (vote as YesNoVote).slice()
  } else {
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
    const resolvedOptionIds: string[] = []
    const interpretedOptionIds = getOptionIdsForVote(contest, votes[contest.id])

    for (const option of allContestOptions(contest)) {
      const optionAdjudication = adjudication?.[contest.id]?.[option.id]

      if (
        (interpretedOptionIds.includes(option.id) &&
          optionAdjudication !== MarkStatus.Unmarked) ||
        optionAdjudication === MarkStatus.Marked
      ) {
        resolvedOptionIds.push(option.id)
      }
    }

    result[contest.id] = resolvedOptionIds
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
      `expected a sheet to have consecutive page numbers, but got front=${front.interpretation.metadata.pageNumber} back=${back.interpretation.metadata.pageNumber}`
    )
  }

  if (
    front.interpretation.metadata.ballotStyleId !==
    back.interpretation.metadata.ballotStyleId
  ) {
    throw new Error(
      `expected a sheet to have the same ballot style, but got front=${front.interpretation.metadata.ballotStyleId} back=${back.interpretation.metadata.ballotStyleId}`
    )
  }

  if (
    front.interpretation.metadata.precinctId !==
    back.interpretation.metadata.precinctId
  ) {
    throw new Error(
      `expected a sheet to have the same precinct, but got front=${front.interpretation.metadata.precinctId} back=${back.interpretation.metadata.precinctId}`
    )
  }

  if (
    front.interpretation.metadata.pageCount !==
    back.interpretation.metadata.pageCount
  ) {
    throw new Error(
      `expected a sheet to have the same page count, but got front=${front.interpretation.metadata.pageCount} back=${back.interpretation.metadata.pageCount}`
    )
  }

  if (!front.contestIds || !back.contestIds) {
    throw new Error('expected sheet to have contest ids')
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
  ballotId: string,
  election: Election,
  [front, back]: SheetOf<BuildCastVoteRecordInput>
): CastVoteRecord | undefined {
  if (front.interpretation.type === 'BlankPage') {
    ;[front, back] = [back, front]
  }

  if (front.interpretation.type === 'InterpretedBmdPage') {
    if (back.interpretation.type !== 'BlankPage') {
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

    return buildCastVoteRecordFromHmpbPage(ballotId, election, [
      front,
      back,
    ] as SheetOf<
      BuildCastVoteRecordInput<InterpretedHmpbPage | UninterpretedHmpbPage>
    >)
  }
}
