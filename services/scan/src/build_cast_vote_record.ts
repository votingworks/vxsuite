import {
  AnyContest,
  BallotId,
  BallotMetadata,
  BallotPageLayout,
  BallotStyleId,
  BallotType,
  CandidateVote,
  CastVoteRecord,
  ContestOption,
  Contests,
  Dictionary,
  Election,
  getBallotStyle,
  getContests,
  getContestsFromIds,
  InlineBallotImage,
  InterpretedBmdPage,
  InterpretedHmpbPage,
  mapSheet,
  SheetOf,
  UninterpretedHmpbPage,
  VotesDict,
} from '@votingworks/types';
import {
  allContestOptions,
  assert,
  throwIllegalValue,
} from '@votingworks/utils';
import { VX_MACHINE_ID } from './globals';
import { PageInterpretationWithAdjudication as BuildCastVoteRecordInput } from './types';
import {
  describeValidationError,
  validateSheetInterpretation,
} from './validation';

export function getCvrBallotType(
  ballotType: BallotType
): CastVoteRecord['_ballotType'] {
  switch (ballotType) {
    case BallotType.Absentee:
      return 'absentee';

    case BallotType.Provisional:
      return 'provisional';

    case BallotType.Standard:
      return 'standard';

    default:
      throwIllegalValue(ballotType);
  }
}

export function buildCastVoteRecordMetadataEntries(
  ballotId: BallotId,
  batchId: string,
  batchLabel: string,
  metadata: BallotMetadata
): CastVoteRecord {
  return {
    _ballotId: ballotId,
    _ballotStyleId: metadata.ballotStyleId,
    _ballotType: getCvrBallotType(metadata.ballotType),
    _batchId: batchId,
    _batchLabel: batchLabel,
    _precinctId: metadata.precinctId,
    _scannerId: VX_MACHINE_ID,
    _testBallot: metadata.isTestMode,
    _locales: metadata.locales,
  };
}

type ContestOptionPair = [string, string];

export function getWriteInOptionIdsForContestVote(
  contest: AnyContest,
  votes: VotesDict
): string[] {
  if (contest.type === 'candidate') {
    if (!contest.allowWriteIns) {
      return [];
    }
    const vote = votes[contest.id];
    return vote
      ? (vote as CandidateVote)
          .filter(({ isWriteIn }) => isWriteIn)
          .map(({ id }) => id)
      : [];
  }
  if (contest.type === 'yesno') {
    return [];
  }
  if (contest.type === 'ms-either-neither') {
    return [];
  }
  throwIllegalValue(contest, 'type');
}

export function getOptionIdsForContestVote(
  contest: AnyContest,
  votes: VotesDict
): ContestOptionPair[] {
  if (contest.type === 'candidate') {
    const vote = votes[contest.id];
    return vote
      ? (vote as CandidateVote).map(({ id }) => [contest.id, id])
      : [];
  }
  if (contest.type === 'yesno') {
    const vote = votes[contest.id];
    return vote
      ? (vote as readonly string[]).map((id) => [contest.id, id])
      : [];
  }
  if (contest.type === 'ms-either-neither') {
    return [
      ...(
        (votes[contest.eitherNeitherContestId] ?? []) as readonly string[]
      ).map<[string, string]>((id) => [contest.eitherNeitherContestId, id]),
      ...((votes[contest.pickOneContestId] ?? []) as readonly string[]).map<
        [string, string]
      >((id) => [contest.pickOneContestId, id]),
    ];
  }
  throwIllegalValue(contest, 'type');
}

export function buildCastVoteRecordVotesEntries(
  contests: Contests,
  votes: VotesDict
): Dictionary<Array<ContestOption['id']>> {
  const result: Dictionary<Array<ContestOption['id']>> = {};

  for (const contest of contests) {
    const resolvedOptionIds: ContestOptionPair[] = [];
    const interpretedOptionIds = getOptionIdsForContestVote(contest, votes);
    const writeInOptions = getWriteInOptionIdsForContestVote(contest, votes);

    // HINT: Do not use `contest.id` in this loop, use `option.contestId`.
    // `contest.id !== option.contestId` for `ms-either-neither` contests.
    for (const option of allContestOptions(contest, writeInOptions)) {
      const interpretedContestOptionPair = interpretedOptionIds.find(
        ([contestId, optionId]) =>
          contestId === option.contestId && optionId === option.id
      );
      if (interpretedContestOptionPair) {
        resolvedOptionIds.push(interpretedContestOptionPair);
      }

      // Ensure all contests end up with an empty array if they have no votes.
      result[option.contestId] ??= [];
    }

    for (const [contestId, optionId] of resolvedOptionIds) {
      result[contestId] = [...(result[contestId] ?? []), optionId];
    }
  }

  return result;
}

export function getContestsForBallotStyle(
  election: Election,
  ballotStyleId: BallotStyleId
): Contests {
  const ballotStyle = getBallotStyle({ ballotStyleId, election });
  assert(ballotStyle);
  return getContests({ ballotStyle, election });
}

export function buildCastVoteRecordFromBmdPage(
  ballotId: BallotId,
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
      interpretation.votes
    ),
  };
}

function buildCastVoteRecordFromHmpbPage(
  sheetId: string,
  ballotId: BallotId,
  batchId: string,
  batchLabel: string,
  election: Election,
  [front, back]: SheetOf<
    BuildCastVoteRecordInput<InterpretedHmpbPage | UninterpretedHmpbPage>
  >,
  ballotLayouts?: SheetOf<BallotPageLayout>
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
      [back, front],
      ballotLayouts
    );
  }

  if (!front.contestIds || !back.contestIds) {
    throw new Error(`expected sheet to have contest ids with sheet ${sheetId}`);
  }

  const [frontVotesEntries, backVotesEntries] = mapSheet(
    [front, back],
    (page) => {
      if (!page.contestIds) {
        throw new Error(
          `expected sheet to have contest ids with sheet ${sheetId}`
        );
      }

      return buildCastVoteRecordVotesEntries(
        getContestsFromIds(election, page.contestIds),
        page.interpretation.type === 'InterpretedHmpbPage'
          ? page.interpretation.votes
          : {}
      );
    }
  );

  const votesEntries: Dictionary<string[]> = {
    ...frontVotesEntries,
    ...backVotesEntries,
  };

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
    ...votesEntries,
    _layouts: ballotLayouts,
  };
}

export function addBallotImagesToCvr(
  cvr: CastVoteRecord,
  ballotImages: SheetOf<InlineBallotImage>
): CastVoteRecord {
  return {
    ...cvr,
    _ballotImages: ballotImages,
  };
}

// returns booleans for front and back --> for now can only do true,true or false,false
export function cvrHasWriteIns(
  election: Election,
  cvr: CastVoteRecord
): SheetOf<boolean> {
  const potentialWriteIns: string[] = election.contests
    .filter((c) => c.type === 'candidate' && c.allowWriteIns)
    .map((c) => c.id);
  for (const contestId of potentialWriteIns) {
    const votes = cvr[contestId] as string[];
    if (votes?.find((vote: string) => vote.startsWith('write-in-'))) {
      return [true, true];
    }
  }

  return [false, false];
}

export function buildCastVoteRecord(
  sheetId: string,
  batchId: string,
  batchLabel: string,
  ballotId: BallotId,
  election: Election,
  [front, back]: SheetOf<BuildCastVoteRecordInput>,
  ballotLayouts?: SheetOf<BallotPageLayout>
): CastVoteRecord | undefined {
  const validationResult = validateSheetInterpretation([
    front.interpretation,
    back.interpretation,
  ]);

  if (validationResult.isErr()) {
    throw new Error(describeValidationError(validationResult.err()));
  }

  const blankPages = ['BlankPage', 'UnreadablePage'];

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
    );
  }

  if (front.interpretation.type === 'InterpretedBmdPage') {
    return buildCastVoteRecordFromBmdPage(
      ballotId,
      batchId,
      batchLabel,
      election,
      front.interpretation
    );
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
      >,
      ballotLayouts
    );
  }
}
