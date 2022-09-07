import { pdfToImages, toDataUrl } from '@votingworks/image-utils';
import {
  BallotIdSchema,
  Candidate,
  CandidateContest,
  CastVoteRecord,
  ContestId,
  ContestOptionId,
  InlineBallotImage,
  unsafeParse,
  YesNoVote,
} from '@votingworks/types';
import {
  assert,
  BallotPackage,
  BallotPackageEntry,
  mapAsync,
  takeAsync,
  throwIllegalValue,
} from '@votingworks/utils';
import { castVoteRecordHasWriteIns, generateCombinations } from './utils';

// All valid contest choice options for a yes no contest
const YES_NO_OPTIONS: YesNoVote[] = [['yes'], ['no'], ['yes', 'no'], []];

/**
 * Generates all possible contest choice options for a given CandidateContest
 * @param contest CandidateContest to generate contest choices for
 * @returns Array of possible contest choice selections. Each contest choice selection is an array of candidates to vote for.
 */
function getCandidateOptionsForContest(
  contest: CandidateContest
): Array<string[]> {
  const candidateOptions: Array<string[]> = [];
  const numSeats = contest.seats;
  const candidateIds = contest.candidates.map((c: Candidate) => c.id);

  // Generate a result for all possible number of undervotes
  for (let i = 0; i < numSeats && i < candidateIds.length; i += 1) {
    candidateOptions.push(candidateIds.slice(0, i));
  }

  // Generate a result for all possible number of overvotes
  for (let i = numSeats + 1; i <= candidateIds.length; i += 1) {
    candidateOptions.push(candidateIds.slice(0, i));
  }

  // Add a write-in vote if applicable
  if (contest.allowWriteIns) {
    const combinations = generateCombinations(candidateIds, numSeats - 1);
    for (const combo of combinations) {
      combo.push('write-in-0');
      candidateOptions.push(combo);
    }
    if (numSeats === 1) {
      candidateOptions.push(['write-in-0']);
    }
  }

  // Generate all possible valid votes
  for (const option of generateCombinations(candidateIds, numSeats)) {
    candidateOptions.push(option);
  }

  return candidateOptions;
}

/**
 * Generates all possible vote configurations across a ballot given a list of contests and possible contest choice options for those contests.
 * @param candidateOptionsForContest Dictionary of contests to the possible contest choice options for that contest.
 * @returns Array of dictionaries where each dictionary represents the votes across all contests provided from each contest ID to the votes to mark on that contest.
 */
function getVoteConfigurationsForCandidateOptions(
  candidateOptionsForContest: ReadonlyMap<
    ContestId,
    ReadonlyArray<readonly ContestOptionId[]>
  >
): Array<Map<ContestId, readonly ContestOptionId[]>> {
  // Find the contest with the most vote combinations generated to determine the number of vote combinations to generate.
  const numOptionsToProduce = [...candidateOptionsForContest.values()].reduce(
    (prev, options) => Math.max(prev, options.length),
    0
  );
  const voteOptions: Array<Map<ContestId, readonly ContestOptionId[]>> = [];
  for (let i = 0; i < numOptionsToProduce; i += 1) {
    const voteOption = new Map<ContestId, readonly ContestOptionId[]>();
    for (const [contestId, optionsForContest] of candidateOptionsForContest) {
      // Add the ith contest choice option as the vote for each contest
      // If i is greater then the number of votes generated for this contest, vote for the final generated vote again.
      voteOption.set(
        contestId,
        optionsForContest[
          Math.min(i, optionsForContest.length - 1)
        ] as readonly ContestOptionId[]
      );
    }
    voteOptions.push(voteOption);
  }
  return voteOptions;
}

/**
 * Options for when to include ballot images in generated CVRs.
 */
export type IncludeBallotImagesOption = 'always' | 'never' | 'write-ins';

/**
 * Generates a base set of CVRs for a given election that obtains maximum coverage of all the ballot metadata (precincts, scanners, etc.) and all possible votes on each contest.
 * @param options.ballotPackage Ballot package containing the election data to generate CVRs for
 * @param options.scannerNames Scanners to include in the output CVRs
 * @param options.testMode Generate CVRs for test ballots or live ballots
 * @returns Array of generated CastVoteRecords
 */
export async function* generateCvrs({
  ballotPackage,
  scannerNames,
  testMode,
  includeBallotImages = 'never',
}: {
  ballotPackage: BallotPackage;
  scannerNames: readonly string[];
  testMode: boolean;
  includeBallotImages?: IncludeBallotImagesOption;
}): AsyncGenerator<CastVoteRecord> {
  if (ballotPackage.ballots.some((b) => b.layout.length !== 2)) {
    throw new Error(`only single-sheet ballots are supported`);
  }

  const { electionDefinition } = ballotPackage;
  const { ballotStyles, contests } = electionDefinition.election;
  const ballotImageCache = new Map<
    BallotPackageEntry,
    [InlineBallotImage, InlineBallotImage]
  >();
  let ballotId = 0;
  for (const ballotStyle of ballotStyles) {
    const { precincts, districts } = ballotStyle;
    for (const ballotType of ['absentee', 'provisional', 'standard'] as const) {
      for (const precinct of precincts) {
        for (const scanner of scannerNames) {
          // Define base information for all resulting CVRs with this precinct, ballot style and scanner.
          const baseRecord = {
            _precinctId: precinct,
            _ballotStyleId: ballotStyle.id,
            _testBallot: testMode,
            _scannerId: scanner,
            _batchId: 'batch-1',
            _batchLabel: 'Batch 1',
            _pageNumbers: [1, 2],
          } as const;

          // For each contest determine all possible contest choices.
          const candidateOptionsForContest = new Map<
            string,
            ReadonlyArray<readonly string[]>
          >();
          for (const contest of contests) {
            if (
              districts.includes(contest.districtId) &&
              (ballotStyle.partyId === undefined ||
                contest.partyId === ballotStyle.partyId)
            ) {
              // Generate an array of all possible contest choice responses for this contest
              switch (contest.type) {
                case 'candidate':
                  candidateOptionsForContest.set(
                    contest.id,
                    getCandidateOptionsForContest(contest)
                  );
                  break;
                case 'yesno':
                  candidateOptionsForContest.set(contest.id, YES_NO_OPTIONS);
                  break;
                case 'ms-either-neither':
                  candidateOptionsForContest.set(
                    contest.eitherNeitherContestId,
                    YES_NO_OPTIONS
                  );
                  candidateOptionsForContest.set(
                    contest.pickOneContestId,
                    YES_NO_OPTIONS
                  );
                  break;
                // istanbul ignore next
                default:
                  throwIllegalValue(contest);
              }
            }
          }
          // Generate as many vote combinations as necessary that contain all contest choice options
          const voteConfigurations = getVoteConfigurationsForCandidateOptions(
            candidateOptionsForContest
          );
          // Add the generated vote combinations as CVRs
          for (const voteConfig of voteConfigurations) {
            const cvr: CastVoteRecord = {
              _ballotId: unsafeParse(BallotIdSchema, `id-${ballotId}`),
              _ballotType: ballotType,
              ...baseRecord,
              ...[...voteConfig.entries()].reduce(
                (votes, [key, value]) => ({ ...votes, [key]: value }),
                {}
              ),
            };
            ballotId += 1;

            if (
              includeBallotImages === 'never' ||
              (includeBallotImages === 'write-ins' &&
                !castVoteRecordHasWriteIns(cvr))
            ) {
              yield cvr;
              continue;
            }

            const matchingBallot = ballotPackage.ballots.find(
              (b) =>
                b.ballotConfig.ballotStyleId === ballotStyle.id &&
                b.ballotConfig.precinctId === precinct &&
                b.ballotConfig.isLiveMode === !testMode
            );

            /* istanbul ignore next */
            if (!matchingBallot) {
              throw new Error(
                `unable to find ballot for ballot style ${ballotStyle.id}`
              );
            }

            let ballotImages = ballotImageCache.get(matchingBallot);

            if (!ballotImages) {
              const [frontImageUrl, backImageUrl] = await takeAsync(
                2,
                mapAsync(
                  pdfToImages(matchingBallot.pdf, { scale: 2 }),
                  ({ page }) => toDataUrl(page, 'image/png')
                )
              );
              assert(
                typeof frontImageUrl === 'string' &&
                  typeof backImageUrl === 'string'
              );

              ballotImages = [
                { normalized: frontImageUrl },
                { normalized: backImageUrl },
              ];
              ballotImageCache.set(matchingBallot, ballotImages);
            }

            const [frontLayout, backLayout] = matchingBallot.layout;
            assert(frontLayout && backLayout);

            yield {
              ...cvr,
              _ballotImages: ballotImages,
              _layouts: [frontLayout, backLayout],
            };
          }
        }
      }
    }
  }
}
