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
  ContestId,
  ContestOptionId,
  CVR,
  Election,
  ElectionDefinition,
  getBallotStyle,
  InterpretedBmdMultiPagePage,
  InterpretedBmdPage,
  InterpretedHmpbPage,
  MarkStatus,
  PartyId,
  SheetOf,
  StraightPartyContest,
  StraightPartyVote,
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
  const overvoted = vote.length > 1;
  const undervoted = vote.length < 1;

  return {
    '@type': 'CVR.CVRContest',
    ContestId: contest.id,
    Overvotes: vote.length > 1 ? 1 : 0,
    Undervotes: Math.max(1 - vote.length, 0),
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

function buildCVRStraightPartyContest({
  contest,
  vote,
  electionDefinition,
  ballotStyleId,
}: {
  contest: StraightPartyContest;
  vote: StraightPartyVote;
  electionDefinition: ElectionDefinition;
  ballotStyleId: BallotStyleId;
}): CVR.CVRContest {
  // Straight-party is always vote-for-one
  const overvoted = vote.length > 1;
  const undervoted = vote.length < 1;

  return {
    '@type': 'CVR.CVRContest',
    ContestId: contest.id,
    Overvotes: overvoted ? 1 : 0,
    Undervotes: undervoted ? 1 : 0,
    Status: overvoted
      ? [CVR.ContestStatus.Overvoted, CVR.ContestStatus.InvalidatedRules]
      : undervoted
      ? [CVR.ContestStatus.Undervoted, CVR.ContestStatus.NotIndicated]
      : undefined,
    CVRContestSelection: vote.map((partyId) => ({
      '@type': 'CVR.CVRContestSelection',
      ContestSelectionId: partyId,
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
  straightPartyDerivedIds,
}: {
  contest: CandidateContest;
  electionDefinition: ElectionDefinition;
  ballotStyleId: BallotStyleId;
  vote: CandidateVote;
  unmarkedWriteIns?: InterpretedHmpbPage['unmarkedWriteIns'];
  options: CVRContestRequiredBallotPageOptions;
  straightPartyDerivedIds?: ReadonlySet<ContestOptionId>;
}): CVR.CVRContest {
  const overvoted = vote.length > contest.seats;
  const undervoted = vote.length < contest.seats;

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
      const isDerived = straightPartyDerivedIds?.has(candidate.id) ?? false;

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
        Status: overvoted
          ? [CVR.ContestSelectionStatus.InvalidatedRules]
          : isDerived
          ? [CVR.ContestSelectionStatus.GeneratedRules]
          : isWriteIn
          ? [CVR.ContestSelectionStatus.NeedsAdjudication]
          : undefined,
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
              : isDerived
              ? [CVR.PositionStatus.GeneratedRules]
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
            HasIndication: CVR.IndicationStatus.No,
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
    Overvotes: vote.length > contest.seats ? contest.seats : 0, // VVSG 2.0 1.1.5-E.2
    Undervotes: Math.max(contest.seats - vote.length, 0), // VVSG 2.0 1.1.5-E.2
    WriteIns: numWriteIns, // VVSG 2.0 1.1.5-E.3
    Status: statuses.length > 0 ? statuses : undefined,
    CVRContestSelection: [
      ...markedVoteSelections,
      ...unmarkedWriteInSelections,
    ],
  };
}

/**
 * Computes which candidate IDs in each contest would be derived from
 * straight-party expansion. Mirrors the logic in `applyStraightPartyRules`
 * but operates on `VotesDict` and returns the derived IDs per contest.
 */
function computeStraightPartyDerivedIds(
  election: Election,
  votes: VotesDict
): Map<ContestId, Set<ContestOptionId>> {
  const straightPartyContest = election.contests.find(
    (c) => c.type === 'straight-party'
  );
  if (!straightPartyContest) return new Map();

  const straightPartyVote = votes[straightPartyContest.id];
  if (!straightPartyVote || straightPartyVote.length !== 1) return new Map();

  const selectedPartyId = straightPartyVote[0] as PartyId;
  const derived = new Map<ContestId, Set<ContestOptionId>>();

  for (const contest of election.contests) {
    if (contest.type !== 'candidate') continue;
    if (!contest.candidates.some((c) => c.partyIds?.includes(selectedPartyId))) continue;

    const voterSelections = votes[contest.id] ?? [];
    if (voterSelections.length >= contest.seats) continue;

    const selectedIds = new Set(
      (voterSelections as CandidateVote).map((c) => c.id)
    );
    const unselectedPartyOptions = contest.candidates
      .filter(
        (c) => c.partyIds?.includes(selectedPartyId) && !selectedIds.has(c.id)
      )
      .map((c) => c.id);

    const remainingSeats = contest.seats - voterSelections.length;
    if (unselectedPartyOptions.length <= remainingSeats) {
      derived.set(contest.id, new Set(unselectedPartyOptions));
    }
  }

  return derived;
}

/**
 * Expands a candidate vote to include straight-party derived candidates.
 */
function expandCandidateVoteWithDerived(
  vote: CandidateVote,
  contest: CandidateContest,
  derivedIds: ReadonlySet<ContestOptionId>
): CandidateVote {
  const derivedCandidates = contest.candidates.filter((c) =>
    derivedIds.has(c.id)
  );
  return [...vote, ...derivedCandidates];
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
  straightPartyDerived,
}: {
  votes: VotesDict;
  unmarkedWriteIns?: InterpretedHmpbPage['unmarkedWriteIns'];
  electionDefinition: ElectionDefinition;
  ballotStyleId: BallotStyleId;
  options: CVRContestRequiredBallotPageOptions;
  straightPartyDerived?: Map<ContestId, Set<ContestOptionId>>;
}): CVR.CVRContest[] {
  const { election } = electionDefinition;
  const cvrContests: CVR.CVRContest[] = [];

  // Compute derived IDs if not provided (e.g. for direct callers outside
  // buildCastVoteRecord). For HMPB, the caller should provide pre-computed
  // derived IDs based on both pages' combined votes.
  const derived =
    straightPartyDerived ?? computeStraightPartyDerivedIds(election, votes);

  const contests = Object.keys(votes).map((contestId) =>
    CachedElectionLookups.getContestById(electionDefinition, contestId)
  );
  for (const contest of contests) {
    // If there is no element in the `votes` object, there are no votes. We
    // must include information about this contest as an undervoted contest
    // per VVSG 2.0 1.1.5-E.2
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
      case 'candidate': {
        const contestDerived = derived.get(contest.id);
        // Expand the vote to include straight-party derived candidates
        const expandedVote = contestDerived
          ? expandCandidateVoteWithDerived(
              contestVote as CandidateVote,
              contest,
              contestDerived
            )
          : (contestVote as CandidateVote);
        cvrContests.push(
          buildCVRCandidateContest({
            contest,
            electionDefinition,
            ballotStyleId,
            vote: expandedVote,
            unmarkedWriteIns: contestUnmarkedWriteIns,
            options,
            straightPartyDerivedIds: contestDerived,
          })
        );
        break;
      }
      case 'straight-party':
        cvrContests.push(
          buildCVRStraightPartyContest({
            contest,
            vote: contestVote as StraightPartyVote,
            electionDefinition,
            ballotStyleId,
          })
        );
        break;
      /* istanbul ignore next - @preserve */
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
  definiteMarkThreshold,
  electionDefinition,
  ballotStyleId,
  ballotType,
}: {
  castVoteRecordId: string;
  marks: BallotMark[];
  definiteMarkThreshold: number;
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
              HasIndication:
                getMarkStatus(mark.score, {
                  definite: definiteMarkThreshold,
                }) === MarkStatus.Marked
                  ? CVR.IndicationStatus.Yes
                  : CVR.IndicationStatus.No,
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
      ballotMarkingMode: 'machine-multi-page';
      interpretation: InterpretedBmdMultiPagePage;
      images?: SheetOf<CvrImageDataInput>;
    }
  | {
      ballotMarkingMode: 'hand';
      interpretations: SheetOf<InterpretedHmpbPage>;
      images?: SheetOf<CvrImageDataInput>;
      definiteMarkThreshold: number;
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
      : rest.ballotMarkingMode === 'machine-multi-page'
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

    const spDerived = computeStraightPartyDerivedIds(
      election,
      interpretation.votes
    );

    return {
      ...cvrMetadata,
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
            straightPartyDerived: spDerived,
          }),
        },
      ],
      BallotImage: images?.map(buildCvrImageData),
    };
  }

  // CVR for multi-page machine-marked ballot, similar to single-page but with
  // page metadata and only the votes for contests on this page.
  if (rest.ballotMarkingMode === 'machine-multi-page') {
    const { interpretation, images } = rest;

    const ballotStyle = getBallotStyle({
      ballotStyleId: ballotMetadata.ballotStyleId,
      election,
    });
    assert(ballotStyle);

    // For multi-page BMD, each page only has its own contests' votes, but
    // straight-party derivation needs to see all votes. Since the straight-party
    // contest is on the page that has it, derivation will work for that page.
    // Candidate contests on other pages won't see the SP selection here —
    // multi-page BMD expansion is handled at tabulation time instead.
    const spDerived = computeStraightPartyDerivedIds(
      election,
      interpretation.votes
    );

    return {
      ...cvrMetadata,
      // Use the ballot audit ID from metadata for multi-page correlation
      BallotAuditId: interpretation.metadata.ballotAuditId,
      // Include sheet number based on page number for multi-page BMD
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
            straightPartyDerived: spDerived,
          }),
        },
      ],
      BallotImage: images?.map(buildCvrImageData),
    };
  }

  const { interpretations, images, definiteMarkThreshold } = rest;

  // The larger page number should be an even number which, divided by two,
  // yields the sheet number
  const sheetNumber = (
    Math.max(
      interpretations[0].metadata.pageNumber,
      interpretations[1].metadata.pageNumber
    ) / 2
  ).toString();

  // Combine both pages' votes to compute straight-party derived IDs, since
  // the SP contest may be on a different page than the candidate contests
  const allHmpbVotes: VotesDict = {
    ...interpretations[0].votes,
    ...interpretations[1].votes,
  };
  const spDerived = computeStraightPartyDerivedIds(election, allHmpbVotes);

  const modifiedSnapshot: CVR.CVRSnapshot = {
    '@type': 'CVR.CVRSnapshot',
    '@id': `${castVoteRecordId}-modified`,
    Type: CVR.CVRType.Modified,
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
        straightPartyDerived: spDerived,
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
        straightPartyDerived: spDerived,
      }),
    ],
  };

  // CVR for hand-marked paper ballots, has both "original" snapshot with
  // scores for all marks and "modified" snapshot with contest rules applied.
  return {
    ...cvrMetadata,
    BallotSheetId: sheetNumber, // VVSG 2.0 1.1.5-G.5
    CurrentSnapshotId: `${castVoteRecordId}-modified`,
    CVRSnapshot: [
      modifiedSnapshot,
      buildOriginalSnapshot({
        castVoteRecordId,
        marks: [
          ...interpretations[0].markInfo.marks,
          ...interpretations[1].markInfo.marks,
        ],
        definiteMarkThreshold,
        electionDefinition,
        ballotStyleId: ballotMetadata.ballotStyleId,
        ballotType: ballotMetadata.ballotType,
      }),
    ],
    BallotImage: images?.map(buildCvrImageData),
  };
}
