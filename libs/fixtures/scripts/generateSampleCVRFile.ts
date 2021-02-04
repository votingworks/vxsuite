import { parse } from 'ts-command-line-args'
import * as fs from 'fs'
import {
  BallotLocale,
  Candidate,
  CandidateContest,
  Dictionary,
  Election,
  parseElection,
} from '@votingworks/types'

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
  readonly _precinctId: string
  readonly _ballotId: string
  readonly _ballotStyleId: string
  readonly _ballotType: string
  readonly _testBallot: boolean
  readonly _scannerId: string
  readonly _pageNumber?: number
  readonly _pageNumbers?: number[]
  readonly _locales?: BallotLocale
}

/**
 * Generate all combinations of an array.
 * @param {any[]} sourceArray - Array of input elements.
 * @param {number} comboLength - Desired length of combinations.
 * @return {any[]} Array of combination arrays.
 */
function generateCombinations(sourceArray: any[], comboLength: number): any[] {
  const sourceLength = sourceArray.length
  if (comboLength > sourceLength) return []

  const combos: any[] = [] // Stores valid combinations as they are generated.

  // Accepts a partial combination, an index into sourceArray,
  // and the number of elements required to be added to create a full-length combination.
  // Called recursively to build combinations, adding subsequent elements at each call depth.
  const makeNextCombos = (
    workingCombo: any[],
    currentIndex: number,
    remainingCount: number
  ) => {
    const oneAwayFromComboLength = remainingCount == 1

    // For each element that remaines to be added to the working combination.
    for (
      let sourceIndex = currentIndex;
      sourceIndex < sourceLength;
      sourceIndex++
    ) {
      // Get next (possibly partial) combination.
      const next = [...workingCombo, sourceArray[sourceIndex]]

      if (oneAwayFromComboLength) {
        // Combo of right length found, save it.
        combos.push(next)
      } else {
        // Otherwise go deeper to add more elements to the current partial combination.
        makeNextCombos(next, sourceIndex + 1, remainingCount - 1)
      }
    }
  }
  makeNextCombos([], 0, comboLength)
  return combos
}

// All valid contest choice options for a yes no contest
const YES_NO_OPTIONS = [['yes'], ['no'], ['yes', 'no'], []]

/**
 * Generates all possible contest choice options for a given CandidateContest
 * @param {CandidateContest} contest CandidateContest to generate contest choices for
 * @returns {string[][]} Array of possible contest choice selections. Each contest choice selection is an array of candidates to vote for.
 */
function getCandidateOptionsForContest(contest: CandidateContest): string[][] {
  const candidateOptions: string[][] = []
  const numSeats = contest.seats
  const candidateIds = contest.candidates.map((c: Candidate) => c.id)

  // Generate a result for all possible number of undervotes
  for (let i = 0; i < numSeats && i < candidateIds.length; i += 1) {
    const candidates = []
    for (let j = 0; j < i; j += 1) {
      candidates.push(candidateIds[j])
    }
    candidateOptions.push(candidates)
  }

  // Generate a result for all possible number of overvotes
  for (let i = numSeats + 1; i <= candidateIds.length; i += 1) {
    const candidates = []
    for (let j = 0; j < i; j += 1) {
      candidates.push(candidateIds[j])
    }
    candidateOptions.push(candidates)
  }

  // Add a write in vote if applicable
  if (contest.allowWriteIns) {
    const combinations = generateCombinations(candidateIds, numSeats - 1)
    for (const combo of combinations) {
      combo.push('write-in-0')
      candidateOptions.push(combo)
    }
    if (numSeats === 1) {
      candidateOptions.push(['write-in-0'])
    }
  }

  // Generate all possible valid votes
  for (const option of generateCombinations(candidateIds, numSeats)) {
    candidateOptions.push(option)
  }

  return candidateOptions
}

/**
 * Generates all possible vote configurations across a ballot given a list of contests and possible contest choice options for those contests.
 * @param {Dictionary<string[][]>} candidateOptionsForContest Dictionary of contests to the possible contest choice options for that contest.
 * @returns {Dictionary<string[]>[]} Array of dictionaries where each dictionary represents the votes across all contests provided from each contest ID to the votes to mark on that contest.
 */
function getVoteConfigurationsForCandidateOptions(
  candidateOptionsForContest: Dictionary<string[][]>
): Dictionary<string[]>[] {
  // Find the contest with the most vote combinations generated to determine the number of vote combinations to generate.
  const numOptionsToProduce = Object.values(candidateOptionsForContest).reduce(
    (prev, options) => Math.max(prev, options?.length ?? 0),
    0
  )
  const voteOptions = []
  for (let i = 0; i < numOptionsToProduce; i += 1) {
    const voteOption: Dictionary<string[]> = {}
    for (const contest of Object.keys(candidateOptionsForContest)) {
      // Add the ith contest choice option as the vote for each contest
      // If i is greater then the number of votes generated for this contest, vote for the final generated vote again.
      const optionsForContest = candidateOptionsForContest[contest]!
      voteOption[contest] =
        optionsForContest[Math.min(i, optionsForContest.length - 1)]
    }
    voteOptions.push(voteOption)
  }
  return voteOptions
}

/**
 * Generates a base set of CVRs for a given election that obtains maximum coverage of all the ballot metadata (precincts, scanners, etc.) and all possible votes on each contest.
 * @param {Election} election Election to generate CVRs for
 * @param {string[]} scannerNames Scanners to include in the output CVRs
 * @param {boolean} testMode Generate CVRs for test ballots or live ballots
 * @returns {CastVoteRecord[]} Array of generated CastVoteRecords
 */
function generateCVRs(
  election: Election,
  scannerNames: string[],
  testMode: boolean
): CastVoteRecord[] {
  const ballotStyles = election.ballotStyles
  const contests = election.contests
  const records: CastVoteRecord[] = []
  let ballotId = 0
  for (const ballotStyle of ballotStyles) {
    const precincts = ballotStyle.precincts
    const districts = ballotStyle.districts
    for (const ballotType of ['absentee', 'provisional', 'standard']) {
      for (const precinct of precincts) {
        for (const scanner of scannerNames) {
          // Define base information for all resulting CVRs with this precinct, ballot style and scanner.
          const baseRecord = {
            _precinctId: precinct,
            _ballotStyleId: ballotStyle.id,
            _testBallot: testMode,
            _scannerId: scanner,
          }

          // For each contest determine all possible contest choices.
          const candidateOptionsForContest: Dictionary<string[][]> = {}
          for (const contest of contests) {
            if (
              districts.includes(contest.districtId) &&
              (ballotStyle.partyId === undefined ||
                contest.partyId === ballotStyle.partyId)
            ) {
              // Generate an array of all possible contest choice responses for this contest
              switch (contest.type) {
                case 'candidate':
                  candidateOptionsForContest[
                    contest.id
                  ] = getCandidateOptionsForContest(contest as CandidateContest)
                  break
                case 'yesno':
                  candidateOptionsForContest[contest.id] = YES_NO_OPTIONS
                  break
                case 'ms-either-neither':
                  candidateOptionsForContest[
                    contest.eitherNeitherContestId
                  ] = YES_NO_OPTIONS
                  candidateOptionsForContest[
                    contest.pickOneContestId
                  ] = YES_NO_OPTIONS
                  break
              }
            }
          }
          // Generate as many vote combinations as necessary that contain all contest choice options
          const voteConfigurations = getVoteConfigurationsForCandidateOptions(
            candidateOptionsForContest
          )
          // Add the generated vote combinations as CVRs
          for (const voteConfig of voteConfigurations) {
            records.push({
              _ballotId: `id-${ballotId}`,
              _ballotType: ballotType,
              ...baseRecord,
              ...voteConfig,
            })
            ballotId += 1
          }
        }
      }
    }
  }
  return records
}
interface GenerateCVRFileArguments {
  electionPath?: string
  outputPath?: string
  numBallots?: number
  scannerNames?: string[]
  liveBallots?: boolean
  help?: boolean
}

const args = parse<GenerateCVRFileArguments>(
  {
    electionPath: {
      type: String,
      alias: 'e',
      optional: true,
      description: 'Path to the input election definition',
    },
    outputPath: {
      type: String,
      alias: 'o',
      optional: true,
      description: 'Path to write output file to',
    },
    numBallots: {
      type: Number,
      optional: true,
      description:
        'Number of ballots to include in the output, default is 1000.',
    },
    help: {
      type: Boolean,
      optional: true,
      alias: 'h',
      description: 'Prints the usage guide',
    },
    liveBallots: {
      type: Boolean,
      optional: true,
      description:
        'Create live mode ballots when specified, by default test mode ballots are created.',
    },
    scannerNames: {
      type: String,
      optional: true,
      multiple: true,
      description: 'Creates ballots for each scanner name specified.',
    },
  },
  {
    helpArg: 'help',
    headerContentSections: [
      {
        header: 'Generate CVR Files',
        content:
          'Generate a sample CVR file for a given election definition. When the number of ballots to generate is less then the number required to include every possible cast ballot, not every potential ballot will be included. When the number of ballots to generate is larger at least 1 ballot with every possible voting combination will be produced.',
      },
    ],
  }
)

if (args['electionPath'] === undefined) {
  console.error(
    'Specify an election path in order to generate CVR files. Run with --help for more information.'
  )
  process.exit(-1)
}

const outputPath = args['outputPath'] ?? 'output.jsonl'
const numBallots = args['numBallots']
const testMode = !(args['liveBallots'] ?? false)
const scannerNames = args['scannerNames'] ?? ['scanner']

const electionRawData = fs.readFileSync(args['electionPath'], 'utf8')
const election = parseElection(JSON.parse(electionRawData))

const castVoteRecords = generateCVRs(election, scannerNames, testMode)

// Modify results to match the desired number of ballots
if (numBallots !== undefined && numBallots < castVoteRecords.length) {
  console.warn(
    `WARNING: At least ${castVoteRecords.length} are suggested to be generated for maximum coverage of ballot metadata options and possible contest votes.`
  )
  // Remove random entries from the CVR list until the desired number of ballots is reach
  while (numBallots < castVoteRecords.length) {
    const i = Math.floor(Math.random() * castVoteRecords.length)
    castVoteRecords.splice(i, 1)
  }
}

let ballotId = castVoteRecords.length
// Duplicate random ballots until the desired number of ballots is reached.
while (numBallots !== undefined && numBallots > castVoteRecords.length) {
  const i = Math.floor(Math.random() * castVoteRecords.length)
  castVoteRecords.push({
    ...castVoteRecords[i],
    _ballotId: `id-${ballotId}`,
  })
  ballotId += 1
}

var stream = fs.createWriteStream(outputPath)
stream.once('open', function (fd) {
  for (const record of castVoteRecords) {
    stream.write(JSON.stringify(record) + '\n')
  }
  stream.end()
})
