const fs = require('fs')
const createCsvWriter = require('csv-writer').createObjectCsvWriter

/**
 * Generate all combinations of an array.
 * @param {Array} sourceArray - Array of input elements.
 * @param {number} comboLength - Desired length of combinations.
 * @return {Array} Array of combination arrays.
 */
function generateCombinations(sourceArray, comboLength) {
  const sourceLength = sourceArray.length
  if (comboLength > sourceLength) return []

  const combos = [] // Stores valid combinations as they are generated.

  // Accepts a partial combination, an index into sourceArray,
  // and the number of elements required to be added to create a full-length combination.
  // Called recursively to build combinations, adding subsequent elements at each call depth.
  const makeNextCombos = (workingCombo, currentIndex, remainingCount) => {
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

function getCandidateOptionsForContest(contest) {
  const candidateOptions = []
  const numSeats = contest['seats']
  const candidateIds = contest['candidates'].map((c) => c['id'])

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
  if (contest['allowWriteIns']) {
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

function getVoteConfigurationsForCandidateOptions(candidateOptionsForContest) {
  const numOptionsToProduce = Object.values(candidateOptionsForContest).reduce(
    (prev, options) => Math.max(prev, options.length),
    0
  )
  const voteOptions = []
  for (let i = 0; i < numOptionsToProduce; i += 1) {
    const voteOption = {}
    for (const contest of Object.keys(candidateOptionsForContest)) {
      const optionsForContest = candidateOptionsForContest[contest]
      voteOption[contest] =
        optionsForContest[Math.min(i, optionsForContest.length - 1)]
    }
    voteOptions.push(voteOption)
  }
  return voteOptions
}

function generateCVRs(election, scanners) {
  const ballotStyles = election['ballotStyles']
  const contests = election['contests']
  const records = []
  const seperatedVoteData = []
  let ballotId = 0
  for (const ballotStyle of ballotStyles) {
    const precincts = ballotStyle['precincts']
    const districts = ballotStyle['districts']
    for (const precinct of precincts) {
      for (const scanner of scanners) {
        candidateOptionsForContest = {}
        for (const contest of contests) {
          if (
            districts.includes(contest['districtId']) &&
            (!('partyId' in ballotStyle) ||
              contest['partyId'] === ballotStyle['partyId'])
          ) {
            candidateOptionsForContest[
              contest['id']
            ] = getCandidateOptionsForContest(contest)
          }
        }
        const baseRecord = {
          _precinctId: precinct,
          _ballotStyleId: ballotStyle['id'],
          _testBallot: true,
          _scannerId: scanner,
        }
        const voteConfigurations = getVoteConfigurationsForCandidateOptions(
          candidateOptionsForContest
        )
        for (const voteConfig of voteConfigurations) {
          console.log(voteConfig)
          for (const contest of Object.keys(voteConfig)) {
            console.log(contest)
            let candidateVotes = voteConfig[contest]
            console.log(candidateVotes)
            const fullContest = contests.find((c) => c['id'] === contest)
            const numSeats = fullContest['seats']

            // Add any undervotes
            for (let i = candidateVotes.length; i < numSeats; i += 1) {
              seperatedVoteData.push({
                _ballotId: `id-${ballotId}`,
                ...baseRecord,
                _contestId: contest,
                candidateVote: 'undervote',
              })
            }

            // Add any overvotes
            for (let i = candidateVotes.length; i > numSeats; i -= 1) {
              seperatedVoteData.push({
                _ballotId: `id-${ballotId}`,
                ...baseRecord,
                _contestId: contest,
                candidateVote: 'overvote',
              })
            }

            // Add rest of votes
            if (candidateVotes.length <= numSeats) {
              for (const candidate of candidateVotes) {
                seperatedVoteData.push({
                  _ballotId: `id-${ballotId}`,
                  ...baseRecord,
                  _contestId: contest,
                  candidateVote: candidate,
                })
              }
            }
          }
          records.push({
            _ballotId: `id-${ballotId}`,
            ...baseRecord,
            ...voteConfig,
          })
          ballotId += 1
        }
      }
    }
  }
  console.log(seperatedVoteData)
  return [records, seperatedVoteData]
}

const filepath = 'samplePrimaryElection.json'
const scannerIds = ['scanner-1', 'scanner-2', 'scanner-3']
const rawdata = fs.readFileSync(filepath)
const election = JSON.parse(rawdata)

const [castVoteRecords, voteData] = generateCVRs(election, scannerIds)
var stream = fs.createWriteStream('samplePrimaryCVR.txt')
stream.once('open', function (fd) {
  for (const record of castVoteRecords) {
    stream.write(JSON.stringify(record) + '\n')
  }
  stream.end()
})
const csvWriter = createCsvWriter({
  path: 'samplePrimaryCVRTallies.csv',
  header: [
    { id: '_precinctId', title: 'Precinct ID' },
    { id: '_ballotStyleId', title: 'Ballot Style Id' },
    { id: '_testBallot', title: 'Test Ballot' },
    { id: '_scannerId', title: 'Scanner ID' },
    { id: '_ballotId', title: 'Ballot ID' },
    { id: '_contestId', title: 'Contest ID' },
    { id: 'candidateVote', title: 'Candidate Vote' },
  ],
})
csvWriter.writeRecords(voteData)
