import { Candidate, parseElection, Election, Contest } from '@votingworks/types'
import {
  electionSample,
  primaryElectionSample,
  multiPartyPrimaryElection,
} from '@votingworks/fixtures'

import * as path from 'path'
import { promises as fs } from 'fs'

import {
  parseCVRs,
  computeFullElectionTally,
  getOvervotePairTallies,
  filterTalliesByParams,
} from './votecounting'
import {
  CastVoteRecord,
  ContestTally,
  ContestOptionTally,
  ContestTallyMetaDictionary,
  Dictionary,
  FullElectionTally,
  Tally,
  TallyCategory,
  YesNoOption,
} from '../config/types'
import { getContestOptionsForContest } from '../utils/election'

const fixturesPath = path.join(__dirname, '../../test/fixtures')
const electionFilePath = path.join(
  fixturesPath,
  'default-election/election.json'
)
const cvrFilePath = path.join(fixturesPath, 'default-election/CVRs.txt')
const multiPartyPrimaryCVRPath = path.join(
  fixturesPath,
  'multiparty-primary-election/CVRs.txt'
)

function parseCVRsAndAssertSuccess(
  cvrsFileContents: string,
  election: Election
): CastVoteRecord[] {
  return [...parseCVRs(cvrsFileContents, election)].map(({ cvr, errors }) => {
    expect({ cvr, errors }).toEqual({ cvr, errors: [] })
    return cvr
  })
}

function expectAllEmptyTallies(tally: Tally) {
  expect(tally.numberOfBallotsCounted).toBe(0)
  for (const contestId in tally.contestTallies) {
    const contestTally = tally.contestTallies[contestId]!
    for (const tally of Object.values(contestTally.tallies)) {
      expect(tally!.tally).toBe(0)
    }
    expect(contestTally.metadata).toStrictEqual({
      undervotes: 0,
      overvotes: 0,
      ballots: 0,
    })
  }
}

// helper function to make checking against older snapshots easier
function transformContestTalliesToOldMetadataFormat(
  tally: Dictionary<ContestTally>,
  election: Election
): ContestTallyMetaDictionary {
  const oldMetadataFormat: ContestTallyMetaDictionary = {}
  election.contests.forEach(
    (c) =>
      (oldMetadataFormat[c.id] = tally[c.id]?.metadata || {
        ballots: 0,
        undervotes: 0,
        overvotes: 0,
      })
  )
  return oldMetadataFormat
}

function transformContestOptionTalliesToOldFormat(
  tally: Dictionary<ContestOptionTally>,
  contest: Contest
): ContestOptionTally[] {
  const optionTallies: ContestOptionTally[] = []
  getContestOptionsForContest(contest).forEach((option) => {
    if (contest.type === 'candidate') {
      optionTallies.push(tally![(option as Candidate).id]!)
    } else if (contest.type === 'yesno') {
      const yesnooption = option as YesNoOption
      if (yesnooption.length === 1) {
        optionTallies.push(tally![yesnooption[0]]!)
      }
    }
  })
  return optionTallies
}

function transformContestTalliesToOldFormat(
  tally: Dictionary<ContestTally>,
  election: Election
): { contest: Contest; tallies: ContestOptionTally[] }[] {
  const oldTallies: { contest: Contest; tallies: ContestOptionTally[] }[] = []
  election.contests.forEach((c) => {
    const optionTallies: ContestOptionTally[] = []
    getContestOptionsForContest(c).forEach((option) => {
      if (c.type === 'candidate') {
        optionTallies.push(tally[c.id]!.tallies![(option as Candidate).id]!)
      } else if (c.type === 'yesno') {
        const yesnooption = option as YesNoOption
        if (yesnooption.length === 1) {
          optionTallies.push(tally[c.id]!.tallies![yesnooption[0]]!)
        }
      }
    })
    oldTallies.push({
      contest: tally[c.id]!.contest!,
      tallies: optionTallies,
    })
  })
  return oldTallies
}

test('tabulating a set of CVRs gives expected output', async () => {
  // get the election
  const election = parseElection(
    JSON.parse((await fs.readFile(electionFilePath)).toString('utf-8'))
  )

  // get the CVRs
  const cvrsFileContents = (await fs.readFile(cvrFilePath)).toString('utf-8')
  const castVoteRecords = parseCVRsAndAssertSuccess(cvrsFileContents, election)

  // tabulate it
  const fullTally = computeFullElectionTally(election, [castVoteRecords])
  expect(fullTally.overallTally.numberOfBallotsCounted).toBe(10000)
  expect(
    transformContestTalliesToOldFormat(
      fullTally.overallTally.contestTallies,
      election
    )
  ).toMatchSnapshot()
  expect(
    transformContestTalliesToOldMetadataFormat(
      fullTally.overallTally.contestTallies,
      election
    )
  ).toMatchSnapshot()

  // some specific tallies checked by hand

  // - Jackie Chan, 1380 bubbles, of which 8 are overvotes --> 1372
  const presidentTallies = fullTally.overallTally.contestTallies.president!
  const jackieChanTally = presidentTallies.tallies['jackie-chan']!
  expect(jackieChanTally.tally).toBe(1372)

  // - Neil Armstrong, 2207 bubbles, of which 10 are overvotes --> 2197
  const repDistrict18Tallies = fullTally.overallTally.contestTallies[
    'representative-district-18'
  ]!
  const neilArmstrongTally = repDistrict18Tallies.tallies['neil-armstrong']!
  expect(neilArmstrongTally.tally).toBe(2197)

  // sum up all the write-ins across all questions
  // 262 bubbles filled out, of which 2 are overvotes --> 260 write-ins
  const candidateTallies = Object.values(
    fullTally.overallTally.contestTallies
  ).filter((contestTally) => contestTally!.contest.type === 'candidate')

  const numWriteIns = candidateTallies.reduce(
    (overallSum, contestTally) =>
      overallSum + contestTally!.tallies['__write-in']!.tally,
    0
  )

  expect(numWriteIns).toBe(260)
})

test('computeFullTally with no results should produce empty tally objects with contests', async () => {
  const election = parseElection(
    JSON.parse((await fs.readFile(electionFilePath)).toString('utf-8'))
  )

  const fullTally = computeFullElectionTally(election, [])
  expect(fullTally.overallTally.numberOfBallotsCounted).toBe(0)
  expect(Object.keys(fullTally.overallTally.contestTallies).length).toBe(
    election.contests.length
  )
  const precinctTallies = fullTally.resultsByCategory.get(
    TallyCategory.Precinct
  )
  expect(precinctTallies).toBeDefined()
  election.precincts.forEach((precinct) => {
    const precinctTally = precinctTallies![precinct.id]
    expect(precinctTally).toBeDefined()
    expect(precinctTally!.numberOfBallotsCounted).toBe(0)
    expect(Object.keys(precinctTally!.contestTallies).length).toBe(
      election.contests.length
    )
  })
})

describe('filterTalliesByParams in a typical election', () => {
  let electionTally: FullElectionTally
  let election: Election
  beforeEach(async () => {
    election = parseElection(
      JSON.parse((await fs.readFile(electionFilePath)).toString('utf-8'))
    )

    // get the CVRs
    const cvrsFileContents = (await fs.readFile(cvrFilePath)).toString('utf-8')
    const castVoteRecords = parseCVRsAndAssertSuccess(
      cvrsFileContents,
      election
    )

    // tabulate it
    electionTally = computeFullElectionTally(election, [castVoteRecords])
  })

  it('can filter by precinct', () => {
    const expectedPrecinctResults = {
      '23': 2474,
      '20': 2478,
      '21': 5048,
    }
    for (const [precinctId, expectedNumBallots] of Object.entries(
      expectedPrecinctResults
    )) {
      const filteredResults = filterTalliesByParams(electionTally, election, {
        precinctId,
      })
      expect(filteredResults.numberOfBallotsCounted).toBe(expectedNumBallots)
      expect(
        transformContestTalliesToOldFormat(
          filteredResults.contestTallies,
          election
        )
      ).toMatchSnapshot()
      expect(
        transformContestTalliesToOldMetadataFormat(
          filteredResults.contestTallies,
          election
        )
      ).toMatchSnapshot()
    }
  })

  it('can filter by scanner', () => {
    const expectedScannerResults = {
      'scanner-1': 1008,
      'scanner-10': 1022,
      'scanner-2': 1015,
      'scanner-3': 1029,
      'scanner-4': 1039,
      'scanner-5': 961,
      'scanner-6': 973,
      'scanner-7': 938,
      'scanner-8': 977,
      'scanner-9': 1038,
    }
    for (const [scannerId, expectedNumBallots] of Object.entries(
      expectedScannerResults
    )) {
      const filteredResults = filterTalliesByParams(electionTally, election, {
        scannerId,
      })
      expect(filteredResults.numberOfBallotsCounted).toBe(expectedNumBallots)
      expect(
        transformContestTalliesToOldFormat(
          filteredResults.contestTallies,
          election
        )
      ).toMatchSnapshot()
      expect(
        transformContestTalliesToOldMetadataFormat(
          filteredResults.contestTallies,
          election
        )
      ).toMatchSnapshot()
    }
  })

  test('can filtere by precinct and scanner', () => {
    const filteredResults = filterTalliesByParams(electionTally, election, {
      precinctId: '23',
      scannerId: 'scanner-5',
    })
    expect(filteredResults.numberOfBallotsCounted).toBe(226)
    expect(
      transformContestTalliesToOldFormat(
        filteredResults.contestTallies,
        election
      )
    ).toMatchSnapshot()
    expect(
      transformContestTalliesToOldMetadataFormat(
        filteredResults.contestTallies,
        election
      )
    ).toMatchSnapshot()
  })
})

describe('filterTalliesByParams in a primary election', () => {
  let electionTally: FullElectionTally

  const expectedPartyInformation = [
    {
      partyId: '0',
      contestIds: [
        'governor-contest-liberty',
        'mayor-contest-liberty',
        'assistant-mayor-contest-liberty',
        'chief-pokemon-liberty',
        'schoolboard-liberty',
      ],
      numBallots: 1710,
    },
    {
      partyId: '3',
      contestIds: [
        'governor-contest-constitution',
        'mayor-contest-constitution',
        'chief-pokemon-constitution',
        'schoolboard-constitution',
      ],
      numBallots: 2100,
    },
    {
      partyId: '4',
      contestIds: [
        'governor-contest-federalist',
        'mayor-contest-federalist',
        'chief-pokemon-federalist',
        'schoolboard-federalist',
      ],
      numBallots: 720,
    },
  ]

  beforeEach(async () => {
    // get the CVRs
    const cvrsFileContents = (
      await fs.readFile(multiPartyPrimaryCVRPath)
    ).toString('utf-8')
    const castVoteRecords = parseCVRsAndAssertSuccess(
      cvrsFileContents,
      multiPartyPrimaryElection
    )

    // tabulate it
    electionTally = computeFullElectionTally(multiPartyPrimaryElection, [
      castVoteRecords,
    ])
  })

  test('can filter results by party', () => {
    expect(Object.keys(electionTally.overallTally.contestTallies).length).toBe(
      13
    )
    expect(electionTally.overallTally.numberOfBallotsCounted).toBe(4530)

    for (const testcase of expectedPartyInformation) {
      const filteredResults = filterTalliesByParams(
        electionTally,
        multiPartyPrimaryElection,
        { partyId: testcase.partyId }
      )
      expect(Object.keys(filteredResults.contestTallies)).toStrictEqual(
        testcase.contestIds
      )
      expect(filteredResults.numberOfBallotsCounted).toBe(testcase.numBallots)
      // Filtering by party just filters down the contests in contestTallies
      expect(
        Object.values(filteredResults.contestTallies).map((c) => {
          return {
            contestId: c!.contest.id,
            tallies: transformContestOptionTalliesToOldFormat(
              c!.tallies,
              c!.contest
            ),
          }
        })
      ).toMatchSnapshot()

      expect(
        transformContestTalliesToOldMetadataFormat(
          filteredResults.contestTallies,
          multiPartyPrimaryElection
        )
      ).toMatchSnapshot()
    }

    // Check that filtering for a party that has no ballot styles returns an empty tally
    const filteredResults2 = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { partyId: '2' }
    )
    expectAllEmptyTallies(filteredResults2)
    expect(filteredResults2.contestTallies).toStrictEqual({})
  })

  test('can filter results by party and precinct', () => {
    // Party 4 was only available for voting in precincts 1 and 5
    const expectedParty4Info = expectedPartyInformation.find(
      (p) => p.partyId === '4'
    )!

    const emptyPrecincts = ['precinct-2', 'precinct-3', 'precinct-4']
    for (const precinctId of emptyPrecincts) {
      const filteredResults = filterTalliesByParams(
        electionTally,
        multiPartyPrimaryElection,
        { partyId: '4', precinctId }
      )
      expect(Object.keys(filteredResults.contestTallies)).toStrictEqual(
        expectedParty4Info.contestIds
      )
      expectAllEmptyTallies(filteredResults)
    }

    const filterParty5Precinct1 = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { partyId: '4', precinctId: 'precinct-1' }
    )
    expect(filterParty5Precinct1.numberOfBallotsCounted).toBe(300)
    expect(Object.keys(filterParty5Precinct1.contestTallies)).toStrictEqual(
      expectedParty4Info.contestIds
    )
    expect(
      Object.values(filterParty5Precinct1.contestTallies).map((c) => {
        return {
          contestId: c!.contest.id,
          tallies: transformContestOptionTalliesToOldFormat(
            c!.tallies,
            c!.contest
          ),
        }
      })
    ).toMatchSnapshot()
    expect(
      transformContestTalliesToOldMetadataFormat(
        filterParty5Precinct1.contestTallies,
        multiPartyPrimaryElection
      )
    ).toMatchSnapshot()

    const filterParty5Precinct5 = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { partyId: '4', precinctId: 'precinct-5' }
    )
    expect(filterParty5Precinct5.numberOfBallotsCounted).toBe(420)
    expect(Object.keys(filterParty5Precinct5.contestTallies)).toStrictEqual(
      expectedParty4Info.contestIds
    )
    expect(
      Object.values(filterParty5Precinct5.contestTallies).map((c) => {
        return {
          contestId: c!.contest.id,
          tallies: transformContestOptionTalliesToOldFormat(
            c!.tallies,
            c!.contest
          ),
        }
      })
    ).toMatchSnapshot()
    expect(
      transformContestTalliesToOldMetadataFormat(
        filterParty5Precinct5.contestTallies,
        multiPartyPrimaryElection
      )
    ).toMatchSnapshot()

    const filterParty5InvalidPrecinct = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { partyId: '4', precinctId: 'not-a-real-precinct' }
    )
    expect(Object.keys(filterParty5Precinct5.contestTallies)).toStrictEqual(
      expectedParty4Info.contestIds
    )
    expectAllEmptyTallies(filterParty5InvalidPrecinct)
  })

  test('can filter results by scanner and party', () => {
    const expectedParty0Info = expectedPartyInformation.find(
      (p) => p.partyId === '0'
    )!
    const filteredResultsScanner1 = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { scannerId: 'scanner-1', partyId: '0' }
    )
    const filteredResultsScanner2 = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { scannerId: 'scanner-2', partyId: '0' }
    )
    const filteredResultsScanner3 = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { scannerId: 'scanner-3', partyId: '0' }
    )

    // All three scanners have identical copies of results, but the CVRs are different due to the scanner and ballot ids
    const scanner1ResultsWithoutCVRs = {
      numberOfBallotsCounted: filteredResultsScanner1.numberOfBallotsCounted,
      contestTallies: filteredResultsScanner1.contestTallies,
    }
    const scanner2ResultsWithoutCVRs = {
      numberOfBallotsCounted: filteredResultsScanner2.numberOfBallotsCounted,
      contestTallies: filteredResultsScanner2.contestTallies,
    }
    const scanner3ResultsWithoutCVRs = {
      numberOfBallotsCounted: filteredResultsScanner3.numberOfBallotsCounted,
      contestTallies: filteredResultsScanner3.contestTallies,
    }
    expect(scanner1ResultsWithoutCVRs).toStrictEqual(scanner2ResultsWithoutCVRs)
    expect(scanner1ResultsWithoutCVRs).toStrictEqual(scanner3ResultsWithoutCVRs)

    // Verify the data of scanner 1s results
    expect(Object.keys(filteredResultsScanner1.contestTallies)).toStrictEqual(
      expectedParty0Info.contestIds
    )
    expect(
      Object.values(filteredResultsScanner1.contestTallies).map((c) => {
        return {
          contestId: c!.contest.id,
          tallies: transformContestOptionTalliesToOldFormat(
            c!.tallies,
            c!.contest
          ),
        }
      })
    ).toMatchSnapshot()
    expect(
      transformContestTalliesToOldMetadataFormat(
        filteredResultsScanner1.contestTallies,
        multiPartyPrimaryElection
      )
    ).toMatchSnapshot()

    expect(filteredResultsScanner1.numberOfBallotsCounted).toBe(570)

    // Filter for a scanner not in the results
    const filteredResultsInvalidScanner = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { scannerId: 'not-a-scanner', partyId: '0' }
    )
    expect(
      Object.keys(filteredResultsInvalidScanner.contestTallies)
    ).toStrictEqual(expectedParty0Info.contestIds)
    expectAllEmptyTallies(filteredResultsInvalidScanner)
  })
})

test('undervotes counted in n of m contest properly', () => {
  // Create mock CVR data
  const mockCVR: CastVoteRecord = {
    _ballotId: 'abc',
    _ballotStyleId: '12D',
    _ballotType: 'standard',
    _precinctId: '21',
    _testBallot: false,
    _scannerId: '1',
    'county-commissioners': [],
  }

  // tabulate it
  let electionTally = computeFullElectionTally(primaryElectionSample, [
    [mockCVR],
  ])!

  // The county commissioners race has 4 seats. Each vote less then 4 should be counted
  // as an additional undervote.
  expect(
    electionTally.overallTally.contestTallies['county-commissioners']?.metadata
      .undervotes
  ).toBe(4)

  electionTally = computeFullElectionTally(primaryElectionSample, [
    [{ ...mockCVR, 'county-commissioners': ['argent'] }],
  ])!
  expect(
    electionTally.overallTally.contestTallies['county-commissioners']?.metadata
      .undervotes
  ).toBe(3)

  electionTally = computeFullElectionTally(primaryElectionSample, [
    [{ ...mockCVR, 'county-commissioners': ['argent', 'bainbridge'] }],
  ])!
  expect(
    electionTally.overallTally.contestTallies['county-commissioners']?.metadata
      .undervotes
  ).toBe(2)

  electionTally = computeFullElectionTally(primaryElectionSample, [
    [
      {
        ...mockCVR,
        'county-commissioners': ['argent', 'bainbridge', 'hennessey'],
      },
    ],
  ])!
  expect(
    electionTally.overallTally.contestTallies['county-commissioners']?.metadata
      .undervotes
  ).toBe(1)

  electionTally = computeFullElectionTally(primaryElectionSample, [
    [
      {
        ...mockCVR,
        'county-commissioners': ['argent', 'bainbridge', 'hennessey', 'savoy'],
      },
    ],
  ])!
  expect(
    electionTally.overallTally.contestTallies['county-commissioners']?.metadata
      .undervotes
  ).toBe(0)
})

test('overvote report', async () => {
  // get the election
  const election = parseElection(
    JSON.parse((await fs.readFile(electionFilePath)).toString('utf-8'))
  )

  // get the CVRs
  const cvrsFileContents = (await fs.readFile(cvrFilePath)).toString('utf-8')
  const castVoteRecords = parseCVRsAndAssertSuccess(cvrsFileContents, election)

  const pairTallies = getOvervotePairTallies({ election, castVoteRecords })
  expect(pairTallies).toMatchSnapshot()
})

test('parsing CVRs flags when a precinct ID in a CVR is not present in the election definition', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: 'not real',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    _testBallot: false,
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: ["Precinct 'not real' in CVR is not in the election definition"],
      lineNumber: 1,
    },
  ])
})

test('parsing CVRs flags when a ballot style ID in a CVR is not present in the election definition', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '123',
    _ballotType: 'standard',
    _precinctId: '23',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    _testBallot: false,
    _locales: { primary: 'en-US', secondary: 'es-US' },
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: ["Ballot style '123' in CVR is not in the election definition"],
      lineNumber: 1,
    },
  ])
})

test('parsing CVRs flags when a contest ID in a CVR is not present in the election definition', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    _testBallot: false,
    'not a contest': [],
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "Contest 'not a contest' in CVR is not in the election definition or is not a valid contest for ballot style '12'",
      ],
      lineNumber: 1,
    },
  ])
})

test('parsing CVRs flags when test ballot flag is not a boolean', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    // @ts-expect-error - string instead of a boolean
    _testBallot: 'false',
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "CVR test ballot flag must be true or false, got 'false' (string, not boolean)",
      ],
      lineNumber: 1,
    },
  ])
})

test('parsing CVRs flags when page number is set but not a number', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    _testBallot: false,
    // @ts-expect-error - string instead of a number
    _pageNumber: '99',
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "Page number in CVR must be a number if it is set, got '99' (string, not number)",
      ],
      lineNumber: 1,
    },
  ])
})

test('parsing CVRs flags when page numbers is set but not an array of numbers', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    _testBallot: false,
    // @ts-expect-error - number instead of an array
    _pageNumbers: 99,
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "Page numbers in CVR must be an array of number if it is set, got '99' (number, not an array of numbers)",
      ],
      lineNumber: 1,
    },
  ])
})

test('parsing CVRs flags when both _pageNumber and _pageNumbers are set', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    _testBallot: false,
    _pageNumber: 1,
    _pageNumbers: [1, 2],
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        'Page number in CVR must be either _pageNumber, or _pageNumbers, but cannot be both.',
      ],
      lineNumber: 1,
    },
  ])
})

test('parsing CVRs flags with _pageNumbers set properly works', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    _testBallot: false,
    _pageNumbers: [1, 2],
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [],
      lineNumber: 1,
    },
  ])
})

test('parsing CVRs flags when ballot ID is not a string', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    // @ts-expect-error - number instead of a string
    _ballotId: 44,
    _scannerId: 'scanner-1',
    _testBallot: false,
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "Ballot ID in CVR must be a string, got '44' (number, not string)",
      ],
      lineNumber: 1,
    },
  ])
})

test('parsing CVRs flags when scanner ID is not a string', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _precinctId: '23',
    _ballotId: 'abc',
    // @ts-expect-error - false instead of a string
    _scannerId: false,
    _testBallot: false,
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "Scanner ID in CVR must be a string, got 'false' (boolean, not string)",
      ],
      lineNumber: 1,
    },
  ])
})

test('parsing CVRs flags when locale is not well formed', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _precinctId: '23',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    _testBallot: false,
    // @ts-expect-error - object missing properties
    _locales: {},
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "Locale in CVR must be a locale object with primary and optional secondary locales, got '{}'",
      ],
      lineNumber: 1,
    },
  ])
})
