import {
  Candidate,
  parseElection,
  electionSample,
  Election,
  primaryElectionSample,
} from '@votingworks/ballot-encoder'

import * as path from 'path'
import { promises as fs } from 'fs'

import find from '../utils/find'
import {
  parseCVRs,
  computeFullElectionTally,
  getOvervotePairTallies,
  filterTalliesByParams,
} from './votecounting'
import {
  CastVoteRecord,
  FullElectionTally,
  TallyCategory,
} from '../config/types'

const fixturesPath = path.join(__dirname, '../../test/fixtures')
const electionFilePath = path.join(fixturesPath, 'election.json')
const cvrFilePath = path.join(fixturesPath, 'CVRs.txt')
const primaryCvrFilePath = path.join(fixturesPath, 'primary-CVRs.txt')

function parseCVRsAndAssertSuccess(
  cvrsFileContents: string,
  election: Election
): CastVoteRecord[] {
  return [...parseCVRs(cvrsFileContents, election)].map(({ cvr, errors }) => {
    expect({ cvr, errors }).toEqual({ cvr, errors: [] })
    return cvr
  })
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
  expect(fullTally.overallTally.contestTallies).toMatchSnapshot()
  expect(fullTally.overallTally.contestTallyMetadata).toMatchSnapshot()

  // some specific tallies checked by hand

  // - Jackie Chan, 1380 bubbles, of which 8 are overvotes --> 1372
  const presidentTallies = find(
    fullTally.overallTally.contestTallies,
    (contestTally) => contestTally.contest.id === 'president'
  )
  const jackieChanTally = find(
    presidentTallies.tallies,
    (contestOptionTally) =>
      (contestOptionTally.option as Candidate).id === 'jackie-chan'
  )
  expect(jackieChanTally.tally).toBe(1372)

  // - Neil Armstrong, 2207 bubbles, of which 10 are overvotes --> 2197
  const repDistrict18Tallies = find(
    fullTally.overallTally.contestTallies,
    (contestTally) => contestTally.contest.id === 'representative-district-18'
  )
  const neilArmstrongTally = find(
    repDistrict18Tallies.tallies,
    (contestOptionTally) =>
      (contestOptionTally.option as Candidate).id === 'neil-armstrong'
  )
  expect(neilArmstrongTally.tally).toBe(2197)

  // sum up all the write-ins across all questions
  // 262 bubbles filled out, of which 2 are overvotes --> 260 write-ins
  const candidateTallies = fullTally.overallTally.contestTallies.filter(
    (contestTally) => contestTally.contest.type === 'candidate'
  )

  const numWriteIns = candidateTallies.reduce(
    (overallSum, contestTally) =>
      overallSum +
      contestTally.tallies
        .filter(
          (optionTally) => (optionTally.option as Candidate).id === '__write-in'
        )
        .reduce((contestSum, optionTally) => contestSum + optionTally.tally, 0),
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
  expect(fullTally.overallTally.contestTallies.length).toBe(
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
    expect(precinctTally!.contestTallies.length).toBe(election.contests.length)
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
      expect(filteredResults.contestTallies).toMatchSnapshot()
      expect(filteredResults.contestTallyMetadata).toMatchSnapshot()
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
      expect(filteredResults.contestTallies).toMatchSnapshot()
      expect(filteredResults.contestTallyMetadata).toMatchSnapshot()
    }
  })

  test('can filtere by precinct and scanner', () => {
    const filteredResults = filterTalliesByParams(electionTally, election, {
      precinctId: '23',
      scannerId: 'scanner-5',
    })
    expect(filteredResults.numberOfBallotsCounted).toBe(226)
    expect(filteredResults.contestTallies).toMatchSnapshot()
    expect(filteredResults.contestTallyMetadata).toMatchSnapshot()
  })
})

describe('filterTalliesByParams in a primary election', () => {
  let electionTally: FullElectionTally
  beforeEach(async () => {
    // get the CVRs
    const cvrsFileContents = (await fs.readFile(primaryCvrFilePath)).toString(
      'utf-8'
    )
    const castVoteRecords = parseCVRsAndAssertSuccess(
      cvrsFileContents,
      primaryElectionSample
    )

    // tabulate it
    electionTally = computeFullElectionTally(primaryElectionSample, [
      castVoteRecords,
    ])
  })

  test('can filter results by party', () => {
    const filteredResults = filterTalliesByParams(
      electionTally,
      primaryElectionSample,
      { partyId: '3' }
    )
    expect(electionTally.overallTally.contestTallies.length).toBe(22)
    // Filtering by party just filters down the contests in contestTallies
    expect(filteredResults.contestTallies).toMatchInlineSnapshot(`
      Array [
        Object {
          "contest": Object {
            "allowWriteIns": false,
            "candidates": Array [
              Object {
                "id": "alice",
                "name": "Alice Jones",
                "partyId": "3",
              },
              Object {
                "id": "bob",
                "name": "Bob Smith",
              },
            ],
            "districtId": "7",
            "id": "primary-constitution-head-of-party",
            "partyId": "3",
            "seats": 1,
            "section": "Franklin County",
            "title": "Head of Constitution Party",
            "type": "candidate",
          },
          "tallies": Array [
            Object {
              "option": Object {
                "id": "alice",
                "name": "Alice Jones",
                "partyId": "3",
              },
              "tally": 5,
            },
            Object {
              "option": Object {
                "id": "bob",
                "name": "Bob Smith",
              },
              "tally": 3,
            },
          ],
        },
      ]
    `)

    const filteredResults2 = filterTalliesByParams(
      electionTally,
      primaryElectionSample,
      { partyId: '4' }
    )
    expect(filteredResults2.contestTallies).toStrictEqual([])
  })

  test('can filter results by party and precinct', () => {
    const filteredResultsAll = filterTalliesByParams(
      electionTally,
      primaryElectionSample,
      { partyId: '3' }
    )
    const filteredResultsPrecinct = filterTalliesByParams(
      electionTally,
      primaryElectionSample,
      { precinctId: '20', partyId: '3' }
    )
    // The results filtered to precinct 20 should be identical to not being filtered as it is the only precinct for the primary.
    expect(filteredResultsAll.contestTallies).toStrictEqual(
      filteredResultsPrecinct.contestTallies
    )
    const filteredResultsWrongPrecinct = filterTalliesByParams(
      electionTally,
      primaryElectionSample,
      { precinctId: '21', partyId: '3' }
    )
    expect(filteredResultsWrongPrecinct.contestTallies).toMatchInlineSnapshot(`
      Array [
        Object {
          "contest": Object {
            "allowWriteIns": false,
            "candidates": Array [
              Object {
                "id": "alice",
                "name": "Alice Jones",
                "partyId": "3",
              },
              Object {
                "id": "bob",
                "name": "Bob Smith",
              },
            ],
            "districtId": "7",
            "id": "primary-constitution-head-of-party",
            "partyId": "3",
            "seats": 1,
            "section": "Franklin County",
            "title": "Head of Constitution Party",
            "type": "candidate",
          },
          "tallies": Array [
            Object {
              "option": Object {
                "id": "alice",
                "name": "Alice Jones",
                "partyId": "3",
              },
              "tally": 0,
            },
            Object {
              "option": Object {
                "id": "bob",
                "name": "Bob Smith",
              },
              "tally": 0,
            },
          ],
        },
      ]
    `)
  })

  test('can filter results by scanner and party', () => {
    const filteredResultsScanner4 = filterTalliesByParams(
      electionTally,
      primaryElectionSample,
      { scannerId: 'scanner-4', partyId: '3' }
    )
    const filteredResultsScanner5 = filterTalliesByParams(
      electionTally,
      primaryElectionSample,
      { scannerId: 'scanner-5', partyId: '3' }
    )
    expect(filteredResultsScanner4.numberOfBallotsCounted).toBe(5)
    expect(filteredResultsScanner5.numberOfBallotsCounted).toBe(6)
    expect(filteredResultsScanner4.contestTallies).toMatchInlineSnapshot(`
      Array [
        Object {
          "contest": Object {
            "allowWriteIns": false,
            "candidates": Array [
              Object {
                "id": "alice",
                "name": "Alice Jones",
                "partyId": "3",
              },
              Object {
                "id": "bob",
                "name": "Bob Smith",
              },
            ],
            "districtId": "7",
            "id": "primary-constitution-head-of-party",
            "partyId": "3",
            "seats": 1,
            "section": "Franklin County",
            "title": "Head of Constitution Party",
            "type": "candidate",
          },
          "tallies": Array [
            Object {
              "option": Object {
                "id": "alice",
                "name": "Alice Jones",
                "partyId": "3",
              },
              "tally": 2,
            },
            Object {
              "option": Object {
                "id": "bob",
                "name": "Bob Smith",
              },
              "tally": 3,
            },
          ],
        },
      ]
    `)
    expect(filteredResultsScanner5.contestTallies).toMatchInlineSnapshot(`
      Array [
        Object {
          "contest": Object {
            "allowWriteIns": false,
            "candidates": Array [
              Object {
                "id": "alice",
                "name": "Alice Jones",
                "partyId": "3",
              },
              Object {
                "id": "bob",
                "name": "Bob Smith",
              },
            ],
            "districtId": "7",
            "id": "primary-constitution-head-of-party",
            "partyId": "3",
            "seats": 1,
            "section": "Franklin County",
            "title": "Head of Constitution Party",
            "type": "candidate",
          },
          "tallies": Array [
            Object {
              "option": Object {
                "id": "alice",
                "name": "Alice Jones",
                "partyId": "3",
              },
              "tally": 3,
            },
            Object {
              "option": Object {
                "id": "bob",
                "name": "Bob Smith",
              },
              "tally": 0,
            },
          ],
        },
      ]
    `)

    const filteredResultsScanner6 = filterTalliesByParams(
      electionTally,
      primaryElectionSample,
      { scannerId: 'scanner-6', partyId: '3' }
    )
    expect(filteredResultsScanner6.numberOfBallotsCounted).toBe(0)
    expect(filteredResultsScanner6.contestTallies).toMatchInlineSnapshot(`
      Array [
        Object {
          "contest": Object {
            "allowWriteIns": false,
            "candidates": Array [
              Object {
                "id": "alice",
                "name": "Alice Jones",
                "partyId": "3",
              },
              Object {
                "id": "bob",
                "name": "Bob Smith",
              },
            ],
            "districtId": "7",
            "id": "primary-constitution-head-of-party",
            "partyId": "3",
            "seats": 1,
            "section": "Franklin County",
            "title": "Head of Constitution Party",
            "type": "candidate",
          },
          "tallies": Array [
            Object {
              "option": Object {
                "id": "alice",
                "name": "Alice Jones",
                "partyId": "3",
              },
              "tally": 0,
            },
            Object {
              "option": Object {
                "id": "bob",
                "name": "Bob Smith",
              },
              "tally": 0,
            },
          ],
        },
      ]
    `)
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
    electionTally.overallTally.contestTallyMetadata['county-commissioners']
      ?.undervotes
  ).toBe(4)

  electionTally = computeFullElectionTally(primaryElectionSample, [
    [{ ...mockCVR, 'county-commissioners': ['argent'] }],
  ])!
  expect(
    electionTally.overallTally.contestTallyMetadata['county-commissioners']
      ?.undervotes
  ).toBe(3)

  electionTally = computeFullElectionTally(primaryElectionSample, [
    [{ ...mockCVR, 'county-commissioners': ['argent', 'bainbridge'] }],
  ])!
  expect(
    electionTally.overallTally.contestTallyMetadata['county-commissioners']
      ?.undervotes
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
    electionTally.overallTally.contestTallyMetadata['county-commissioners']
      ?.undervotes
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
    electionTally.overallTally.contestTallyMetadata['county-commissioners']
      ?.undervotes
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
