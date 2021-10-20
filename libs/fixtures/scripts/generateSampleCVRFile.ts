import yargs from 'yargs/yargs';
import * as fs from 'fs';
import {
  BallotLocale,
  Candidate,
  CandidateContest,
  Dictionary,
  Election,
  parseElection,
} from '@votingworks/types';

/**
 * Script to generate a cast vote record file for a given election.
 * Run from the command-line with:
 * pnpx ts-node generateSampleCVRFile.ts --help
 * To see more information and all possible arguments.
 */

interface CastVoteRecord
  extends Dictionary<
    string | string[] | boolean | number | number[] | BallotLocale
  > {
  readonly _precinctId: string;
  readonly _ballotId: string;
  readonly _ballotStyleId: string;
  readonly _ballotType: string;
  readonly _testBallot: boolean;
  readonly _scannerId: string;
  readonly _pageNumber?: number;
  readonly _pageNumbers?: number[];
  readonly _locales?: BallotLocale;
}

/**
 * Generate all combinations of an array.
 * @param sourceArray - Array of input elements.
 * @param comboLength - Desired length of combinations.
 * @returns Array of combination arrays.
 */
function generateCombinations<T>(
  sourceArray: readonly T[],
  comboLength: number
): Array<T[]> {
  const sourceLength = sourceArray.length;
  if (comboLength > sourceLength) return [];

  const combos: Array<T[]> = []; // Stores valid combinations as they are generated.

  // Accepts a partial combination, an index into sourceArray,
  // and the number of elements required to be added to create a full-length combination.
  // Called recursively to build combinations, adding subsequent elements at each call depth.
  function makeNextCombos(
    workingCombo: T[],
    currentIndex: number,
    remainingCount: number
  ) {
    const oneAwayFromComboLength = remainingCount === 1;

    // For each element that remaines to be added to the working combination.
    for (
      let sourceIndex = currentIndex;
      sourceIndex < sourceLength;
      sourceIndex += 1
    ) {
      // Get next (possibly partial) combination.
      const next = [...workingCombo, sourceArray[sourceIndex]];

      if (oneAwayFromComboLength) {
        // Combo of right length found, save it.
        combos.push(next);
      } else {
        // Otherwise go deeper to add more elements to the current partial combination.
        makeNextCombos(next, sourceIndex + 1, remainingCount - 1);
      }
    }
  }
  makeNextCombos([], 0, comboLength);
  return combos;
}

// All valid contest choice options for a yes no contest
const YES_NO_OPTIONS = [['yes'], ['no'], ['yes', 'no'], []];

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
    const candidates = [];
    for (let j = 0; j < i; j += 1) {
      candidates.push(candidateIds[j]);
    }
    candidateOptions.push(candidates);
  }

  // Generate a result for all possible number of overvotes
  for (let i = numSeats + 1; i <= candidateIds.length; i += 1) {
    const candidates = [];
    for (let j = 0; j < i; j += 1) {
      candidates.push(candidateIds[j]);
    }
    candidateOptions.push(candidates);
  }

  // Add a write in vote if applicable
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
  candidateOptionsForContest: ReadonlyMap<string, Array<string[]>>
): Array<Map<string, string[]>> {
  // Find the contest with the most vote combinations generated to determine the number of vote combinations to generate.
  const numOptionsToProduce = [...candidateOptionsForContest.values()].reduce(
    (prev, options) => Math.max(prev, options?.length ?? 0),
    0
  );
  const voteOptions = [];
  for (let i = 0; i < numOptionsToProduce; i += 1) {
    const voteOption = new Map<string, string[]>();
    for (const [contest, optionsForContest] of candidateOptionsForContest) {
      // Add the ith contest choice option as the vote for each contest
      // If i is greater then the number of votes generated for this contest, vote for the final generated vote again.
      voteOption.set(
        contest,
        optionsForContest[Math.min(i, optionsForContest.length - 1)]
      );
    }
    voteOptions.push(voteOption);
  }
  return voteOptions;
}

/**
 * Generates a base set of CVRs for a given election that obtains maximum coverage of all the ballot metadata (precincts, scanners, etc.) and all possible votes on each contest.
 * @param election Election to generate CVRs for
 * @param scannerNames Scanners to include in the output CVRs
 * @param testMode Generate CVRs for test ballots or live ballots
 * @returns Array of generated CastVoteRecords
 */
function* generateCVRs(
  election: Election,
  scannerNames: readonly string[],
  testMode: boolean
): Generator<CastVoteRecord> {
  const { ballotStyles } = election;
  const { contests } = election;
  let ballotId = 0;
  for (const ballotStyle of ballotStyles) {
    const { precincts } = ballotStyle;
    const { districts } = ballotStyle;
    for (const ballotType of ['absentee', 'provisional', 'standard']) {
      for (const precinct of precincts) {
        for (const scanner of scannerNames) {
          // Define base information for all resulting CVRs with this precinct, ballot style and scanner.
          const baseRecord = {
            _precinctId: precinct,
            _ballotStyleId: ballotStyle.id,
            _testBallot: testMode,
            _scannerId: scanner,
          };

          // For each contest determine all possible contest choices.
          const candidateOptionsForContest = new Map<string, Array<string[]>>();
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
                default:
                  // @ts-expect-error - contest.type should have `never` here type
                  throw new Error(`unexpected contest type: ${contest.type}`);
              }
            }
          }
          // Generate as many vote combinations as necessary that contain all contest choice options
          const voteConfigurations = getVoteConfigurationsForCandidateOptions(
            candidateOptionsForContest
          );
          // Add the generated vote combinations as CVRs
          for (const voteConfig of voteConfigurations) {
            yield {
              _ballotId: `id-${ballotId}`,
              _ballotType: ballotType,
              ...baseRecord,
              ...[...voteConfig.entries()].reduce(
                (votes, [key, value]) => ({ ...votes, [key]: value }),
                {}
              ),
            };
            ballotId += 1;
          }
        }
      }
    }
  }
}

interface GenerateCVRFileArguments {
  electionPath?: string;
  outputPath?: string;
  numBallots?: number;
  scannerNames?: Array<string | number>;
  liveBallots?: boolean;
  help?: boolean;
  [x: string]: unknown;
}

const args: GenerateCVRFileArguments = yargs(process.argv.slice(2)).options({
  electionPath: {
    type: 'string',
    alias: 'e',
    demandOption: true,
    description: 'Path to the input election definition',
  },
  outputPath: {
    type: 'string',
    alias: 'o',
    description: 'Path to write output file to',
  },
  numBallots: {
    type: 'number',
    description: 'Number of ballots to include in the output, default is 1000.',
  },
  liveBallots: {
    type: 'boolean',
    default: false,
    description:
      'Create live mode ballots when specified, by default test mode ballots are created.',
  },
  scannerNames: {
    type: 'array',
    description: 'Creates ballots for each scanner name specified.',
  },
}).argv as GenerateCVRFileArguments;

if (args.electionPath === undefined) {
  process.stderr.write(
    'Specify an election path in order to generate CVR files. Run with --help for more information.\n'
  );
  process.exit(-1);
}

const outputPath = args.outputPath ?? 'output.jsonl';
const { numBallots } = args;
const testMode = !(args.liveBallots ?? false);
const scannerNames = (args.scannerNames ?? ['scanner']).map((s) => `${s}`);

const electionRawData = fs.readFileSync(args.electionPath, 'utf8');
const election = parseElection(JSON.parse(electionRawData));

const castVoteRecords = [...generateCVRs(election, scannerNames, testMode)];

// Modify results to match the desired number of ballots
if (numBallots !== undefined && numBallots < castVoteRecords.length) {
  process.stderr.write(
    `WARNING: At least ${castVoteRecords.length} are suggested to be generated for maximum coverage of ballot metadata options and possible contest votes.\n`
  );
  // Remove random entries from the CVR list until the desired number of ballots is reach
  while (numBallots < castVoteRecords.length) {
    const i = Math.floor(Math.random() * castVoteRecords.length);
    castVoteRecords.splice(i, 1);
  }
}

let ballotId = castVoteRecords.length;
// Duplicate random ballots until the desired number of ballots is reached.
while (numBallots !== undefined && numBallots > castVoteRecords.length) {
  const i = Math.floor(Math.random() * castVoteRecords.length);
  castVoteRecords.push({
    ...castVoteRecords[i],
    _ballotId: `id-${ballotId}`,
  });
  ballotId += 1;
}

const stream = fs.createWriteStream(outputPath);
for (const record of castVoteRecords) {
  stream.write(`${JSON.stringify(record)}\n`);
}
stream.end();
