import { Election } from '@votingworks/types'
import {
  electionSample,
  electionSample2WithDataFiles,
  primaryElectionSample,
  electionMultiPartyPrimaryWithDataFiles,
  electionWithMsEitherNeither,
} from '@votingworks/fixtures'

import {
  parseCVRs,
  computeFullElectionTally,
  getOvervotePairTallies,
  filterTalliesByParams,
  filterTalliesByParamsAndBatchId,
} from './votecounting'
import {
  CastVoteRecord,
  FullElectionTally,
  Tally,
  TallyCategory,
  VotingMethod,
} from '../config/types'

const electionSample2 = electionSample2WithDataFiles.electionDefinition.election

const multiPartyPrimaryElection =
  electionMultiPartyPrimaryWithDataFiles.electionDefinition.election

export function parseCVRsAndAssertSuccess(
  cvrsFileContents: string,
  election: Election
): CastVoteRecord[] {
  return Array.from(
    parseCVRs(cvrsFileContents, election),
    ({ cvr, errors }) => {
      expect({ cvr, errors }).toEqual({ cvr, errors: [] })
      return cvr
    }
  )
}

function expectAllEmptyTallies(tally: Tally) {
  expect(tally.numberOfBallotsCounted).toBe(0)
  for (const contestId in tally.contestTallies) {
    if (Object.prototype.hasOwnProperty.call(tally.contestTallies, contestId)) {
      const contestTally = tally.contestTallies[contestId]!
      for (const contestTallyTally of Object.values(contestTally.tallies)) {
        expect(contestTallyTally!.tally).toBe(0)
      }
      expect(contestTally.metadata).toStrictEqual({
        undervotes: 0,
        overvotes: 0,
        ballots: 0,
      })
    }
  }
}

test('tabulating a set of CVRs gives expected output', async () => {
  // get the election
  const election = electionSample2

  // get the CVRs
  const cvrsFileContents = electionSample2WithDataFiles.cvrDataStandard1
  const castVoteRecords = parseCVRsAndAssertSuccess(cvrsFileContents, election)

  // tabulate it
  const fullTally = computeFullElectionTally(election, [castVoteRecords])
  expect(fullTally.overallTally.numberOfBallotsCounted).toBe(10001)
  expect(fullTally.overallTally.contestTallies).toMatchSnapshot()
  expect(fullTally.overallTally.ballotCountsByVotingMethod).toMatchObject({
    absentee: 672,
    standard: 474,
    unknown: 8855,
  })

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
  const election = electionSample2

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
    election = electionSample2

    // get the CVRs
    const cvrsFileContents = electionSample2WithDataFiles.cvrDataStandard1
    const castVoteRecords = parseCVRsAndAssertSuccess(
      cvrsFileContents,
      election
    )

    // tabulate it
    electionTally = computeFullElectionTally(election, [castVoteRecords])
  })

  it('can filter by precinct', () => {
    const expectedPrecinctResults = {
      '23': {
        totalBallots: 2475,
        ballotCountsByVotingMethod: {
          [VotingMethod.Absentee]: 176,
          [VotingMethod.Precinct]: 119,
          [VotingMethod.Unknown]: 2180,
        },
      },
      '20': {
        totalBallots: 2478,
        ballotCountsByVotingMethod: {
          [VotingMethod.Absentee]: 174,
          [VotingMethod.Precinct]: 124,
          [VotingMethod.Unknown]: 2180,
        },
      },
      '21': {
        totalBallots: 5048,
        ballotCountsByVotingMethod: {
          [VotingMethod.Absentee]: 322,
          [VotingMethod.Precinct]: 231,
          [VotingMethod.Unknown]: 4495,
        },
      },
    }
    for (const [
      precinctId,
      { totalBallots, ballotCountsByVotingMethod },
    ] of Object.entries(expectedPrecinctResults)) {
      const filteredResults = filterTalliesByParams(electionTally, election, {
        precinctId,
      })
      expect(filteredResults.numberOfBallotsCounted).toBe(totalBallots)
      expect(filteredResults.ballotCountsByVotingMethod).toMatchObject(
        ballotCountsByVotingMethod
      )
      expect(filteredResults.contestTallies).toMatchSnapshot()
    }
  })

  it('can filter by scanner', () => {
    const expectedScannerResults = {
      'scanner-1': {
        totalBallots: 1008,
        ballotCountsByVotingMethod: {
          [VotingMethod.Absentee]: 64,
          [VotingMethod.Precinct]: 65,
          [VotingMethod.Unknown]: 879,
        },
      },
      'scanner-10': {
        totalBallots: 1022,
        ballotCountsByVotingMethod: {
          [VotingMethod.Absentee]: 68,
          [VotingMethod.Precinct]: 53,
          [VotingMethod.Unknown]: 901,
        },
      },
      'scanner-2': {
        totalBallots: 1015,
        ballotCountsByVotingMethod: {
          [VotingMethod.Absentee]: 73,
          [VotingMethod.Precinct]: 44,
          [VotingMethod.Unknown]: 898,
        },
      },
      'scanner-3': {
        totalBallots: 1029,
        ballotCountsByVotingMethod: {
          [VotingMethod.Absentee]: 67,
          [VotingMethod.Precinct]: 46,
          [VotingMethod.Unknown]: 916,
        },
      },
      'scanner-4': {
        totalBallots: 1039,
        ballotCountsByVotingMethod: {
          [VotingMethod.Absentee]: 63,
          [VotingMethod.Precinct]: 53,
          [VotingMethod.Unknown]: 923,
        },
      },
      'scanner-5': {
        totalBallots: 962,
        ballotCountsByVotingMethod: {
          [VotingMethod.Absentee]: 58,
          [VotingMethod.Precinct]: 46,
          [VotingMethod.Unknown]: 858,
        },
      },
      'scanner-6': {
        totalBallots: 973,
        ballotCountsByVotingMethod: {
          [VotingMethod.Absentee]: 74,
          [VotingMethod.Precinct]: 37,
          [VotingMethod.Unknown]: 862,
        },
      },
      'scanner-7': {
        totalBallots: 938,
        ballotCountsByVotingMethod: {
          [VotingMethod.Absentee]: 54,
          [VotingMethod.Precinct]: 44,
          [VotingMethod.Unknown]: 840,
        },
      },
      'scanner-8': {
        totalBallots: 977,
        ballotCountsByVotingMethod: {
          [VotingMethod.Absentee]: 80,
          [VotingMethod.Precinct]: 45,
          [VotingMethod.Unknown]: 852,
        },
      },
      'scanner-9': {
        totalBallots: 1038,
        ballotCountsByVotingMethod: {
          [VotingMethod.Absentee]: 71,
          [VotingMethod.Precinct]: 41,
          [VotingMethod.Unknown]: 926,
        },
      },
    }
    for (const [
      scannerId,
      { totalBallots, ballotCountsByVotingMethod },
    ] of Object.entries(expectedScannerResults)) {
      const filteredResults = filterTalliesByParams(electionTally, election, {
        scannerId,
      })
      expect(filteredResults.numberOfBallotsCounted).toBe(totalBallots)
      expect(filteredResults.contestTallies).toMatchSnapshot()
      expect(filteredResults.ballotCountsByVotingMethod).toMatchObject(
        ballotCountsByVotingMethod
      )
    }
  })

  test('can filtere by precinct and scanner', () => {
    const filteredResults = filterTalliesByParams(electionTally, election, {
      precinctId: '23',
      scannerId: 'scanner-5',
    })
    expect(filteredResults.numberOfBallotsCounted).toBe(227)
    expect(filteredResults.contestTallies).toMatchSnapshot()
    expect(filteredResults.ballotCountsByVotingMethod).toMatchObject({
      [VotingMethod.Absentee]: 18,
      [VotingMethod.Precinct]: 6,
      [VotingMethod.Unknown]: 203,
    })
  })

  test('can filter by voting method', () => {
    const absenteeResults = filterTalliesByParams(electionTally, election, {
      votingMethod: VotingMethod.Absentee,
    })
    expect(absenteeResults.numberOfBallotsCounted).toBe(672)
    expect(absenteeResults.ballotCountsByVotingMethod).toMatchObject({
      [VotingMethod.Absentee]: 672,
      [VotingMethod.Precinct]: 0,
      [VotingMethod.Unknown]: 0,
    })

    const precinctResults = filterTalliesByParams(electionTally, election, {
      votingMethod: VotingMethod.Precinct,
    })
    expect(precinctResults.numberOfBallotsCounted).toBe(474)
    expect(precinctResults.ballotCountsByVotingMethod).toMatchObject({
      [VotingMethod.Absentee]: 0,
      [VotingMethod.Precinct]: 474,
      [VotingMethod.Unknown]: 0,
    })

    const unknownResults = filterTalliesByParams(electionTally, election, {
      votingMethod: VotingMethod.Unknown,
    })
    expect(unknownResults.numberOfBallotsCounted).toBe(8855)
    expect(unknownResults.ballotCountsByVotingMethod).toMatchObject({
      [VotingMethod.Absentee]: 0,
      [VotingMethod.Precinct]: 0,
      [VotingMethod.Unknown]: 8855,
    })
  })

  test('can filter by voting method precinct and scanner', () => {
    const filteredResults = filterTalliesByParams(electionTally, election, {
      precinctId: '23',
      scannerId: 'scanner-5',
      votingMethod: VotingMethod.Absentee,
    })
    expect(filteredResults.numberOfBallotsCounted).toBe(18)
    expect(filteredResults.ballotCountsByVotingMethod).toMatchObject({
      [VotingMethod.Absentee]: 18,
      [VotingMethod.Precinct]: 0,
      [VotingMethod.Unknown]: 0,
    })
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
      ballotCountsByVotingMethod: {
        [VotingMethod.Absentee]: 342,
        [VotingMethod.Precinct]: 0,
        [VotingMethod.Unknown]: 1368,
      },
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
      ballotCountsByVotingMethod: {
        [VotingMethod.Absentee]: 93,
        [VotingMethod.Precinct]: 292,
        [VotingMethod.Unknown]: 1715,
      },
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
      ballotCountsByVotingMethod: {
        [VotingMethod.Absentee]: 33,
        [VotingMethod.Precinct]: 18,
        [VotingMethod.Unknown]: 669,
      },
    },
  ]

  beforeEach(async () => {
    // get the CVRs
    const cvrsFileContents = electionMultiPartyPrimaryWithDataFiles.cvrData
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
    expect(electionTally.overallTally.ballotCountsByVotingMethod).toMatchObject(
      {
        [VotingMethod.Absentee]: 468,
        [VotingMethod.Precinct]: 310,
        [VotingMethod.Unknown]: 3752,
      }
    )

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
      expect(filteredResults.ballotCountsByVotingMethod).toMatchObject(
        testcase.ballotCountsByVotingMethod
      )
      // Filtering by party just filters down the contests in contestTallies
      expect(
        Object.values(filteredResults.contestTallies).map((c) => {
          return {
            contestId: c!.contest.id,
            tallies: c!.tallies,
            metadata: c!.metadata,
          }
        })
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

  test('can filter results by batch', () => {
    const expectedBatchInformation = [
      {
        batchId: '1234-1',
        label: 'Batch 1',
        scanner: 'scanner-1',
        numberOfBallots: 752,
      },
      {
        batchId: '1234-2',
        label: 'Batch 2',
        scanner: 'scanner-1',
        numberOfBallots: 758,
      },
      {
        batchId: '1234-3',
        label: 'Batch 1',
        scanner: 'scanner-2',
        numberOfBallots: 1510,
      },
      {
        batchId: '1234-4',
        label: 'Batch 1',
        scanner: 'scanner-3',
        numberOfBallots: 1510,
      },
    ]
    for (const testcase of expectedBatchInformation) {
      const typedFilteredResults = filterTalliesByParamsAndBatchId(
        electionTally,
        multiPartyPrimaryElection,
        testcase.batchId,
        {}
      )
      const filteredResults = filterTalliesByParams(
        electionTally,
        multiPartyPrimaryElection,
        { batchId: testcase.batchId }
      )
      expect(filteredResults.numberOfBallotsCounted).toBe(
        testcase.numberOfBallots
      )
      expect(typedFilteredResults.numberOfBallotsCounted).toBe(
        testcase.numberOfBallots
      )
      expect(filteredResults.contestTallies).toEqual(
        typedFilteredResults.contestTallies
      )
      expect(typedFilteredResults.batchLabel).toBe(testcase.label)
      expect(typedFilteredResults.scannerIds).toEqual([testcase.scanner])
    }
    // Since there is only one batch for scanner-2 the results for the scanner and batch should be identical.
    const batch3Results = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { batchId: '1234-3' }
    )
    const scanner2Results = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { scannerId: 'scanner-2' }
    )
    expect(batch3Results.contestTallies).toEqual(scanner2Results.contestTallies)
    const scanner2Batch3Results = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { batchId: '1234-3', scannerId: 'scanner-2' }
    )
    expect(scanner2Batch3Results.contestTallies).toEqual(
      scanner2Results.contestTallies
    )
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
    expect(filterParty5Precinct1.ballotCountsByVotingMethod).toMatchObject({
      [VotingMethod.Absentee]: 0,
      [VotingMethod.Precinct]: 18,
      [VotingMethod.Unknown]: 282,
    })
    expect(
      Object.values(filterParty5Precinct1.contestTallies).map((c) => {
        return {
          contestId: c!.contest.id,
          tallies: c!.tallies,
          metadata: c!.metadata,
        }
      })
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
    expect(filterParty5Precinct5.ballotCountsByVotingMethod).toMatchObject({
      [VotingMethod.Absentee]: 33,
      [VotingMethod.Precinct]: 0,
      [VotingMethod.Unknown]: 387,
    })
    expect(
      Object.values(filterParty5Precinct5.contestTallies).map((c) => {
        return {
          contestId: c!.contest.id,
          tallies: c!.tallies,
          metadata: c!.metadata,
        }
      })
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
          tallies: c!.tallies,
          metadata: c!.metadata,
        }
      })
    ).toMatchSnapshot()

    expect(filteredResultsScanner1.numberOfBallotsCounted).toBe(570)
    expect(filteredResultsScanner1.ballotCountsByVotingMethod).toMatchObject({
      [VotingMethod.Absentee]: 114,
      [VotingMethod.Precinct]: 0,
      [VotingMethod.Unknown]: 456,
    })

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

  test('can filter by voting method and party', () => {
    const filteredResultsLibertyAbsentee = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { votingMethod: VotingMethod.Absentee, partyId: '0' }
    )
    expect(filteredResultsLibertyAbsentee.numberOfBallotsCounted).toBe(342)
    expect(
      filteredResultsLibertyAbsentee.ballotCountsByVotingMethod
    ).toMatchObject({
      [VotingMethod.Absentee]: 342,
      [VotingMethod.Precinct]: 0,
      [VotingMethod.Unknown]: 0,
    })

    const filteredResultsLibertyPrecinct = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { votingMethod: VotingMethod.Precinct, partyId: '0' }
    )
    expect(filteredResultsLibertyPrecinct.numberOfBallotsCounted).toBe(0)
    expect(
      filteredResultsLibertyPrecinct.ballotCountsByVotingMethod
    ).toMatchObject({
      [VotingMethod.Absentee]: 0,
      [VotingMethod.Precinct]: 0,
      [VotingMethod.Unknown]: 0,
    })

    const filteredResultsConstitutionPrecinct = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { votingMethod: VotingMethod.Precinct, partyId: '3' }
    )
    expect(filteredResultsConstitutionPrecinct.numberOfBallotsCounted).toBe(292)
    expect(
      filteredResultsConstitutionPrecinct.ballotCountsByVotingMethod
    ).toMatchObject({
      [VotingMethod.Absentee]: 0,
      [VotingMethod.Precinct]: 292,
      [VotingMethod.Unknown]: 0,
    })

    const filteredResultsConstitutionAbsentee = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { votingMethod: VotingMethod.Absentee, partyId: '3' }
    )
    expect(filteredResultsConstitutionAbsentee.numberOfBallotsCounted).toBe(93)
    expect(
      filteredResultsConstitutionAbsentee.ballotCountsByVotingMethod
    ).toMatchObject({
      [VotingMethod.Absentee]: 93,
      [VotingMethod.Precinct]: 0,
      [VotingMethod.Unknown]: 0,
    })

    const filteredResultsUnknownAbsentee = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { votingMethod: VotingMethod.Unknown, partyId: '0' }
    )
    expect(filteredResultsUnknownAbsentee.numberOfBallotsCounted).toBe(1368)
    expect(
      filteredResultsUnknownAbsentee.ballotCountsByVotingMethod
    ).toMatchObject({
      [VotingMethod.Absentee]: 0,
      [VotingMethod.Precinct]: 0,
      [VotingMethod.Unknown]: 1368,
    })
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
    _batchId: '1',
    _batchLabel: 'Batch 1',
    'county-commissioners': [],
  }

  // tabulate it
  let electionTally = computeFullElectionTally(primaryElectionSample, [
    [mockCVR],
  ])!

  // The county commissioners race has 4 seats. Each vote less than 4 should be counted
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

test('overvotes counted in n of m contest properly', () => {
  // Create mock CVR data
  const mockCVR: CastVoteRecord = {
    _ballotId: 'abc',
    _ballotStyleId: '12D',
    _ballotType: 'standard',
    _precinctId: '21',
    _testBallot: false,
    _scannerId: '1',
    _batchId: '1',
    _batchLabel: 'Batch 1',
    'county-commissioners': [
      'argent',
      'witherspoonsmithson',
      'bainbridge',
      'hennessey',
    ],
  }

  // tabulate it
  let electionTally = computeFullElectionTally(primaryElectionSample, [
    [mockCVR],
  ])!

  expect(
    electionTally.overallTally.contestTallies['county-commissioners']?.metadata
      .overvotes
  ).toBe(0)

  electionTally = computeFullElectionTally(primaryElectionSample, [
    [
      {
        ...mockCVR,
        'county-commissioners': [
          'argent',
          'witherspoonsmithson',
          'bainbridge',
          'hennessey',
          'savoy',
        ],
      },
    ],
  ])!
  // The county commissioners race has 4 seats. A ballot with more than 4 votes should have
  // 4 overvotes.
  expect(
    electionTally.overallTally.contestTallies['county-commissioners']?.metadata
      .overvotes
  ).toBe(4)

  electionTally = computeFullElectionTally(primaryElectionSample, [
    [
      {
        ...mockCVR,
        'county-commissioners': [
          'argent',
          'witherspoonsmithson',
          'bainbridge',
          'hennessey',
          'savoy',
          'tawa',
          'rangel',
        ],
      },
    ],
  ])!
  expect(
    electionTally.overallTally.contestTallies['county-commissioners']?.metadata
      .overvotes
  ).toBe(4)
})

test('overvotes counted in single seat contest properly', () => {
  // Create mock CVR data
  const mockCVR: CastVoteRecord = {
    _ballotId: 'abc',
    _ballotStyleId: '12D',
    _ballotType: 'standard',
    _precinctId: '21',
    _testBallot: false,
    _scannerId: '1',
    _batchId: '1',
    _batchLabel: 'Batch 1',
    'lieutenant-governor': ['norberg'],
  }

  // tabulate it
  let electionTally = computeFullElectionTally(primaryElectionSample, [
    [mockCVR],
  ])!
  expect(
    electionTally.overallTally.contestTallies['lieutenant-governor']?.metadata
      .overvotes
  ).toBe(0)

  electionTally = computeFullElectionTally(primaryElectionSample, [
    [
      {
        ...mockCVR,
        'lieutenant-governor': ['norberg', 'parks'],
      },
    ],
  ])!

  // The lieutenant governor race has 1 seat. A ballot with more than 1 votes should count
  // as 1 overvote.
  expect(
    electionTally.overallTally.contestTallies['lieutenant-governor']?.metadata
      .overvotes
  ).toBe(1)

  electionTally = computeFullElectionTally(primaryElectionSample, [
    [
      {
        ...mockCVR,
        'lieutenant-governor': [
          'norberg',
          'parks',
          'garcia',
          'qualey',
          'hovis',
        ],
      },
    ],
  ])!
  // There should still only be 1 overvote despite voting for 5 candidates.
  expect(
    electionTally.overallTally.contestTallies['lieutenant-governor']?.metadata
      .overvotes
  ).toBe(1)
})

test('overvote report', async () => {
  // get the election
  const election = electionSample2

  // get the CVRs
  const cvrsFileContents = electionSample2WithDataFiles.cvrDataStandard1
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
    _batchId: '1',
    _batchLabel: 'Batch 1',
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
    _batchId: '1',
    _batchLabel: 'Batch 1',
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
    _batchId: '1',
    _batchLabel: 'Batch 1',
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

test('parsing CVRs flags when a candidate ID in a CVR is not present in the election definition, and is not a valid write in', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    _testBallot: false,
    president: ['write-in-1', 'not-a-candidate'], // Candidate contest with no write ins allowed
    _batchId: '1',
    _batchLabel: 'Batch 1',
    'county-commissioners': ['write-in-1', 'not-a-candidate'], // Candidate contest with write ins allowed
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "Candidate ID 'write-in-1' in CVR is not a valid candidate choice for contest: 'president'",
        "Candidate ID 'not-a-candidate' in CVR is not a valid candidate choice for contest: 'president'",
        "Candidate ID 'not-a-candidate' in CVR is not a valid candidate choice for contest: 'county-commissioners'",
        // No error for write in on comissioners race
      ],
      lineNumber: 1,
    },
  ])

  const cvr2: CastVoteRecord = {
    _ballotStyleId: '4',
    _ballotType: 'standard',
    _precinctId: '6538',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    _testBallot: false,
    _batchId: '1',
    _batchLabel: 'Batch 1',
    '750000015': ['yes', 'not-a-choice'], // Either Neither Contest with illegal voting option
    '750000016': ['not-a-choice'], // Pick One from either neither contest
    '750000018': ['not-a-choice', 'no'], // Yes No Contest
  }
  expect([
    ...parseCVRs(JSON.stringify(cvr2), electionWithMsEitherNeither),
  ]).toEqual([
    {
      cvr: cvr2,
      errors: [
        "Choice 'not-a-choice' in CVR is not a valid contest choice for yes no contest: 750000015",
        "Choice 'not-a-choice' in CVR is not a valid contest choice for yes no contest: 750000016",
        "Choice 'not-a-choice' in CVR is not a valid contest choice for yes no contest: 750000018",
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
    _batchId: '1',
    _batchLabel: 'Batch 1',
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
    _batchId: '1',
    _batchLabel: 'Batch 1',
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
    _batchId: '1',
    _batchLabel: 'Batch 1',
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
    _batchId: '1',
    _batchLabel: 'Batch 1',
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
    _batchId: '1',
    _batchLabel: 'Batch 1',
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
    _batchId: '1',
    _batchLabel: 'Batch 1',
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
    _ballotType: 'standard',
    _precinctId: '23',
    _ballotId: 'abc',
    // @ts-expect-error - false instead of a string
    _scannerId: false,
    _batchId: '1',
    _batchLabel: 'Batch 1',
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

test('parsing CVRs flags when batch ID is not a string', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    // @ts-expect-error - false instead of a string
    _batchId: false,
    _batchLabel: 'Batch 1',
    _testBallot: false,
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "Batch ID in CVR must be a string, got 'false' (boolean, not string)",
      ],
      lineNumber: 1,
    },
  ])
})

test('parsing CVRs flags when batch label is not a string', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    _batchId: '1',
    // @ts-expect-error - false instead of a string
    _batchLabel: false,
    _testBallot: false,
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "Batch label in CVR must be a string, got 'false' (boolean, not string)",
      ],
      lineNumber: 1,
    },
  ])
})

test('parsing CVRs flags when locale is not well formed', () => {
  // @ts-expect-error - object missing properties
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    _testBallot: false,
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [],
      lineNumber: 1,
    },
  ])
})

test('parsing CVRs with different batch labels in the same id does not error', () => {
  const cvr1: CastVoteRecord = {
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    _batchId: '1',
    _batchLabel: 'Batch 1',
    _testBallot: false,
  }
  const cvr2: CastVoteRecord = {
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    _batchId: '1',
    _batchLabel: 'Batch 1',
    _testBallot: false,
  }
  expect([
    ...parseCVRs(
      `${JSON.stringify(cvr1)}\n${JSON.stringify(cvr2)}`,
      electionSample
    ),
  ]).toEqual([
    {
      cvr: cvr1,
      errors: [],
      lineNumber: 1,
    },
    {
      cvr: cvr2,
      errors: [],
      lineNumber: 2,
    },
  ])
})
