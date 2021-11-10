import { Election, FullElectionTally, TallyCategory } from '@votingworks/types';
import {
  electionSample,
  electionSample2WithDataFiles,
  primaryElectionSample,
  electionWithMsEitherNeither,
  electionMultiPartyPrimaryWithDataFiles,
  multiPartyPrimaryElection,
} from '@votingworks/fixtures';

import { filterTalliesByParams } from '@votingworks/utils/src';
import {
  parseCvrs,
  computeFullElectionTally,
  getOvervotePairTallies,
  filterTalliesByParamsAndBatchId,
} from './votecounting';
import { CastVoteRecord } from '../config/types';

const electionSample2 =
  electionSample2WithDataFiles.electionDefinition.election;

export function parseCvrsAndAssertSuccess(
  cvrsFileContents: string,
  election: Election
): CastVoteRecord[] {
  return [...parseCvrs(cvrsFileContents, election)].map(({ cvr, errors }) => {
    expect({ cvr, errors }).toEqual({ cvr, errors: [] });
    return cvr;
  });
}

test('tabulating a set of CVRs gives expected output', async () => {
  // get the election
  const election = electionSample2;

  // get the CVRs
  const cvrsFileContents = electionSample2WithDataFiles.cvrDataStandard1;
  const castVoteRecords = parseCvrsAndAssertSuccess(cvrsFileContents, election);

  // tabulate it
  const fullTally = computeFullElectionTally(election, [castVoteRecords]);
  expect(fullTally.overallTally.numberOfBallotsCounted).toBe(10001);
  expect(fullTally.overallTally.contestTallies).toMatchSnapshot();
  expect(fullTally.overallTally.ballotCountsByVotingMethod).toMatchObject({
    absentee: 672,
    standard: 474,
    unknown: 8855,
  });

  // some specific tallies checked by hand

  // - Jackie Chan, 1380 bubbles, of which 8 are overvotes --> 1372
  const presidentTallies = fullTally.overallTally.contestTallies.president!;
  const jackieChanTally = presidentTallies.tallies['jackie-chan']!;
  expect(jackieChanTally.tally).toBe(1372);

  // - Neil Armstrong, 2207 bubbles, of which 10 are overvotes --> 2197
  const repDistrict18Tallies = fullTally.overallTally.contestTallies[
    'representative-district-18'
  ]!;
  const neilArmstrongTally = repDistrict18Tallies.tallies['neil-armstrong']!;
  expect(neilArmstrongTally.tally).toBe(2197);

  // sum up all the write-ins across all questions
  // 262 bubbles filled out, of which 2 are overvotes --> 260 write-ins
  const candidateTallies = Object.values(
    fullTally.overallTally.contestTallies
  ).filter((contestTally) => contestTally!.contest.type === 'candidate');

  const numWriteIns = candidateTallies.reduce(
    (overallSum, contestTally) =>
      overallSum + contestTally!.tallies['__write-in']!.tally,
    0
  );

  expect(numWriteIns).toBe(260);
});

test('computeFullTally with no results should produce empty tally objects with contests', async () => {
  const election = electionSample2;

  const fullTally = computeFullElectionTally(election, []);
  expect(fullTally.overallTally.numberOfBallotsCounted).toBe(0);
  expect(Object.keys(fullTally.overallTally.contestTallies).length).toBe(
    election.contests.length
  );
  const precinctTallies = fullTally.resultsByCategory.get(
    TallyCategory.Precinct
  );
  expect(precinctTallies).toBeDefined();
  for (const precinct of election.precincts) {
    const precinctTally = precinctTallies![precinct.id];
    expect(precinctTally).toBeDefined();
    expect(precinctTally!.numberOfBallotsCounted).toBe(0);
    expect(Object.keys(precinctTally!.contestTallies).length).toBe(
      election.contests.length
    );
  }
});

test('undervotes counted in n of m contest properly', () => {
  // Create mock CVR data
  const mockCvr: CastVoteRecord = {
    _ballotId: 'abc',
    _ballotStyleId: '12D',
    _ballotType: 'standard',
    _precinctId: '21',
    _testBallot: false,
    _scannerId: '1',
    _batchId: '1',
    _batchLabel: 'Batch 1',
    'county-commissioners': [],
  };

  // tabulate it
  let electionTally = computeFullElectionTally(primaryElectionSample, [
    [mockCvr],
  ])!;

  // The county commissioners race has 4 seats. Each vote less than 4 should be counted
  // as an additional undervote.
  expect(
    electionTally.overallTally.contestTallies['county-commissioners']?.metadata
      .undervotes
  ).toBe(4);

  electionTally = computeFullElectionTally(primaryElectionSample, [
    [{ ...mockCvr, 'county-commissioners': ['argent'] }],
  ])!;
  expect(
    electionTally.overallTally.contestTallies['county-commissioners']?.metadata
      .undervotes
  ).toBe(3);

  electionTally = computeFullElectionTally(primaryElectionSample, [
    [{ ...mockCvr, 'county-commissioners': ['argent', 'bainbridge'] }],
  ])!;
  expect(
    electionTally.overallTally.contestTallies['county-commissioners']?.metadata
      .undervotes
  ).toBe(2);

  electionTally = computeFullElectionTally(primaryElectionSample, [
    [
      {
        ...mockCvr,
        'county-commissioners': ['argent', 'bainbridge', 'hennessey'],
      },
    ],
  ])!;
  expect(
    electionTally.overallTally.contestTallies['county-commissioners']?.metadata
      .undervotes
  ).toBe(1);

  electionTally = computeFullElectionTally(primaryElectionSample, [
    [
      {
        ...mockCvr,
        'county-commissioners': ['argent', 'bainbridge', 'hennessey', 'savoy'],
      },
    ],
  ])!;
  expect(
    electionTally.overallTally.contestTallies['county-commissioners']?.metadata
      .undervotes
  ).toBe(0);
});

test('overvotes counted in n of m contest properly', () => {
  // Create mock CVR data
  const mockCvr: CastVoteRecord = {
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
  };

  // tabulate it
  let electionTally = computeFullElectionTally(primaryElectionSample, [
    [mockCvr],
  ])!;

  expect(
    electionTally.overallTally.contestTallies['county-commissioners']?.metadata
      .overvotes
  ).toBe(0);

  electionTally = computeFullElectionTally(primaryElectionSample, [
    [
      {
        ...mockCvr,
        'county-commissioners': [
          'argent',
          'witherspoonsmithson',
          'bainbridge',
          'hennessey',
          'savoy',
        ],
      },
    ],
  ])!;
  // The county commissioners race has 4 seats. A ballot with more than 4 votes should have
  // 4 overvotes.
  expect(
    electionTally.overallTally.contestTallies['county-commissioners']?.metadata
      .overvotes
  ).toBe(4);

  electionTally = computeFullElectionTally(primaryElectionSample, [
    [
      {
        ...mockCvr,
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
  ])!;
  expect(
    electionTally.overallTally.contestTallies['county-commissioners']?.metadata
      .overvotes
  ).toBe(4);
});

test('overvotes counted in single seat contest properly', () => {
  // Create mock CVR data
  const mockCvr: CastVoteRecord = {
    _ballotId: 'abc',
    _ballotStyleId: '12D',
    _ballotType: 'standard',
    _precinctId: '21',
    _testBallot: false,
    _scannerId: '1',
    _batchId: '1',
    _batchLabel: 'Batch 1',
    'lieutenant-governor': ['norberg'],
  };

  // tabulate it
  let electionTally = computeFullElectionTally(primaryElectionSample, [
    [mockCvr],
  ])!;
  expect(
    electionTally.overallTally.contestTallies['lieutenant-governor']?.metadata
      .overvotes
  ).toBe(0);

  electionTally = computeFullElectionTally(primaryElectionSample, [
    [
      {
        ...mockCvr,
        'lieutenant-governor': ['norberg', 'parks'],
      },
    ],
  ])!;

  // The lieutenant governor race has 1 seat. A ballot with more than 1 votes should count
  // as 1 overvote.
  expect(
    electionTally.overallTally.contestTallies['lieutenant-governor']?.metadata
      .overvotes
  ).toBe(1);

  electionTally = computeFullElectionTally(primaryElectionSample, [
    [
      {
        ...mockCvr,
        'lieutenant-governor': [
          'norberg',
          'parks',
          'garcia',
          'qualey',
          'hovis',
        ],
      },
    ],
  ])!;
  // There should still only be 1 overvote despite voting for 5 candidates.
  expect(
    electionTally.overallTally.contestTallies['lieutenant-governor']?.metadata
      .overvotes
  ).toBe(1);
});

test('overvote report', async () => {
  // get the election
  const election = electionSample2;

  // get the CVRs
  const cvrsFileContents = electionSample2WithDataFiles.cvrDataStandard1;
  const castVoteRecords = parseCvrsAndAssertSuccess(cvrsFileContents, election);

  const pairTallies = getOvervotePairTallies({ election, castVoteRecords });
  expect(pairTallies).toMatchSnapshot();
});

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
  };
  expect([...parseCvrs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: ["Precinct 'not real' in CVR is not in the election definition"],
      lineNumber: 1,
    },
  ]);
});

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
  };
  expect([...parseCvrs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: ["Ballot style '123' in CVR is not in the election definition"],
      lineNumber: 1,
    },
  ]);
});

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
  };
  expect([...parseCvrs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "Contest 'not a contest' in CVR is not in the election definition or is not a valid contest for ballot style '12'",
      ],
      lineNumber: 1,
    },
  ]);
});

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
  };
  expect([...parseCvrs(JSON.stringify(cvr), electionSample)]).toEqual([
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
  ]);

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
  };
  expect([
    ...parseCvrs(JSON.stringify(cvr2), electionWithMsEitherNeither),
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
  ]);
});

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
  };
  expect([...parseCvrs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "CVR test ballot flag must be true or false, got 'false' (string, not boolean)",
      ],
      lineNumber: 1,
    },
  ]);
});

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
  };
  expect([...parseCvrs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "Page number in CVR must be a number if it is set, got '99' (string, not number)",
      ],
      lineNumber: 1,
    },
  ]);
});

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
  };
  expect([...parseCvrs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "Page numbers in CVR must be an array of number if it is set, got '99' (number, not an array of numbers)",
      ],
      lineNumber: 1,
    },
  ]);
});

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
  };
  expect([...parseCvrs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        'Page number in CVR must be either _pageNumber, or _pageNumbers, but cannot be both.',
      ],
      lineNumber: 1,
    },
  ]);
});

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
  };
  expect([...parseCvrs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [],
      lineNumber: 1,
    },
  ]);
});

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
  };
  expect([...parseCvrs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "Ballot ID in CVR must be a string, got '44' (number, not string)",
      ],
      lineNumber: 1,
    },
  ]);
});

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
  };
  expect([...parseCvrs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "Scanner ID in CVR must be a string, got 'false' (boolean, not string)",
      ],
      lineNumber: 1,
    },
  ]);
});

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
  };
  expect([...parseCvrs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "Batch ID in CVR must be a string, got 'false' (boolean, not string)",
      ],
      lineNumber: 1,
    },
  ]);
});

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
  };
  expect([...parseCvrs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "Batch label in CVR must be a string, got 'false' (boolean, not string)",
      ],
      lineNumber: 1,
    },
  ]);
});

test('parsing CVRs flags when locale is not well formed', () => {
  // @ts-expect-error - object missing properties
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    _testBallot: false,
  };
  expect([...parseCvrs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [],
      lineNumber: 1,
    },
  ]);
});

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
  };
  const cvr2: CastVoteRecord = {
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    _batchId: '1',
    _batchLabel: 'Batch 1',
    _testBallot: false,
  };
  expect([
    ...parseCvrs(
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
  ]);
});

describe('filterTalliesByParams in a primary election', () => {
  let electionTally: FullElectionTally;

  beforeEach(async () => {
    // get the CVRs
    const cvrsFileContents = electionMultiPartyPrimaryWithDataFiles.cvrData;
    const castVoteRecords = parseCvrsAndAssertSuccess(
      cvrsFileContents,
      electionMultiPartyPrimaryWithDataFiles.electionDefinition.election
    );

    // tabulate it
    electionTally = computeFullElectionTally(multiPartyPrimaryElection, [
      castVoteRecords,
    ]);
  });

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
    ];
    for (const testcase of expectedBatchInformation) {
      const typedFilteredResults = filterTalliesByParamsAndBatchId(
        electionTally,
        multiPartyPrimaryElection,
        testcase.batchId,
        {}
      );
      const filteredResults = filterTalliesByParams(
        electionTally,
        multiPartyPrimaryElection,
        { batchId: testcase.batchId }
      );
      expect(filteredResults.numberOfBallotsCounted).toBe(
        testcase.numberOfBallots
      );
      expect(typedFilteredResults.numberOfBallotsCounted).toBe(
        testcase.numberOfBallots
      );
      expect(filteredResults.contestTallies).toEqual(
        typedFilteredResults.contestTallies
      );
      expect(typedFilteredResults.batchLabel).toBe(testcase.label);
      expect(typedFilteredResults.scannerIds).toEqual([testcase.scanner]);
    }
    // Since there is only one batch for scanner-2 the results for the scanner and batch should be identical.
    const batch3Results = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { batchId: '1234-3' }
    );
    const scanner2Results = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { scannerId: 'scanner-2' }
    );
    expect(batch3Results.contestTallies).toEqual(
      scanner2Results.contestTallies
    );
    const scanner2Batch3Results = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { batchId: '1234-3', scannerId: 'scanner-2' }
    );
    expect(scanner2Batch3Results.contestTallies).toEqual(
      scanner2Results.contestTallies
    );
  });
});
