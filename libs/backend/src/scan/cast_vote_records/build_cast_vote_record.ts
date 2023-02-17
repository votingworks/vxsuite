/* eslint-disable vx/gts-identifiers */

import { assert, find, groupBy, throwIllegalValue } from '@votingworks/basics';
import {
  AnyContest,
  BallotId,
  BallotMark,
  BallotType,
  CandidateContest,
  CandidateVote,
  CastVoteRecordBallotType,
  Contests,
  CVR,
  Election,
  getBallotStyle,
  getContests,
  InlineBallotImage,
  InterpretedBmdPage,
  InterpretedHmpbPage,
  mapSheet,
  safeParseInt,
  SheetOf,
  VotesDict,
  YesNoContest,
  YesNoVote,
} from '@votingworks/types';

import {
  BallotPageLayoutsLookup,
  getBallotPageLayout,
  getContestsForBallotPage,
} from './page_layouts';

/**
 * Converts from the ballot type enumeration to a test representation used
 * in cast vote records.
 */
export function getCVRBallotType(
  ballotType: BallotType
): CastVoteRecordBallotType {
  switch (ballotType) {
    case BallotType.Absentee:
      return 'absentee';
    case BallotType.Provisional:
      return 'provisional';
    case BallotType.Standard:
      return 'standard';
    // istanbul ignore next
    default:
      throwIllegalValue(ballotType);
  }
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
    Overvotes: overvoted ? 1 : undefined,
    Undervotes: undervoted ? 1 : undefined,
    Status: overvoted
      ? [CVR.ContestStatus.Overvoted, CVR.ContestStatus.InvalidatedRules]
      : undervoted
      ? [CVR.ContestStatus.Undervoted, CVR.ContestStatus.NotIndicated]
      : undefined,
    Selections: 1,
    CVRContestSelection: vote.map((option) => ({
      '@type': 'CVR.CVRContestSelection',
      ContestSelectionId: option,
      OptionPosition: option === 'yes' ? 0 : 1,
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
      case 'yes':
        return 0;
      case 'no':
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
    }
  | {
      ballotMarkingMode: 'hand';
      // TODO: make this required when we separate image files from the CVR
      imageFileUri?: string;
    };

function buildCVRCandidateContest({
  contest,
  vote,
  options,
}: {
  contest: CandidateContest;
  vote: CandidateVote;
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

  const writeInCount = vote.reduce(
    (count, choice) => count + (choice.isWriteIn ? 1 : 0),
    0
  );

  // We track the write in counter in order to give the BMD write-ins an
  // increasing index. For HMPB write-ins, we use the index in the write-in id
  let writeInCounter = 0;

  return {
    '@type': 'CVR.CVRContest',
    ContestId: contest.id,
    Overvotes: overvoted ? vote.length - contest.seats : undefined, // VVSG 2.0 1.1.5-E.2
    Undervotes: undervoted ? contest.seats - vote.length : undefined, // VVSG 2.0 1.1.5-E.2
    WriteIns: writeInCount > 0 ? writeInCount : undefined, // VVSG 2.0 1.1.5-E.3
    Status: statuses.length > 0 ? statuses : undefined,
    Selections: contest.seats,
    CVRContestSelection: vote.map((candidate) => {
      const { isWriteIn } = candidate;
      const isMachineWriteIn =
        isWriteIn && options.ballotMarkingMode === 'machine';
      const ContestSelectionId = isMachineWriteIn
        ? `write-in-${writeInCounter}`
        : candidate.id;
      const OptionPosition = isMachineWriteIn
        ? contest.candidates.length + writeInCounter
        : getOptionPosition({ contest, optionId: candidate.id });
      if (isWriteIn) writeInCounter += 1;

      return {
        '@type': 'CVR.CVRContestSelection',
        ContestSelectionId,
        OptionPosition,
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
                  Text:
                    options.ballotMarkingMode === 'machine'
                      ? candidate.name
                      : undefined,
                  WriteInImage:
                    options.ballotMarkingMode === 'hand'
                      ? {
                          '@type': 'CVR.ImageData',
                          Location: options.imageFileUri,
                        }
                      : undefined,
                }
              : undefined,
          },
        ],
      };
    }),
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
  contests,
  options,
}: {
  votes: VotesDict;
  contests: Contests;
  options: CVRContestRequiredBallotPageOptions;
}): CVR.CVRContest[] {
  const cvrContests: CVR.CVRContest[] = [];

  for (const contest of contests) {
    // If there is no element in the `votes` object, there are no votes. We
    // must include information about this contest as an undervoted contest
    // per VVSG 2.0 1.1.5-E.2
    const vote = votes[contest.id] || [];
    switch (contest.type) {
      case 'yesno':
        cvrContests.push(
          buildCVRBallotMeasureContest({
            contest,
            vote: vote as YesNoVote,
          })
        );
        break;
      case 'candidate':
        cvrContests.push(
          buildCVRCandidateContest({
            contest,
            vote: vote as CandidateVote,
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
}: {
  castVoteRecordId: string;
  marks: BallotMark[];
  definiteMarkThreshold: number;
  election: Election;
}): CVR.CVRSnapshot {
  const marksByContest = groupBy(marks, (mark) => mark.contestId);

  return {
    '@id': `${castVoteRecordId}-original`,
    '@type': 'CVR.CVRSnapshot',
    Type: CVR.CVRType.Original,
    CVRContest: [...marksByContest.entries()].map(
      ([contestId, contestMarks]) => ({
        '@type': 'CVR.CVRContest',
        ContestId: contestId,
        CVRContestSelection: [...contestMarks].map((mark) => ({
          '@type': 'CVR.CVRContestSelection',
          ContestSelectionId: mark.optionId,
          OptionPosition: getOptionPosition({
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
                mark.score >= definiteMarkThreshold
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
 * Determines whether a {@link VotesDict} contains any write-in candidates
 */
export function hasWriteIns(votes: VotesDict): boolean {
  for (const vote of Object.values(votes)) {
    if (vote) {
      for (const voteOption of vote) {
        if (
          voteOption !== 'yes' &&
          voteOption !== 'no' &&
          voteOption.isWriteIn
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Required parameters for building a cast vote record in CDF format ({@link CVR.CVR}).
 */
type BuildCastVoteRecordParams = {
  election: Election;
  electionId: string;
  scannerId: string;
  castVoteRecordId: BallotId;
  batchId: string;
} & (
  | {
      ballotMarkingMode: 'machine';
      interpretation: InterpretedBmdPage;
    }
  | {
      ballotMarkingMode: 'hand';
      definiteMarkThreshold: number;
      pages: SheetOf<{
        interpretation: InterpretedHmpbPage;
        // TODO: Remove inlineBallotImage option, only use imageFileUri
        inlineBallotImage?: InlineBallotImage;
        imageFileUri?: string;
      }>;
      ballotPageLayoutsLookup: BallotPageLayoutsLookup;
    }
);

/**
 * Builds a cast vote record in CDF format ({@link CVR.CVR}).
 */
export function buildCastVoteRecord({
  election,
  electionId,
  scannerId,
  castVoteRecordId,
  batchId,
  ...rest
}: BuildCastVoteRecordParams): CVR.CVR {
  const ballotMetadata =
    rest.ballotMarkingMode === 'machine'
      ? rest.interpretation.metadata
      : rest.pages[0].interpretation.metadata;

  const ballotParty = getBallotStyle({
    ballotStyleId: ballotMetadata.ballotStyleId,
    election,
  })?.partyId;

  const cvrMetadata = {
    '@type': 'CVR.CVR',
    BallotStyleId: ballotMetadata.ballotStyleId,
    BallotStyleUnitId: ballotMetadata.precinctId, // VVSG 2.0 1.1.5-G.3
    PartyIds: ballotParty ? [ballotParty] : undefined, // VVSG 2.0 1.1.5-E.4
    CreatingDeviceId: scannerId,
    ElectionId: electionId,
    BatchId: batchId, // VVSG 2.0 1.1.5-G.6
    UniqueId: castVoteRecordId,
    vxBallotType: getCVRBallotType(ballotMetadata.ballotType),
  } as const;

  // CVR for machine-marked ballot, only has "original" snapshot because the
  // restrictions of the ballot marking device already applied basic contest rules.
  if (rest.ballotMarkingMode === 'machine') {
    const { interpretation } = rest;

    const ballotStyle = getBallotStyle({
      ballotStyleId: ballotMetadata.ballotStyleId,
      election,
    });
    assert(ballotStyle);
    const contests = getContests({ election, ballotStyle });

    return {
      ...cvrMetadata,
      CurrentSnapshotId: `${castVoteRecordId}-original`,
      CVRSnapshot: [
        {
          '@type': 'CVR.CVRSnapshot',
          '@id': `${castVoteRecordId}-original`,
          Type: CVR.CVRType.Original,
          CVRContest: buildCVRContestsFromVotes({
            contests,
            votes: interpretation.votes,
            options: {
              ballotMarkingMode: 'machine',
            },
          }),
        },
      ],
    };
  }

  const { pages, ballotPageLayoutsLookup, definiteMarkThreshold } = rest;

  // The larger page number should be an even number which, divided by two,
  // yields the sheet number
  const sheetNumber = (
    Math.max(
      pages[0].interpretation.metadata.pageNumber,
      pages[1].interpretation.metadata.pageNumber
    ) / 2
  ).toString();

  const hasInlineBallotImages =
    pages[0].inlineBallotImage || pages[1].inlineBallotImage;

  const hasImageFileUris = pages[0].imageFileUri || pages[1].imageFileUri;

  // CVR for hand-marked paper ballots, has both "original" snapshot with
  // scores for all marks and "modified" snapshot with contest rules applied.
  return {
    ...cvrMetadata,
    BallotSheetId: sheetNumber, // VVSG 2.0 1.1.5-G.5
    CurrentSnapshotId: `${castVoteRecordId}-modified`,
    CVRSnapshot: [
      {
        '@type': 'CVR.CVRSnapshot',
        '@id': `${castVoteRecordId}-modified`,
        Type: CVR.CVRType.Modified,
        CVRContest: [
          ...buildCVRContestsFromVotes({
            contests: getContestsForBallotPage({
              ballotPageMetadata: pages[0].interpretation.metadata,
              ballotPageLayoutsLookup,
              election,
            }),
            votes: pages[0].interpretation.votes,
            options: {
              ballotMarkingMode: 'hand',
              imageFileUri: pages[0].imageFileUri,
            },
          }),
          ...buildCVRContestsFromVotes({
            contests: getContestsForBallotPage({
              ballotPageMetadata: pages[1].interpretation.metadata,
              ballotPageLayoutsLookup,
              election,
            }),
            votes: pages[1].interpretation.votes,
            options: {
              ballotMarkingMode: 'hand',
              imageFileUri: pages[1].imageFileUri,
            },
          }),
        ],
      },
      buildOriginalSnapshot({
        castVoteRecordId,
        marks: [
          ...pages[0].interpretation.markInfo.marks,
          ...pages[1].interpretation.markInfo.marks,
        ],
        definiteMarkThreshold,
        election,
      }),
    ],
    BallotImage:
      hasInlineBallotImages || hasImageFileUris
        ? pages.map((page) =>
            page.inlineBallotImage
              ? {
                  '@type': 'CVR.ImageData',
                  Image: {
                    '@type': 'CVR.Image',
                    Data: page.inlineBallotImage.normalized,
                  },
                }
              : page.imageFileUri
              ? {
                  '@type': 'CVR.ImageData',
                  Location: page.imageFileUri,
                }
              : {
                  // empty object to represent a page with no image
                  '@type': 'CVR.ImageData',
                }
          )
        : undefined,
    vxLayouts: hasInlineBallotImages
      ? mapSheet(pages, (page) =>
          page.inlineBallotImage
            ? getBallotPageLayout({
                ballotPageMetadata: page.interpretation.metadata,
                ballotPageLayoutsLookup,
                election,
              })
            : null
        )
      : undefined,
  };
}
