import { assert, find, iter, throwIllegalValue } from '@votingworks/basics';
import {
  AnyContest,
  BallotId,
  BallotMark,
  BallotType,
  Candidate,
  CandidateContest,
  CandidateVote,
  Contests,
  CVR,
  Election,
  getBallotStyle,
  getContests,
  InterpretedBmdPage,
  InterpretedHmpbPage,
  MarkStatus,
  safeParseInt,
  SheetOf,
  VotesDict,
  YesNoContest,
  YesNoVote,
} from '@votingworks/types';
import { getMarkStatus } from '@votingworks/utils';

import { getContestsForBallotPage } from './page_layouts';

/**
 * Converts from the ballot type enumeration to a test representation used
 * in cast vote records.
 */
export function toCdfBallotType(ballotType: BallotType): CVR.vxBallotType {
  switch (ballotType) {
    case BallotType.Absentee:
      return CVR.vxBallotType.Absentee;
    case BallotType.Provisional:
      return CVR.vxBallotType.Provisional;
    case BallotType.Standard:
      return CVR.vxBallotType.Precinct;
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
    Overvotes: vote.length > 1 ? 1 : 0,
    Undervotes: Math.max(1 - vote.length, 0),
    Status: overvoted
      ? [CVR.ContestStatus.Overvoted, CVR.ContestStatus.InvalidatedRules]
      : undervoted
      ? [CVR.ContestStatus.Undervoted, CVR.ContestStatus.NotIndicated]
      : undefined,
    CVRContestSelection: vote.map((option) => ({
      '@type': 'CVR.CVRContestSelection',
      ContestSelectionId: option,
      // include position on the ballot per VVSG 2.0 1.1.5-C.2
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

  const numWriteIns = vote.reduce(
    (count, choice) => count + (choice.isWriteIn ? 1 : 0),
    0
  );

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

  return {
    '@type': 'CVR.CVRContest',
    ContestId: contest.id,
    Overvotes: vote.length > contest.seats ? contest.seats : 0, // VVSG 2.0 1.1.5-E.2
    Undervotes: Math.max(contest.seats - vote.length, 0), // VVSG 2.0 1.1.5-E.2
    WriteIns: numWriteIns, // VVSG 2.0 1.1.5-E.3
    Status: statuses.length > 0 ? statuses : undefined,
    CVRContestSelection: voteWriteInIndexed.map((candidate) => {
      const { isWriteIn } = candidate;

      return {
        '@type': 'CVR.CVRContestSelection',
        ContestSelectionId: candidate.id,
        // include position on the ballot per VVSG 2.0 1.1.5-C.2
        OptionPosition: getOptionPosition({ contest, optionId: candidate.id }),
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
                    options.ballotMarkingMode === 'hand' && options.imageFileUri
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
  const marksByContest = iter(marks).toMap((mark) => mark.contestId);

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
          // include position on the ballot per VVSG 2.0 1.1.5-C.2
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
 * Determines the number of write-in candidates in a {@link VotesDict}
 */
export function getWriteInCount(votes: VotesDict): number {
  let count = 0;
  for (const vote of Object.values(votes)) {
    if (vote) {
      for (const voteOption of vote) {
        if (
          voteOption !== 'yes' &&
          voteOption !== 'no' &&
          voteOption.isWriteIn
        ) {
          count += 1;
        }
      }
    }
  }

  return count;
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
  indexInBatch?: number;
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
        imageFileUri?: string;
      }>;
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
  indexInBatch,
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
    BatchSequenceId: indexInBatch, // VVSG 2.0 1.1.5-G.7
    UniqueId: castVoteRecordId,
    vxBallotType: toCdfBallotType(ballotMetadata.ballotType),
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
    const writeInCount = getWriteInCount(interpretation.votes);

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
          vxWriteIns: writeInCount,
        },
      ],
    };
  }

  const { pages, definiteMarkThreshold } = rest;

  // The larger page number should be an even number which, divided by two,
  // yields the sheet number
  const sheetNumber = (
    Math.max(
      pages[0].interpretation.metadata.pageNumber,
      pages[1].interpretation.metadata.pageNumber
    ) / 2
  ).toString();

  const hasImageFileUris = pages[0].imageFileUri || pages[1].imageFileUri;
  const writeInCount =
    getWriteInCount(pages[0].interpretation.votes) +
    getWriteInCount(pages[1].interpretation.votes);

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
              election,
            }),
            votes: pages[1].interpretation.votes,
            options: {
              ballotMarkingMode: 'hand',
              imageFileUri: pages[1].imageFileUri,
            },
          }),
        ],
        vxWriteIns: writeInCount,
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
    BallotImage: hasImageFileUris
      ? pages.map((page) =>
          page.imageFileUri
            ? {
                '@type': 'CVR.ImageData',
                Location: page.imageFileUri,
              }
            : {
                // empty object to represent a page with no included image
                '@type': 'CVR.ImageData',
              }
        )
      : undefined,
  };
}
