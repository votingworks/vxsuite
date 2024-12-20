import {
  Optional,
  assert,
  assertDefined,
  find,
  iter,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  AnyContest,
  BallotId,
  BallotMark,
  BallotType,
  Candidate,
  CandidateContest,
  CandidateVote,
  CVR,
  Election,
  ElectionDefinition,
  getBallotStyle,
  InterpretedBmdPage,
  InterpretedHmpbPage,
  MarkStatus,
  safeParseInt,
  SheetOf,
  VotesDict,
  YesNoContest,
  YesNoVote,
} from '@votingworks/types';
import {
  UNMARKED_WRITE_IN_SELECTION_POSITION_OTHER_STATUS,
  buildCVRSnapshotBallotTypeMetadata,
  getContestById,
  getMarkStatus,
} from '@votingworks/utils';

import {
  ContestOptionPositionMap,
  ElectionOptionPositionMap,
} from './option_map';

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
}: {
  contest: YesNoContest;
  vote: YesNoVote;
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
      OptionPosition: optionId === contest.yesOption.id ? 0 : 1,
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
 * Calculates the zero-indexed position of the given contest option on the
 * ballot. For candidates, this is the position of the candidate in the
 * contest's candidate lists. For HMPB write-ins with ids such as `write-in-0`,
 * it is determined from the write-in index in the ID. Do not use this method
 * for BMD write-in ids such as `write-in-(GREG)`
 */
export function getOptionPosition({
  contest,
  optionId,
}: {
  contest: AnyContest;
  optionId: string;
}): number {
  if (contest.type === 'yesno') {
    switch (optionId) {
      case contest.yesOption.id:
        return 0;
      case contest.noOption.id:
        return 1;
      default:
        throw new Error('unexpected option id for ballot measure contest');
    }
  }

  const writeInMatch = optionId.match(/^write-in-(.*)$/);

  // if no write-in match, expect a candidate id
  if (!writeInMatch) {
    const candidateIndex = contest.candidates.findIndex(
      (contestCandidate) => contestCandidate.id === optionId
    );

    if (candidateIndex === -1) {
      throw new Error('option id is neither a write-in nor a candidate id');
    }

    return candidateIndex;
  }

  const writeInIndex = safeParseInt(writeInMatch[1]);

  if (writeInIndex.isErr()) {
    throw new Error(
      'invalid write-in id, can only get option position for numerical write-in ids'
    );
  }

  return contest.candidates.length + writeInIndex.ok();
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
  contestOptionPositionMap,
  vote,
  unmarkedWriteIns,
  options,
}: {
  contest: CandidateContest;
  contestOptionPositionMap?: ContestOptionPositionMap;
  vote: CandidateVote;
  unmarkedWriteIns?: InterpretedHmpbPage['unmarkedWriteIns'];
  options: CVRContestRequiredBallotPageOptions;
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

      return {
        '@type': 'CVR.CVRContestSelection',
        ContestSelectionId: candidate.id,
        // include position on the ballot per VVSG 2.0 1.1.5-C.2
        OptionPosition: contestOptionPositionMap
          ? contestOptionPositionMap[candidate.id]
          : getOptionPosition({ contest, optionId: candidate.id }),
        Status: overvoted
          ? [CVR.ContestSelectionStatus.InvalidatedRules]
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
        OptionPosition: contestOptionPositionMap
          ? contestOptionPositionMap[unmarkedWriteIn.optionId]
          : getOptionPosition({ contest, optionId: unmarkedWriteIn.optionId }),
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
  electionOptionPositionMap,
  options,
}: {
  votes: VotesDict;
  unmarkedWriteIns?: InterpretedHmpbPage['unmarkedWriteIns'];
  electionDefinition: ElectionDefinition;
  electionOptionPositionMap?: ElectionOptionPositionMap;
  options: CVRContestRequiredBallotPageOptions;
}): CVR.CVRContest[] {
  const cvrContests: CVR.CVRContest[] = [];

  const contests = Object.keys(votes).map((contestId) =>
    getContestById(electionDefinition, contestId)
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
          })
        );
        break;
      case 'candidate':
        cvrContests.push(
          buildCVRCandidateContest({
            contest,
            contestOptionPositionMap: electionOptionPositionMap
              ? electionOptionPositionMap[contest.id]
              : undefined,
            vote: contestVote as CandidateVote,
            unmarkedWriteIns: contestUnmarkedWriteIns,
            options,
          })
        );
        break;
      // istanbul ignore next
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
  election,
  electionOptionPositionMap,
  ballotType,
}: {
  castVoteRecordId: string;
  marks: BallotMark[];
  definiteMarkThreshold: number;
  election: Election;
  electionOptionPositionMap?: ElectionOptionPositionMap;
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
          OptionPosition: electionOptionPositionMap
            ? assertDefined(electionOptionPositionMap[mark.contestId])[
                mark.optionId
              ]
            : getOptionPosition({
                optionId: mark.optionId,
                contest: find(
                  election.contests,
                  (contest) => contest.id === mark.contestId
                ),
              }),
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
  electionOptionPositionMap?: ElectionOptionPositionMap;
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
      definiteMarkThreshold: number;
      includeOriginalSnapshots?: boolean;
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
  electionOptionPositionMap,
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
            options: {
              ballotMarkingMode: 'machine',
            },
            electionOptionPositionMap,
          }),
        },
      ],
      BallotImage: images?.map(buildCvrImageData),
    };
  }

  const {
    interpretations,
    images,
    definiteMarkThreshold,
    includeOriginalSnapshots,
  } = rest;

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
    '@id': `${castVoteRecordId}-modified`,
    Type: CVR.CVRType.Modified,
    ...buildCVRSnapshotBallotTypeMetadata(ballotMetadata.ballotType),
    CVRContest: [
      ...buildCVRContestsFromVotes({
        votes: interpretations[0].votes,
        unmarkedWriteIns: interpretations[0].unmarkedWriteIns,
        electionDefinition,
        options: {
          ballotMarkingMode: 'hand',
          image: images?.[0],
        },
        electionOptionPositionMap,
      }),
      ...buildCVRContestsFromVotes({
        votes: interpretations[1].votes,
        unmarkedWriteIns: interpretations[1].unmarkedWriteIns,
        electionDefinition,
        options: {
          ballotMarkingMode: 'hand',
          image: images?.[1],
        },
        electionOptionPositionMap,
      }),
    ],
  };

  // CVR for hand-marked paper ballots, has both "original" snapshot with
  // scores for all marks and "modified" snapshot with contest rules applied.
  return {
    ...cvrMetadata,
    BallotSheetId: sheetNumber, // VVSG 2.0 1.1.5-G.5
    CurrentSnapshotId: `${castVoteRecordId}-modified`,
    CVRSnapshot: includeOriginalSnapshots
      ? [
          modifiedSnapshot,
          buildOriginalSnapshot({
            castVoteRecordId,
            marks: [
              ...interpretations[0].markInfo.marks,
              ...interpretations[1].markInfo.marks,
            ],
            definiteMarkThreshold,
            election,
            electionOptionPositionMap,
            ballotType: ballotMetadata.ballotType,
          }),
        ]
      : [modifiedSnapshot],
    BallotImage: images?.map(buildCvrImageData),
  };
}
