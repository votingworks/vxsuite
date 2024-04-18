import { v4 as uuid } from 'uuid';
import {
  buildCVRContestsFromVotes,
  buildCvrImageData,
  combineImageAndLayoutHashes,
} from '@votingworks/backend';
import { assertDefined, iter, throwIllegalValue } from '@votingworks/basics';
import {
  BallotMetadata,
  BallotPageContestLayout,
  BallotPageContestOptionLayout,
  BallotPageLayout,
  ballotPaperDimensions,
  BallotType,
  Candidate,
  CandidateContest,
  CandidateVote,
  ContestId,
  CVR,
  Election,
  ElectionDefinition,
  getContests,
  mapSheet,
  Size,
  Vote,
  VotesDict,
} from '@votingworks/types';
import {
  allContestOptions,
  buildCVRSnapshotBallotTypeMetadata,
  hasWriteIns,
} from '@votingworks/utils';
import {
  arrangeContestsBySheet,
  filterVotesByContests,
  generateBallotAssetPath,
  generateCombinations,
  getBatchIdForScannerId,
  splitContestsByPage,
} from './utils';

/**
 * Generates all possible contest choice options for a given CandidateContest
 * @param contest CandidateContest to generate contest choices for
 * @returns Array of possible contest choice selections. Each contest choice selection is an array of candidates to vote for.
 */
function getCandidateOptionsForContest(
  contest: CandidateContest
): CandidateVote[] {
  const candidateVotes: CandidateVote[] = [];
  const numSeats = contest.seats;
  const { candidates } = contest;

  // Generate a result for all possible number of undervotes
  for (let i = 0; i < numSeats && i < candidates.length; i += 1) {
    candidateVotes.push(candidates.slice(0, i));
  }

  // Generate a result for all possible number of overvotes
  for (let i = numSeats + 1; i <= candidates.length; i += 1) {
    candidateVotes.push(candidates.slice(0, i));
  }

  // Add a write-in vote if applicable
  if (contest.allowWriteIns) {
    const combinations = generateCombinations(candidates, numSeats - 1);
    const writeInCandidate: Candidate = {
      id: `write-in-${Math.floor(Math.random() * numSeats)}`,
      name: 'Mock Write-In',
      isWriteIn: true,
    };
    for (const combo of combinations) {
      combo.push(writeInCandidate);
      candidateVotes.push(combo);
    }
    if (numSeats === 1) {
      candidateVotes.push([writeInCandidate]);
    }
  }

  // Generate all possible valid votes
  for (const option of generateCombinations(candidates, numSeats)) {
    candidateVotes.push(option);
  }

  return candidateVotes;
}

/**
 * Generates all possible vote configurations across a ballot given a list of contests and possible contest choice options for those contests.
 * @param optionsForContest Dictionary of contests to the possible contest choice options for that contest.
 * @returns Array of dictionaries where each dictionary represents the votes across all contests provided from each contest ID to the votes to mark on that contest.
 */
function getVoteConfigurations(
  optionsForEachContest: ReadonlyMap<ContestId, readonly Vote[]>
): VotesDict[] {
  // Find the contest with the most vote combinations generated to determine the number of vote combinations to generate.
  const numOptionsToProduce =
    iter(optionsForEachContest.values())
      .map((options) => options.length)
      .max() ?? 0;
  const voteOptions: VotesDict[] = [];
  for (let i = 0; i < numOptionsToProduce; i += 1) {
    const voteOption: VotesDict = {};
    for (const [contestId, optionsForContest] of optionsForEachContest) {
      // Add the ith contest choice option as the vote for each contest
      // If i is greater than the number of votes generated for this contest, vote for the final generated vote again.
      voteOption[contestId] =
        optionsForContest[Math.min(i, optionsForContest.length - 1)];
    }
    voteOptions.push(voteOption);
  }
  return voteOptions;
}

interface GenerateCvrsParams {
  testMode: boolean;
  scannerIds: readonly string[];
  electionDefinition: ElectionDefinition;
  ballotIdPrefix?: string;
}

/**
 * Generate a mock page layout for a ballot.
 */
export function generateBallotPageLayouts(
  election: Election,
  metadata: BallotMetadata
): readonly BallotPageLayout[] {
  if (!election.gridLayouts) {
    return [];
  }

  const gridLayout = election.gridLayouts.find(
    (layout) => layout.ballotStyleId === metadata.ballotStyleId
  );

  if (!gridLayout) {
    throw new Error(
      `no grid layout found for ballot style ${metadata.ballotStyleId}`
    );
  }

  const { paperSize } = election.ballotLayout;
  const { width, height } = ballotPaperDimensions(paperSize);
  const PPI = 200;
  const pageSize: Size = {
    width: PPI * width,
    height: PPI * height,
  };
  return mapSheet([1, 2], (pageNumber, side) => ({
    pageSize,
    metadata: {
      ...metadata,
      pageNumber,
    },
    contests: election.contests
      .filter((contest) =>
        gridLayout.gridPositions.some(
          (position) =>
            position.side === side && position.contestId === contest.id
        )
      )
      .map(
        (contest): BallotPageContestLayout => ({
          contestId: contest.id,
          bounds: { x: 0, y: 0, width: 100, height: 100 },
          corners: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 0, y: 100 },
            { x: 100, y: 100 },
          ],
          options: iter(allContestOptions(contest))
            .map(
              (option): BallotPageContestOptionLayout => ({
                bounds: { x: 0, y: 0, width: 10, height: 10 },
                target: {
                  bounds: { x: 0, y: 0, width: 10, height: 10 },
                  inner: { x: 0, y: 0, width: 10, height: 10 },
                },
                definition: option,
              })
            )
            .toArray(),
        })
      ),
  }));
}

/**
 * Generates a base set of CVRs for a given election that obtains maximum coverage of all the ballot metadata (precincts, scanners, etc.) and all possible votes on each contest.
 * @param options.electionPackage Election package containing the election data to generate CVRs for
 * @param options.scannerIds Scanners to include in the output CVRs
 * @param options.testMode Generate CVRs for test ballots or live ballots
 * @returns Array of generated {@link CVR.CVR}
 */
export function* generateCvrs({
  testMode,
  scannerIds,
  electionDefinition,
  ballotIdPrefix,
}: GenerateCvrsParams): Iterable<CVR.CVR> {
  const { election } = electionDefinition;
  const { ballotStyles } = election;

  // Currently we can generate only BMD ballots for non-gridLayouts elections.
  // For gridLayouts elections we can generate BMD ballots although it would
  // not be realistic since they cannot currently be scanned.
  const bmdBallots = Boolean(!election.gridLayouts);

  for (const ballotStyle of ballotStyles) {
    const { precincts: precinctIds, id: ballotStyleId, partyId } = ballotStyle;
    // For each contest, determine all possible contest choices
    const contests = getContests({
      ballotStyle,
      election,
    });
    for (const ballotType of [BallotType.Absentee, BallotType.Precinct]) {
      for (const precinctId of precinctIds) {
        const ballotPageLayouts = bmdBallots
          ? []
          : generateBallotPageLayouts(election, {
              ballotStyleId,
              precinctId,
              electionHash: electionDefinition.electionHash,
              ballotType,
              isTestMode: testMode,
            });
        if (ballotPageLayouts.length > 2) {
          throw new Error('only single-sheet ballots are supported');
        }
        for (const scannerId of scannerIds) {
          const batchId = getBatchIdForScannerId(scannerId);

          const optionsForEachContest = new Map<string, readonly Vote[]>();
          for (const contest of contests) {
            switch (contest.type) {
              case 'candidate':
                optionsForEachContest.set(
                  contest.id,
                  getCandidateOptionsForContest(contest)
                );
                break;
              case 'yesno':
                optionsForEachContest.set(contest.id, [
                  [contest.yesOption.id],
                  [contest.noOption.id],
                  [contest.yesOption.id, contest.noOption.id],
                  [],
                ]);
                break;
              // istanbul ignore next
              default:
                throwIllegalValue(contest);
            }
          }

          // Generate as many vote combinations as necessary that contain all contest choice options
          const voteConfigurations = getVoteConfigurations(
            optionsForEachContest
          );

          // Add the generated vote combinations as CVRs
          for (const votes of voteConfigurations) {
            const castVoteRecordId = uuid();
            if (bmdBallots) {
              yield {
                '@type': 'CVR.CVR',
                BallotStyleId: ballotStyleId,
                BallotStyleUnitId: precinctId,
                PartyIds: partyId ? [partyId] : undefined,
                CreatingDeviceId: scannerId,
                ElectionId: electionDefinition.electionHash,
                BatchId: batchId,
                CurrentSnapshotId: `${castVoteRecordId}-modified`,
                UniqueId: ballotIdPrefix
                  ? `${ballotIdPrefix}-${castVoteRecordId.toString()}`
                  : castVoteRecordId.toString(),
                CVRSnapshot: [
                  {
                    '@type': 'CVR.CVRSnapshot',
                    '@id': `${castVoteRecordId}-modified`,
                    ...buildCVRSnapshotBallotTypeMetadata(ballotType),
                    Type: CVR.CVRType.Modified,
                    CVRContest: buildCVRContestsFromVotes({
                      electionDefinition,
                      votes,
                      options: {
                        ballotMarkingMode: 'machine',
                      },
                    }),
                  },
                ],
              };
            } else {
              // Since this is HMPB, we generate a CVR for each sheet (not fully supported yet)
              const contestsBySheet = arrangeContestsBySheet(
                splitContestsByPage({
                  allVotes: votes,
                  ballotPageLayouts,
                  election,
                })
              );

              for (const [
                sheetIndex,
                sheetContests,
              ] of contestsBySheet.enumerate()) {
                const [frontContests, backContests] = sheetContests;
                const frontVotes = filterVotesByContests(votes, frontContests);
                const backVotes = filterVotesByContests(votes, backContests);
                const frontHasWriteIns = hasWriteIns(frontVotes);
                const backHasWriteIns = hasWriteIns(backVotes);
                const sheetHasWriteIns = frontHasWriteIns || backHasWriteIns;

                const frontImageRelativePath = generateBallotAssetPath({
                  castVoteRecordId: castVoteRecordId.toString(),
                  assetType: 'image',
                  frontOrBack: 'front',
                });
                const backImageRelativePath = generateBallotAssetPath({
                  castVoteRecordId: castVoteRecordId.toString(),
                  assetType: 'image',
                  frontOrBack: 'back',
                });

                yield {
                  '@type': 'CVR.CVR',
                  BallotStyleId: ballotStyleId,
                  BallotStyleUnitId: precinctId,
                  PartyIds: partyId ? [partyId] : undefined,
                  CreatingDeviceId: scannerId,
                  ElectionId: electionDefinition.electionHash,
                  BatchId: batchId,
                  CurrentSnapshotId: `${castVoteRecordId}-modified`,
                  UniqueId: ballotIdPrefix
                    ? `${ballotIdPrefix}-${castVoteRecordId.toString()}`
                    : castVoteRecordId.toString(),
                  BallotSheetId: (sheetIndex + 1).toString(),
                  CVRSnapshot: [
                    {
                      '@type': 'CVR.CVRSnapshot',
                      '@id': `${castVoteRecordId}-modified`,
                      Type: CVR.CVRType.Modified,
                      ...buildCVRSnapshotBallotTypeMetadata(ballotType),
                      CVRContest: [
                        ...buildCVRContestsFromVotes({
                          electionDefinition,
                          votes: frontVotes,
                          options: {
                            ballotMarkingMode: 'hand',
                            image: sheetHasWriteIns
                              ? {
                                  imageHash: '',
                                  imageRelativePath: frontImageRelativePath,
                                  layoutFileHash: '',
                                }
                              : undefined,
                          },
                        }),
                        ...buildCVRContestsFromVotes({
                          electionDefinition,
                          votes: backVotes,
                          options: {
                            ballotMarkingMode: 'hand',
                            image: sheetHasWriteIns
                              ? {
                                  imageHash: '',
                                  imageRelativePath: backImageRelativePath,
                                  layoutFileHash: '',
                                }
                              : undefined,
                          },
                        }),
                      ],
                    },
                  ],
                  BallotImage: sheetHasWriteIns
                    ? [
                        buildCvrImageData({
                          imageHash: '',
                          imageRelativePath: frontImageRelativePath,
                          layoutFileHash: '',
                        }),
                        buildCvrImageData({
                          imageHash: '',
                          imageRelativePath: backImageRelativePath,
                          layoutFileHash: '',
                        }),
                      ]
                    : undefined,
                };
              }
            }
          }
        }
      }
    }
  }
}

/**
 * Retroactively populates the hashes on a cast vote record image data object
 */
export function populateImageAndLayoutFileHashes(
  ballotImage: CVR.ImageData,
  hashes: { imageHash: string; layoutFileHash: string }
): void {
  const { imageHash, layoutFileHash } = hashes;

  // Cast readonly values as mutable values so that we can override them
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  (assertDefined(ballotImage.Hash).Value as string) =
    combineImageAndLayoutHashes(imageHash, layoutFileHash);
}
