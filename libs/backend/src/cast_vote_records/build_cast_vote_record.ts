import {
  Optional,
  assert,
  assertDefined,
  iter,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  BallotId,
  BallotMark,
  BallotStyleId,
  BallotType,
  Candidate,
  CandidateContest,
  CandidateVote,
  CVR,
  ElectionDefinition,
  getBallotStyle,
  InterpretedBmdPage,
  InterpretedHmpbPage,
  MarkStatus,
  MarkThresholds,
  SheetOf,
  StraightPartyContest,
  StraightPartyVote,
  Vote,
  VotesDict,
  YesNoContest,
  YesNoVote,
} from '@votingworks/types';
import {
  UNMARKED_WRITE_IN_SELECTION_POSITION_OTHER_STATUS,
  buildCVRSnapshotBallotTypeMetadata,
  CachedElectionLookups,
  getMarkStatus,
} from '@votingworks/utils';

/**
 * The input to {@link buildCvrImageData}
 */
export interface CvrImageDataInput {
  imageHash: string;
  imageRelativePath: string;
  /** Optional because we don't export layout files for BMD ballots */
  layoutFileHash?: string;
}

/**
 * Separator between the image and layout hashes within the single CDF hash field.
 */
export const HASH_SEPARATOR = '-';

/**
 * Because the CDF for cast vote records only allows one hash per image, but we
 * have two files (image file + layout file), we concatenate the hash to fit in
 * the file format.
 */
export function combineImageAndLayoutHashes(
  imageHash: string,
  layoutFileHash?: string
): string {
  return layoutFileHash
    ? `${imageHash}${HASH_SEPARATOR}${layoutFileHash}`
    : imageHash;
}

/**
 * Given CVR image data, extracts the image hash from the report's hash field,
 * which may also contain a layout hash.
 */
export function getImageHash(imageData: CVR.ImageData): string {
  const multiHash = assertDefined(imageData.Hash).Value;
  return assertDefined(multiHash.split(HASH_SEPARATOR)[0]);
}

/**
 * Given CVR image data, extracts the layout hash from the report's hash field,
 * if it exists.
 */
export function getLayoutHash(imageData: CVR.ImageData): Optional<string> {
  const multiHash = assertDefined(imageData.Hash).Value;
  return multiHash.split(HASH_SEPARATOR)[1];
}

/**
 * Builds a cast vote record image data object
 */
export function buildCvrImageData({
  imageHash,
  imageRelativePath,
  layoutFileHash,
}: CvrImageDataInput): CVR.ImageData {
  return {
    '@type': 'CVR.ImageData',
    Hash: {
      '@type': 'CVR.Hash',
      Type: CVR.HashType.Sha256,
      Value: combineImageAndLayoutHashes(imageHash, layoutFileHash),
    },
    Location: `file:${imageRelativePath}`,
  };
}

// VVSG 2.0 1.1.5-E.2
function countOvervotes(votes: Vote, votesAllowed: number): number {
  return votes.length > votesAllowed ? votesAllowed : 0;
}

// VVSG 2.0 1.1.5-E.2
function countUndervotes(votes: Vote, votesAllowed: number): number {
  return votes.length < votesAllowed ? votesAllowed - votes.length : 0;
}

function buildCVRBallotMeasureContest({
  contest,
  vote,
  electionDefinition,
  ballotStyleId,
}: {
  contest: YesNoContest;
  vote: YesNoVote;
  electionDefinition: ElectionDefinition;
  ballotStyleId: BallotStyleId;
}): CVR.CVRContest {
  const votesAllowed = 1;
  const overvotes = countOvervotes(vote, votesAllowed);
  const undervotes = countUndervotes(vote, votesAllowed);
  const overvoted = overvotes > 0;
  const undervoted = undervotes > 0;

  return {
    '@type': 'CVR.CVRContest',
    ContestId: contest.id,
    Overvotes: overvotes,
    Undervotes: undervotes,
    Status: overvoted
      ? [CVR.ContestStatus.Overvoted, CVR.ContestStatus.InvalidatedRules]
      : undervoted
      ? [CVR.ContestStatus.Undervoted, CVR.ContestStatus.NotIndicated]
      : undefined,
    CVRContestSelection: vote.map((optionId) => ({
      '@type': 'CVR.CVRContestSelection',
      ContestSelectionId: optionId,
      // include position on the ballot per VVSG 2.0 1.1.5-C.2
      OptionPosition: CachedElectionLookups.getOptionPosition(
        electionDefinition,
        ballotStyleId,
        contest.id,
        optionId
      ),
      Status: overvoted
        ? [CVR.ContestSelectionStatus.InvalidatedRules]
        : undefined,
      SelectionPosition: [
        {
          '@type': 'CVR.SelectionPosition',
          HasIndication: CVR.IndicationStatus.Yes,
          NumberVotes: 1,
          IsAllocable: overvoted
            ? CVR.AllocationStatus.No
            : CVR.AllocationStatus.Yes,
          Status: overvoted ? [CVR.PositionStatus.InvalidatedRules] : undefined,
        },
      ],
    })),
  };
}

/**
 * Discriminator between machine-marked ballots and hand-marked ballots.
 */
export type BallotMarkingMode = 'hand' | 'machine';

type CVRContestRequiredBallotPageOptions =
  | {
      ballotMarkingMode: 'machine';
      image?: CvrImageDataInput;
    }
  | {
      ballotMarkingMode: 'hand';
      image?: CvrImageDataInput;
    };

function buildCVRCandidateContest({
  contest,
  electionDefinition,
  ballotStyleId,
  vote,
  unmarkedWriteIns,
  options,
}: {
  contest: CandidateContest;
  electionDefinition: ElectionDefinition;
  ballotStyleId: BallotStyleId;
  vote: CandidateVote;
  unmarkedWriteIns?: InterpretedHmpbPage['unmarkedWriteIns'];
  options: CVRContestRequiredBallotPageOptions;
}): CVR.CVRContest {
  const overvotes = countOvervotes(vote, contest.seats);
  const undervotes = countUndervotes(vote, contest.seats);
  const overvoted = overvotes > 0;
  const undervoted = undervotes > 0;

  const statuses: CVR.ContestStatus[] = [];
  if (vote.length === 0) {
    statuses.push(CVR.ContestStatus.NotIndicated);
  }

  if (undervoted) {
    statuses.push(CVR.ContestStatus.Undervoted);
  }

  if (overvoted) {
    statuses.push(
      CVR.ContestStatus.Overvoted,
      CVR.ContestStatus.InvalidatedRules
    );
  }

  const numWriteIns = iter(vote)
    .filter((choice) => choice.isWriteIn)
    .count();

  // Write-ins on hand-marked paper ballots are have Id's indexed according to
  // their position on the ballot. For machine-marked ballots the Id's are not
  // numerically indexed but instead contain the write-in name. We convert to
  // the indexed version so that the CVR ContestSelectionId's correspond to the
  // Id's defined in the cast vote record metadata.
  let voteWriteInIndexed: Candidate[] = [];
  if (options.ballotMarkingMode === 'hand') {
    voteWriteInIndexed = [...vote];
  } else {
    let writeInCounter = 0;
    for (const candidate of vote) {
      if (!candidate.isWriteIn) {
        voteWriteInIndexed.push(candidate);
      } else {
        voteWriteInIndexed.push({
          ...candidate,
          id: `write-in-${writeInCounter}`,
        });
        writeInCounter += 1;
      }
    }
  }

  const markedVoteSelections: CVR.CVRContestSelection[] =
    voteWriteInIndexed.map((candidate) => {
      const { isWriteIn } = candidate;

      const selectionStatuses: CVR.ContestSelectionStatus[] = [];
      if (overvoted) {
        selectionStatuses.push(CVR.ContestSelectionStatus.InvalidatedRules);
      }
      if (isWriteIn) {
        selectionStatuses.push(CVR.ContestSelectionStatus.NeedsAdjudication);
      }

      return {
        '@type': 'CVR.CVRContestSelection',
        ContestSelectionId: candidate.id,
        // include position on the ballot per VVSG 2.0 1.1.5-C.2
        OptionPosition: CachedElectionLookups.getOptionPosition(
          electionDefinition,
          ballotStyleId,
          contest.id,
          candidate.id
        ),
        Status: selectionStatuses.length > 0 ? selectionStatuses : undefined,
        SelectionPosition: [
          {
            '@type': 'CVR.SelectionPosition',
            HasIndication: CVR.IndicationStatus.Yes,
            NumberVotes: 1,
            IsAllocable: overvoted
              ? CVR.AllocationStatus.No
              : isWriteIn
              ? CVR.AllocationStatus.Unknown
              : CVR.AllocationStatus.Yes,
            Status: overvoted
              ? [CVR.PositionStatus.InvalidatedRules]
              : undefined,
            CVRWriteIn: isWriteIn
              ? {
                  '@type': 'CVR.CVRWriteIn',
                  // include name of write-in for machine-marked ballots per VVSG 2.0 1.1.5-D.2
                  Text:
                    options.ballotMarkingMode === 'machine'
                      ? candidate.name
                      : undefined,
                  // include image of write-in for hand-marked ballots per VVSG 2.0 1.1.5-D.3
                  WriteInImage:
                    options.ballotMarkingMode === 'hand' && options.image
                      ? buildCvrImageData(options.image)
                      : undefined,
                }
              : undefined,
          },
        ],
      };
    });

  // We include unmarked write-ins (write-ins without the bubble filled) as
  // contest selections without an indication and with the allocation
  // status unknown.
  const unmarkedWriteInSelections: CVR.CVRContestSelection[] =
    unmarkedWriteIns?.map((unmarkedWriteIn) => {
      // We can only have unmarked write-ins on hand-marked ballots
      assert(options.ballotMarkingMode === 'hand');
      assert(options.image);

      return {
        '@type': 'CVR.CVRContestSelection',
        ContestSelectionId: unmarkedWriteIn.optionId,
        OptionPosition: CachedElectionLookups.getOptionPosition(
          electionDefinition,
          ballotStyleId,
          contest.id,
          unmarkedWriteIn.optionId
        ),
        Status: [CVR.ContestSelectionStatus.NeedsAdjudication],
        SelectionPosition: [
          {
            '@type': 'CVR.SelectionPosition',
            HasIndication: CVR.IndicationStatus.Unknown,
            NumberVotes: 1,
            IsAllocable: CVR.AllocationStatus.Unknown,
            Status: [CVR.PositionStatus.Other],
            OtherStatus: UNMARKED_WRITE_IN_SELECTION_POSITION_OTHER_STATUS,
            CVRWriteIn: {
              '@type': 'CVR.CVRWriteIn',
              WriteInImage: buildCvrImageData(options.image),
            },
          },
        ],
      };
    }) ?? [];

  return {
    '@type': 'CVR.CVRContest',
    ContestId: contest.id,
    Overvotes: overvotes,
    Undervotes: undervotes,
    WriteIns: numWriteIns, // VVSG 2.0 1.1.5-E.3
    Status: statuses.length > 0 ? statuses : undefined,
    CVRContestSelection: [
      ...markedVoteSelections,
      ...unmarkedWriteInSelections,
    ],
  };
}

function buildCVRStraightPartyContest({
  contest,
  electionDefinition,
  ballotStyleId,
  vote,
}: {
  contest: StraightPartyContest;
  electionDefinition: ElectionDefinition;
  ballotStyleId: BallotStyleId;
  vote: StraightPartyVote;
}): CVR.CVRContest {
  const votesAllowed = 1;
  const overvotes = countOvervotes(vote, votesAllowed);
  const undervotes = countUndervotes(vote, votesAllowed);
  const overvoted = overvotes > 0;
  const undervoted = undervotes > 0;

  return {
    '@type': 'CVR.CVRContest',
    ContestId: contest.id,
    Overvotes: overvotes,
    Undervotes: undervotes,
    Status: overvoted
      ? [CVR.ContestStatus.Overvoted, CVR.ContestStatus.InvalidatedRules]
      : undervoted
      ? [CVR.ContestStatus.Undervoted, CVR.ContestStatus.NotIndicated]
      : undefined,
    CVRContestSelection: vote.map((partyId) => ({
      '@type': 'CVR.CVRContestSelection',
      ContestSelectionId: partyId,
      // include position on the ballot per VVSG 2.0 1.1.5-C.2
      OptionPosition: CachedElectionLookups.getOptionPosition(
        electionDefinition,
        ballotStyleId,
        contest.id,
        partyId
      ),
      Status: overvoted
        ? [CVR.ContestSelectionStatus.InvalidatedRules]
        : undefined,
      SelectionPosition: [
        {
          '@type': 'CVR.SelectionPosition',
          HasIndication: CVR.IndicationStatus.Yes,
          NumberVotes: 1,
          IsAllocable: overvoted
            ? CVR.AllocationStatus.No
            : CVR.AllocationStatus.Yes,
          Status: overvoted ? [CVR.PositionStatus.InvalidatedRules] : undefined,
        },
      ],
    })),
  };
}

/**
 * Builds an array of CDF format {@link CVR.CVRContest} given a list of
 * contests to include, a dictionary of votes for those contests, and
 * some options about the ballot page (BMD vs. HMPB and image filename if
 * applicable). Intended to be used for a BMD ballot or a single page of an
 * HMPB ballot. For `contests` for which there are no `votes`, assumes the
 * contests is fully undervoted.
 */
export function buildCVRContestsFromVotes({
  votes,
  unmarkedWriteIns,
  electionDefinition,
  ballotStyleId,
  options,
}: {
  votes: VotesDict;
  unmarkedWriteIns?: InterpretedHmpbPage['unmarkedWriteIns'];
  electionDefinition: ElectionDefinition;
  ballotStyleId: BallotStyleId;
  options: CVRContestRequiredBallotPageOptions;
}): CVR.CVRContest[] {
  const cvrContests: CVR.CVRContest[] = [];

  const contests = Object.keys(votes).map((contestId) =>
    CachedElectionLookups.getContestById(electionDefinition, contestId)
  );
  for (const contest of contests) {
    // If there is no element in the `votes` object, there are no votes. We
    // must include information about this contest as an undervoted contest
    // per VVSG 2.0 1.1.5-E.2
    // @coverage-defer
    const contestVote = votes[contest.id] || [];
    const contestUnmarkedWriteIns = unmarkedWriteIns?.filter(
      ({ contestId }) => contestId === contest.id
    );
    switch (contest.type) {
      case 'yesno':
        cvrContests.push(
          buildCVRBallotMeasureContest({
            contest,
            vote: contestVote as YesNoVote,
            electionDefinition,
            ballotStyleId,
          })
        );
        break;
      case 'candidate':
        cvrContests.push(
          buildCVRCandidateContest({
            contest,
            electionDefinition,
            ballotStyleId,
            vote: contestVote as CandidateVote,
            unmarkedWriteIns: contestUnmarkedWriteIns,
            options,
          })
        );
        break;
      case 'straight-party':
        cvrContests.push(
          buildCVRStraightPartyContest({
            contest,
            electionDefinition,
            ballotStyleId,
            vote: contestVote as StraightPartyVote,
          })
        );
        break;
      default:
        throwIllegalValue(contest);
    }
  }

  return cvrContests;
}

/**
 * Creates an "original" CVR snapshot which includes *all* marks on the ballot,
 * their thresholds, and `HasIndication` based on whether the mark score is
 * greater than or equal to the provided `definiteMarkThreshold`. We include
 * these "original" CVR snapshots to have a record of voter marks before any
 * contest rules are applied per VVSG 2.0 1.1.5-F.1
 *
 * @param id ID of the parent CVR
 * @param marks All scores for all potential marks on a scanned sheet
 * @param definiteMarkThreshold The threshold for mark as counting as `HasIndication`
 * @returns "original" CVR snapshot of the sheet
 */
function buildOriginalSnapshot({
  castVoteRecordId,
  marks,
  markThresholds,
  electionDefinition,
  ballotStyleId,
  ballotType,
}: {
  castVoteRecordId: string;
  marks: BallotMark[];
  markThresholds: MarkThresholds;
  electionDefinition: ElectionDefinition;
  ballotStyleId: BallotStyleId;
  ballotType: BallotType;
}): CVR.CVRSnapshot {
  const marksByContest = iter(marks).toMap((mark) => mark.contestId);

  return {
    '@id': `${castVoteRecordId}-original`,
    '@type': 'CVR.CVRSnapshot',
    Type: CVR.CVRType.Original,
    ...buildCVRSnapshotBallotTypeMetadata(ballotType),
    CVRContest: [...marksByContest.entries()].map(
      ([contestId, contestMarks]) => ({
        '@type': 'CVR.CVRContest',
        ContestId: contestId,
        CVRContestSelection: [...contestMarks].map((mark) => ({
          '@type': 'CVR.CVRContestSelection',
          ContestSelectionId: mark.optionId,
          // include position on the ballot per VVSG 2.0 1.1.5-C.2
          OptionPosition: CachedElectionLookups.getOptionPosition(
            electionDefinition,
            ballotStyleId,
            mark.contestId,
            mark.optionId
          ),
          SelectionPosition: [
            {
              '@type': 'CVR.SelectionPosition',
              NumberVotes: 1,
              MarkMetricValue: [
                (Math.floor(mark.score * 100) / 100).toString(),
              ],
              HasIndication: (() => {
                const markStatus = getMarkStatus(mark.score, markThresholds);
                switch (markStatus) {
                  case MarkStatus.Marked:
                    return CVR.IndicationStatus.Yes;
                  case MarkStatus.Marginal:
                    return CVR.IndicationStatus.Unknown;
                  case MarkStatus.Unmarked:
                    return CVR.IndicationStatus.No;
                  default:
                    throwIllegalValue(markStatus);
                }
              })(),
            },
          ],
        })),
      })
    ),
  };
}

/**
 * Required parameters for building a cast vote record in CDF format ({@link CVR.CVR}).
 */
type BuildCastVoteRecordParams = {
  electionDefinition: ElectionDefinition;
  electionId: string;
  scannerId: string;
  castVoteRecordId: BallotId;
  batchId: string;
  indexInBatch?: number;
  ballotAuditId?: string;
} & (
  | {
      ballotMarkingMode: 'machine';
      interpretation: InterpretedBmdPage;
      images?: SheetOf<CvrImageDataInput>;
    }
  | {
      ballotMarkingMode: 'hand';
      interpretations: SheetOf<InterpretedHmpbPage>;
      images?: SheetOf<CvrImageDataInput>;
      markThresholds: MarkThresholds;
    }
);

/**
 * Builds a cast vote record in CDF format ({@link CVR.CVR}).
 */
export function buildCastVoteRecord({
  electionDefinition,
  electionId,
  scannerId,
  castVoteRecordId,
  batchId,
  indexInBatch,
  ballotAuditId,
  ...rest
}: BuildCastVoteRecordParams): CVR.CVR {
  const { election } = electionDefinition;
  const ballotMetadata =
    rest.ballotMarkingMode === 'machine'
      ? rest.interpretation.metadata
      : rest.interpretations[0].metadata;

  const ballotParty = getBallotStyle({
    ballotStyleId: ballotMetadata.ballotStyleId,
    election,
  })?.partyId;

  const cvrMetadata: Omit<CVR.CVR, 'CVRSnapshot' | 'CurrentSnapshotId'> = {
    '@type': 'CVR.CVR',
    BallotStyleId: ballotMetadata.ballotStyleId,
    BallotStyleUnitId: ballotMetadata.precinctId, // VVSG 2.0 1.1.5-G.3
    // @coverage-defer
    PartyIds: ballotParty ? [ballotParty] : undefined, // VVSG 2.0 1.1.5-E.4
    CreatingDeviceId: scannerId,
    ElectionId: electionId,
    BatchId: batchId, // VVSG 2.0 1.1.5-G.6
    BatchSequenceId: indexInBatch, // VVSG 2.0 1.1.5-G.7
    BallotAuditId: ballotAuditId,
    UniqueId: castVoteRecordId,
  };

  // CVR for machine-marked ballot, only has "original" snapshot because the
  // restrictions of the ballot marking device already applied basic contest rules.
  if (rest.ballotMarkingMode === 'machine') {
    const { interpretation, images } = rest;

    const ballotStyle = getBallotStyle({
      ballotStyleId: ballotMetadata.ballotStyleId,
      election,
    });
    assert(ballotStyle);

    return {
      ...cvrMetadata,
      BallotAuditId: interpretation.metadata.ballotAuditId,
      BallotSheetId: interpretation.metadata.pageNumber.toString(),
      CurrentSnapshotId: `${castVoteRecordId}-original`,
      CVRSnapshot: [
        {
          '@type': 'CVR.CVRSnapshot',
          '@id': `${castVoteRecordId}-original`,
          Type: CVR.CVRType.Original,
          ...buildCVRSnapshotBallotTypeMetadata(ballotMetadata.ballotType),
          CVRContest: buildCVRContestsFromVotes({
            votes: interpretation.votes,
            electionDefinition,
            ballotStyleId: ballotMetadata.ballotStyleId,
            options: {
              ballotMarkingMode: 'machine',
            },
          }),
        },
      ],
      BallotImage: images?.map(buildCvrImageData),
    };
  }

  const { interpretations, images, markThresholds } = rest;

  // The larger page number should be an even number which, divided by two,
  // yields the sheet number
  const sheetNumber = (
    Math.max(
      interpretations[0].metadata.pageNumber,
      interpretations[1].metadata.pageNumber
    ) / 2
  ).toString();

  const modifiedSnapshot: CVR.CVRSnapshot = {
    '@type': 'CVR.CVRSnapshot',
    '@id': `${castVoteRecordId}-interpreted`,
    Type: CVR.CVRType.Interpreted,
    ...buildCVRSnapshotBallotTypeMetadata(ballotMetadata.ballotType),
    CVRContest: [
      ...buildCVRContestsFromVotes({
        votes: interpretations[0].votes,
        unmarkedWriteIns: interpretations[0].unmarkedWriteIns,
        electionDefinition,
        ballotStyleId: ballotMetadata.ballotStyleId,
        options: {
          ballotMarkingMode: 'hand',
          image: images?.[0],
        },
      }),
      ...buildCVRContestsFromVotes({
        votes: interpretations[1].votes,
        unmarkedWriteIns: interpretations[1].unmarkedWriteIns,
        electionDefinition,
        ballotStyleId: ballotMetadata.ballotStyleId,
        options: {
          ballotMarkingMode: 'hand',
          image: images?.[1],
        },
      }),
    ],
  };

  // CVR for hand-marked paper ballots, has both "original" snapshot with
  // scores for all marks and "interpreted" snapshot with contest rules applied.
  return {
    ...cvrMetadata,
    BallotSheetId: sheetNumber, // VVSG 2.0 1.1.5-G.5
    CurrentSnapshotId: `${castVoteRecordId}-interpreted`,
    CVRSnapshot: [
      modifiedSnapshot,
      buildOriginalSnapshot({
        castVoteRecordId,
        marks: [
          ...interpretations[0].markInfo.marks,
          ...interpretations[1].markInfo.marks,
        ],
        markThresholds,
        electionDefinition,
        ballotStyleId: ballotMetadata.ballotStyleId,
        ballotType: ballotMetadata.ballotType,
      }),
    ],
    BallotImage: images?.map(buildCvrImageData),
  };
}
