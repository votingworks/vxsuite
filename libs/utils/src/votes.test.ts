import {
  electionMultiPartyPrimaryWithDataFiles,
  electionSample,
  electionSample2,
  electionSample2WithDataFiles,
  electionWithMsEitherNeither,
} from '@votingworks/fixtures';
import {
  BallotStyle,
  CandidateContest,
  CastVoteRecord,
  Election,
  FullElectionTally,
  Party,
  Tally,
  TallyCategory,
  VotingMethod,
  writeInCandidate,
  YesNoContest,
} from '@votingworks/types';
import { strict as assert } from 'assert';
import {
  calculateTallyForCastVoteRecords,
  filterTalliesByParty,
  getEmptyTally,
} from '.';
import { find } from './find';
import {
  getSingleYesNoVote,
  normalizeWriteInId,
  buildVoteFromCvr,
  getContestVoteOptionsForYesNoContest,
  getContestVoteOptionsForCandidateContest,
  tallyVotesByContest,
  filterTalliesByParams,
  computeTallyWithPrecomputedCategories,
  getPartyIdForCvr,
} from './votes';

const multiPartyPrimaryElection =
  electionMultiPartyPrimaryWithDataFiles.electionDefinition.election;

export function parseCvrs(cvrsFileContents: string): CastVoteRecord[] {
  const lines = cvrsFileContents.split('\n');
  return lines.flatMap((line) =>
    line.length > 0 ? (JSON.parse(line) as CastVoteRecord) : []
  );
}

function expectAllEmptyTallies(tally: Tally) {
  expect(tally.numberOfBallotsCounted).toBe(0);
  for (const contestId of Object.keys(tally.contestTallies)) {
    const contestTally = tally.contestTallies[contestId]!;
    for (const contestTallyTally of Object.values(contestTally.tallies)) {
      expect(contestTallyTally?.tally).toBe(0);
    }
    expect(contestTally.metadata).toStrictEqual({
      undervotes: 0,
      overvotes: 0,
      ballots: 0,
    });
  }
}

test('getContestVoteOptionsForYesNoContest', () => {
  expect(
    getContestVoteOptionsForYesNoContest(
      find(
        electionWithMsEitherNeither.contests,
        (c): c is YesNoContest => c.type === 'yesno'
      )
    )
  ).toEqual(['yes', 'no']);
});

test('getContestVoteOptionsForCandidateContest', () => {
  const contestWithWriteIns = find(
    electionSample.contests,
    (c): c is CandidateContest => c.type === 'candidate' && c.allowWriteIns
  );
  const contestWithoutWriteIns = find(
    electionSample.contests,
    (c): c is CandidateContest => c.type === 'candidate' && !c.allowWriteIns
  );
  expect(
    getContestVoteOptionsForCandidateContest(contestWithWriteIns)
  ).toHaveLength(contestWithWriteIns.candidates.length + 1);
  expect(
    getContestVoteOptionsForCandidateContest(contestWithoutWriteIns)
  ).toHaveLength(contestWithoutWriteIns.candidates.length);
});

test('getSingleYesNoVote', () => {
  expect(getSingleYesNoVote()).toBe(undefined);
  expect(getSingleYesNoVote([])).toBe(undefined);
  expect(getSingleYesNoVote(['yes'])).toBe('yes');
  expect(getSingleYesNoVote(['no'])).toBe('no');
  expect(getSingleYesNoVote(['yes', 'no'])).toBe(undefined);
});

test('normalizeWriteInId', () => {
  expect(normalizeWriteInId('arandomword')).toBe('arandomword');
  expect(normalizeWriteInId('__writein123456')).toBe(writeInCandidate.id);
  expect(normalizeWriteInId('__write-in123456')).toBe(writeInCandidate.id);
  expect(normalizeWriteInId('writein123456')).toBe(writeInCandidate.id);
  expect(normalizeWriteInId('write-in123456')).toBe(writeInCandidate.id);
});

test('buildVoteFromCvr', () => {
  const castVoteRecord: CastVoteRecord = {
    '750000015': ['yes'],
    '750000016': [],
    '750000017': ['no'],
    '750000018': ['yes'],
    '775020870': ['775031993'],
    '775020872': ['775031979'],
    '775020876': ['775031989'],
    '775020877': ['775031985'],
    '775020902': ['775032019'],
    _precinctId: '6525',
    _ballotType: 'absentee',
    _ballotStyleId: '1',
    _ballotId: 'b75FfAaktS5jbityDpkFag==',
    _batchId: '1',
    _batchLabel: 'Batch 1',
    _testBallot: false,
    _scannerId: 'scanner-6',
    _pageNumber: 1,
    _locales: { primary: 'en-US' },
  };
  expect(
    buildVoteFromCvr({
      election: electionWithMsEitherNeither,
      cvr: castVoteRecord,
    })
  ).toMatchInlineSnapshot(`
    Object {
      "750000015": Array [
        "yes",
      ],
      "750000016": Array [],
      "750000017": Array [
        "no",
      ],
      "750000018": Array [
        "yes",
      ],
      "775020870": Array [
        Object {
          "id": "775031993",
          "name": "Percy L. Lynchard",
          "partyId": "12",
        },
      ],
      "775020872": Array [
        Object {
          "id": "775031979",
          "name": "Trent Kelly",
          "partyId": "3",
        },
      ],
      "775020876": Array [
        Object {
          "id": "775031989",
          "name": "Presidential Electors for Phil Collins for President and Bill Parker for Vice President",
          "partyId": "11",
        },
      ],
      "775020877": Array [
        Object {
          "id": "775031985",
          "name": "Mike Espy",
          "partyId": "2",
        },
      ],
      "775020902": Array [
        Object {
          "id": "775032019",
          "name": "Willie Mae Guillory",
        },
      ],
    }
  `);

  // Handles malformed either/neither data as expected.
  const castVoteRecord2: CastVoteRecord = {
    '750000015': ['yes'],
    '750000017': ['no'],
    '750000018': ['yes'],
    '775020870': ['775031993'],
    '775020872': ['775031979'],
    '775020876': ['775031989'],
    '775020877': ['775031985'],
    '775020902': ['775032019'],
    _precinctId: '6525',
    _ballotType: 'absentee',
    _ballotStyleId: '1',
    _ballotId: 'b75FfAaktS5jbityDpkFag==',
    _batchId: '1',
    _batchLabel: 'Batch 1',
    _testBallot: false,
    _scannerId: 'scanner-6',
    _pageNumber: 1,
    _locales: { primary: 'en-US' },
  };
  const votes = buildVoteFromCvr({
    election: electionWithMsEitherNeither,
    cvr: castVoteRecord2,
  });
  expect(votes).not.toHaveProperty('750000015'); // The either neither contest should be removed since the pick one result was missing
  expect(votes).not.toHaveProperty('750000016');
});

test('tallyVotesByContest zeroes', () => {
  const contestIds = electionSample.contests.map(({ id }) => id);
  const contestTallies = tallyVotesByContest({
    election: electionSample,
    votes: [],
  });

  for (const [contestId, contestTally] of Object.entries(contestTallies)) {
    expect(contestIds).toContain(contestId);
    assert(contestTally);
    for (const [optionId, optionTally] of Object.entries(
      contestTally.tallies
    )) {
      expect(typeof optionId).toEqual('string');
      expect(optionTally?.tally).toEqual(0);
    }
  }
});

test('tallyVotesByContest filtered by party', () => {
  const ballotStyleWithParty = find(
    electionSample.ballotStyles,
    (bs): bs is BallotStyle & { partyId: Party['id'] } => !!bs.partyId
  );
  const filterContestsByParty = ballotStyleWithParty.partyId;
  const contestIds = electionSample.contests
    .filter(({ districtId }) =>
      ballotStyleWithParty.districts.includes(districtId)
    )
    .map(({ id }) => id);
  const contestTallies = tallyVotesByContest({
    election: electionSample,
    votes: [],
    filterContestsByParty,
  });

  for (const [contestId, contestTally] of Object.entries(contestTallies)) {
    expect(contestIds).toContain(contestId);
    assert(contestTally);
    for (const [optionId, optionTally] of Object.entries(
      contestTally.tallies
    )) {
      expect(typeof optionId).toEqual('string');
      expect(optionTally?.tally).toEqual(0);
    }
  }
});

describe('filterTalliesByParams fallback to empty tally when the proper category is not computed', () => {
  let electionTally: FullElectionTally;
  let election: Election;
  beforeEach(async () => {
    election =
      electionMultiPartyPrimaryWithDataFiles.electionDefinition.election;

    // get the CVRs
    const cvrsFileContents = electionMultiPartyPrimaryWithDataFiles.cvrData;
    const castVoteRecords = parseCvrs(cvrsFileContents);

    // tabulate it
    electionTally = computeTallyWithPrecomputedCategories(
      election,
      new Set(castVoteRecords),
      [] // do not pre-compute anything
    );
  });
  test('when filtering by scanner', () => {
    expect(
      filterTalliesByParams(electionTally, election, { scannerId: 'scanner-1' })
    ).toStrictEqual(getEmptyTally());
  });

  test('when filtering by batch', () => {
    expect(
      filterTalliesByParams(electionTally, election, { batchId: '1234-1' })
    ).toStrictEqual(getEmptyTally());
  });

  test('when filtering by precinct', () => {
    expect(
      filterTalliesByParams(electionTally, election, {
        precinctId: 'precinct-1',
      })
    ).toStrictEqual(getEmptyTally());
  });

  test('when filtering by party', () => {
    expect(
      filterTalliesByParams(electionTally, election, { partyId: '0' })
    ).toStrictEqual(getEmptyTally());
  });

  test('when filtering by voting method', () => {
    expect(
      filterTalliesByParams(electionTally, election, {
        votingMethod: VotingMethod.Precinct,
      })
    ).toStrictEqual(getEmptyTally());
  });

  test('when filtering by everything', () => {
    const filteredTally = filterTalliesByParams(electionTally, election, {
      precinctId: 'precinct-1',
      scannerId: 'scanner-1',
      votingMethod: VotingMethod.Precinct,
      partyId: '0',
      batchId: '1234-1',
    });
    expectAllEmptyTallies(filteredTally);
  });
});

describe('filterTalliesByParams in a typical election', () => {
  let electionTally: FullElectionTally;
  let election: Election;
  beforeEach(async () => {
    election = electionSample2;

    // get the CVRs
    const cvrsFileContents = electionSample2WithDataFiles.cvrDataStandard1;
    const castVoteRecords = parseCvrs(cvrsFileContents);

    // tabulate it
    electionTally = computeTallyWithPrecomputedCategories(
      election,
      new Set(castVoteRecords),
      Object.values(TallyCategory)
    );
  });

  it('returns full tally when no filters provided', () => {
    expect(filterTalliesByParams(electionTally, election, {})).toStrictEqual(
      electionTally.overallTally
    );
  });

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
    };
    for (const [
      precinctId,
      { totalBallots, ballotCountsByVotingMethod },
    ] of Object.entries(expectedPrecinctResults)) {
      const filteredResults = filterTalliesByParams(electionTally, election, {
        precinctId,
      });
      expect(filteredResults.numberOfBallotsCounted).toBe(totalBallots);
      expect(filteredResults.ballotCountsByVotingMethod).toMatchObject(
        ballotCountsByVotingMethod
      );
      expect(filteredResults.contestTallies).toMatchSnapshot();
    }
    expect(
      filterTalliesByParams(electionTally, election, {
        precinctId: 'not-a-precinct',
      })
    ).toStrictEqual(getEmptyTally());
  });

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
    };
    for (const [
      scannerId,
      { totalBallots, ballotCountsByVotingMethod },
    ] of Object.entries(expectedScannerResults)) {
      const filteredResults = filterTalliesByParams(electionTally, election, {
        scannerId,
      });
      expect(filteredResults.numberOfBallotsCounted).toBe(totalBallots);
      expect(filteredResults.contestTallies).toMatchSnapshot();
      expect(filteredResults.ballotCountsByVotingMethod).toMatchObject(
        ballotCountsByVotingMethod
      );
    }
    expect(
      filterTalliesByParams(electionTally, election, {
        scannerId: 'not-a-scanner',
      })
    ).toStrictEqual(getEmptyTally());
  });

  test('can filtere by precinct and scanner', () => {
    const filteredResults = filterTalliesByParams(electionTally, election, {
      precinctId: '23',
      scannerId: 'scanner-5',
    });
    expect(filteredResults.numberOfBallotsCounted).toBe(227);
    expect(filteredResults.contestTallies).toMatchSnapshot();
    expect(filteredResults.ballotCountsByVotingMethod).toMatchObject({
      [VotingMethod.Absentee]: 18,
      [VotingMethod.Precinct]: 6,
      [VotingMethod.Unknown]: 203,
    });
  });

  test('can filter by voting method', () => {
    const absenteeResults = filterTalliesByParams(electionTally, election, {
      votingMethod: VotingMethod.Absentee,
    });
    expect(absenteeResults.numberOfBallotsCounted).toBe(672);
    expect(absenteeResults.ballotCountsByVotingMethod).toMatchObject({
      [VotingMethod.Absentee]: 672,
      [VotingMethod.Precinct]: 0,
      [VotingMethod.Unknown]: 0,
    });

    const precinctResults = filterTalliesByParams(electionTally, election, {
      votingMethod: VotingMethod.Precinct,
    });
    expect(precinctResults.numberOfBallotsCounted).toBe(474);
    expect(precinctResults.ballotCountsByVotingMethod).toMatchObject({
      [VotingMethod.Absentee]: 0,
      [VotingMethod.Precinct]: 474,
      [VotingMethod.Unknown]: 0,
    });

    const unknownResults = filterTalliesByParams(electionTally, election, {
      votingMethod: VotingMethod.Unknown,
    });
    expect(unknownResults.numberOfBallotsCounted).toBe(8855);
    expect(unknownResults.ballotCountsByVotingMethod).toMatchObject({
      [VotingMethod.Absentee]: 0,
      [VotingMethod.Precinct]: 0,
      [VotingMethod.Unknown]: 8855,
    });
  });

  test('can filter by voting method precinct and scanner', () => {
    const filteredResults = filterTalliesByParams(electionTally, election, {
      precinctId: '23',
      scannerId: 'scanner-5',
      votingMethod: VotingMethod.Absentee,
    });
    expect(filteredResults.numberOfBallotsCounted).toBe(18);
    expect(filteredResults.ballotCountsByVotingMethod).toMatchObject({
      [VotingMethod.Absentee]: 18,
      [VotingMethod.Precinct]: 0,
      [VotingMethod.Unknown]: 0,
    });
  });
});

describe('filterTalliesByParams in a primary election', () => {
  let electionTally: FullElectionTally;

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
  ];

  beforeEach(async () => {
    // get the CVRs
    const cvrsFileContents = electionMultiPartyPrimaryWithDataFiles.cvrData;
    const castVoteRecords = parseCvrs(cvrsFileContents);

    // tabulate it
    electionTally = computeTallyWithPrecomputedCategories(
      multiPartyPrimaryElection,
      new Set(castVoteRecords),
      Object.values(TallyCategory)
    );
  });

  test('can filter results by party', () => {
    expect(Object.keys(electionTally.overallTally.contestTallies).length).toBe(
      13
    );
    expect(electionTally.overallTally.numberOfBallotsCounted).toBe(4530);
    expect(electionTally.overallTally.ballotCountsByVotingMethod).toMatchObject(
      {
        [VotingMethod.Absentee]: 468,
        [VotingMethod.Precinct]: 310,
        [VotingMethod.Unknown]: 3752,
      }
    );

    for (const testcase of expectedPartyInformation) {
      const filteredResults = filterTalliesByParams(
        electionTally,
        multiPartyPrimaryElection,
        { partyId: testcase.partyId }
      );
      expect(Object.keys(filteredResults.contestTallies)).toStrictEqual(
        testcase.contestIds
      );
      expect(filteredResults.numberOfBallotsCounted).toBe(testcase.numBallots);
      expect(filteredResults.ballotCountsByVotingMethod).toMatchObject(
        testcase.ballotCountsByVotingMethod
      );
      // Filtering by party just filters down the contests in contestTallies
      expect(
        Object.values(filteredResults.contestTallies).map((c) => {
          return {
            contestId: c!.contest.id,
            tallies: c!.tallies,
            metadata: c!.metadata,
          };
        })
      ).toMatchSnapshot();
    }

    // Check that filtering for a party that has no ballot styles returns an empty tally
    const filteredResults2 = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { partyId: '2' }
    );
    expectAllEmptyTallies(filteredResults2);
    expect(filteredResults2.contestTallies).toStrictEqual({});
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
      const filteredResults = filterTalliesByParams(
        electionTally,
        multiPartyPrimaryElection,
        { batchId: testcase.batchId }
      );
      expect(filteredResults.numberOfBallotsCounted).toBe(
        testcase.numberOfBallots
      );
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
    expect(
      filterTalliesByParams(electionTally, multiPartyPrimaryElection, {
        batchId: 'not-a-batch',
      })
    ).toStrictEqual(getEmptyTally());
    const precinctAndBatch = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { batchId: '1234-3', precinctId: 'precinct-1' }
    );
    expect(precinctAndBatch.numberOfBallotsCounted).toBe(290);
    expect(precinctAndBatch.ballotCountsByVotingMethod).toStrictEqual({
      [VotingMethod.Precinct]: 5,
      [VotingMethod.Absentee]: 38,
      [VotingMethod.Unknown]: 247,
    });
  });

  test('can filter results by party and precinct', () => {
    // Party 4 was only available for voting in precincts 1 and 5
    const expectedParty4Info = expectedPartyInformation.find(
      (p) => p.partyId === '4'
    )!;

    const emptyPrecincts = ['precinct-2', 'precinct-3', 'precinct-4'];
    for (const precinctId of emptyPrecincts) {
      const filteredResults = filterTalliesByParams(
        electionTally,
        multiPartyPrimaryElection,
        { partyId: '4', precinctId }
      );
      expect(Object.keys(filteredResults.contestTallies)).toStrictEqual(
        expectedParty4Info.contestIds
      );
      expectAllEmptyTallies(filteredResults);
    }

    const filterParty5Precinct1 = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { partyId: '4', precinctId: 'precinct-1' }
    );
    expect(filterParty5Precinct1.numberOfBallotsCounted).toBe(300);
    expect(Object.keys(filterParty5Precinct1.contestTallies)).toStrictEqual(
      expectedParty4Info.contestIds
    );
    expect(filterParty5Precinct1.ballotCountsByVotingMethod).toMatchObject({
      [VotingMethod.Absentee]: 0,
      [VotingMethod.Precinct]: 18,
      [VotingMethod.Unknown]: 282,
    });
    expect(
      Object.values(filterParty5Precinct1.contestTallies).map((c) => {
        return {
          contestId: c!.contest.id,
          tallies: c!.tallies,
          metadata: c!.metadata,
        };
      })
    ).toMatchSnapshot();

    const filterParty5Precinct5 = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { partyId: '4', precinctId: 'precinct-5' }
    );
    expect(filterParty5Precinct5.numberOfBallotsCounted).toBe(420);
    expect(Object.keys(filterParty5Precinct5.contestTallies)).toStrictEqual(
      expectedParty4Info.contestIds
    );
    expect(filterParty5Precinct5.ballotCountsByVotingMethod).toMatchObject({
      [VotingMethod.Absentee]: 33,
      [VotingMethod.Precinct]: 0,
      [VotingMethod.Unknown]: 387,
    });
    expect(
      Object.values(filterParty5Precinct5.contestTallies).map((c) => {
        return {
          contestId: c!.contest.id,
          tallies: c!.tallies,
          metadata: c!.metadata,
        };
      })
    ).toMatchSnapshot();

    const filterParty5InvalidPrecinct = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { partyId: '4', precinctId: 'not-a-real-precinct' }
    );
    expect(Object.keys(filterParty5Precinct5.contestTallies)).toStrictEqual(
      expectedParty4Info.contestIds
    );
    expectAllEmptyTallies(filterParty5InvalidPrecinct);
  });

  test('can filter results by scanner and party', () => {
    const expectedParty0Info = expectedPartyInformation.find(
      (p) => p.partyId === '0'
    )!;
    const filteredResultsScanner1 = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { scannerId: 'scanner-1', partyId: '0' }
    );
    const filteredResultsScanner2 = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { scannerId: 'scanner-2', partyId: '0' }
    );
    const filteredResultsScanner3 = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { scannerId: 'scanner-3', partyId: '0' }
    );

    // All three scanners have identical copies of results, but the CVRs are different due to the scanner and ballot ids
    const scanner1ResultsWithoutCvrs = {
      numberOfBallotsCounted: filteredResultsScanner1.numberOfBallotsCounted,
      contestTallies: filteredResultsScanner1.contestTallies,
    };
    const scanner2ResultsWithoutCvrs = {
      numberOfBallotsCounted: filteredResultsScanner2.numberOfBallotsCounted,
      contestTallies: filteredResultsScanner2.contestTallies,
    };
    const scanner3ResultsWithoutCvrs = {
      numberOfBallotsCounted: filteredResultsScanner3.numberOfBallotsCounted,
      contestTallies: filteredResultsScanner3.contestTallies,
    };
    expect(scanner1ResultsWithoutCvrs).toStrictEqual(
      scanner2ResultsWithoutCvrs
    );
    expect(scanner1ResultsWithoutCvrs).toStrictEqual(
      scanner3ResultsWithoutCvrs
    );

    // Verify the data of scanner 1s results
    expect(Object.keys(filteredResultsScanner1.contestTallies)).toStrictEqual(
      expectedParty0Info.contestIds
    );
    expect(
      Object.values(filteredResultsScanner1.contestTallies).map((c) => {
        return {
          contestId: c!.contest.id,
          tallies: c!.tallies,
          metadata: c!.metadata,
        };
      })
    ).toMatchSnapshot();

    expect(filteredResultsScanner1.numberOfBallotsCounted).toBe(570);
    expect(filteredResultsScanner1.ballotCountsByVotingMethod).toMatchObject({
      [VotingMethod.Absentee]: 114,
      [VotingMethod.Precinct]: 0,
      [VotingMethod.Unknown]: 456,
    });

    // Filter for a scanner not in the results
    const filteredResultsInvalidScanner = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { scannerId: 'not-a-scanner', partyId: '0' }
    );
    expect(
      Object.keys(filteredResultsInvalidScanner.contestTallies)
    ).toStrictEqual(expectedParty0Info.contestIds);
    expectAllEmptyTallies(filteredResultsInvalidScanner);
  });

  test('can filter by voting method and party', () => {
    const filteredResultsLibertyAbsentee = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { votingMethod: VotingMethod.Absentee, partyId: '0' }
    );
    expect(filteredResultsLibertyAbsentee.numberOfBallotsCounted).toBe(342);
    expect(
      filteredResultsLibertyAbsentee.ballotCountsByVotingMethod
    ).toMatchObject({
      [VotingMethod.Absentee]: 342,
      [VotingMethod.Precinct]: 0,
      [VotingMethod.Unknown]: 0,
    });

    const filteredResultsLibertyPrecinct = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { votingMethod: VotingMethod.Precinct, partyId: '0' }
    );
    expect(filteredResultsLibertyPrecinct.numberOfBallotsCounted).toBe(0);
    expect(
      filteredResultsLibertyPrecinct.ballotCountsByVotingMethod
    ).toMatchObject({
      [VotingMethod.Absentee]: 0,
      [VotingMethod.Precinct]: 0,
      [VotingMethod.Unknown]: 0,
    });

    const filteredResultsConstitutionPrecinct = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { votingMethod: VotingMethod.Precinct, partyId: '3' }
    );
    expect(filteredResultsConstitutionPrecinct.numberOfBallotsCounted).toBe(
      292
    );
    expect(
      filteredResultsConstitutionPrecinct.ballotCountsByVotingMethod
    ).toMatchObject({
      [VotingMethod.Absentee]: 0,
      [VotingMethod.Precinct]: 292,
      [VotingMethod.Unknown]: 0,
    });

    const filteredResultsConstitutionAbsentee = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { votingMethod: VotingMethod.Absentee, partyId: '3' }
    );
    expect(filteredResultsConstitutionAbsentee.numberOfBallotsCounted).toBe(93);
    expect(
      filteredResultsConstitutionAbsentee.ballotCountsByVotingMethod
    ).toMatchObject({
      [VotingMethod.Absentee]: 93,
      [VotingMethod.Precinct]: 0,
      [VotingMethod.Unknown]: 0,
    });

    const filteredResultsUnknownAbsentee = filterTalliesByParams(
      electionTally,
      multiPartyPrimaryElection,
      { votingMethod: VotingMethod.Unknown, partyId: '0' }
    );
    expect(filteredResultsUnknownAbsentee.numberOfBallotsCounted).toBe(1368);
    expect(
      filteredResultsUnknownAbsentee.ballotCountsByVotingMethod
    ).toMatchObject({
      [VotingMethod.Absentee]: 0,
      [VotingMethod.Precinct]: 0,
      [VotingMethod.Unknown]: 1368,
    });
  });

  test('can filter by non-present values', () => {
    expect(
      filterTalliesByParams(electionTally, multiPartyPrimaryElection, {
        precinctId: 'not-a-precinct',
        partyId: 'not-a-party',
        batchId: 'not-a-batch',
        scannerId: 'not-a-scanner',
        votingMethod: VotingMethod.Unknown,
      })
    ).toStrictEqual({
      ...getEmptyTally(),
      ballotCountsByVotingMethod: {
        [VotingMethod.Precinct]: 0,
        [VotingMethod.Absentee]: 0,
        [VotingMethod.Unknown]: 0,
      },
    });
  });
});

describe('filterTalliesByParty', () => {
  test('returns the tally if no party is given', () => {
    const election = electionSample2;

    // get the CVRs
    const cvrsFileContents = electionSample2WithDataFiles.cvrDataStandard1;
    const castVoteRecords = parseCvrs(cvrsFileContents);

    // tabulate it
    const electionTally = calculateTallyForCastVoteRecords(
      election,
      new Set(castVoteRecords)
    );

    expect(filterTalliesByParty({ election, electionTally })).toBe(
      electionTally
    );
  });

  test('can filter by party as expected', () => {
    const { election } =
      electionMultiPartyPrimaryWithDataFiles.electionDefinition;
    // get the CVRs
    const cvrsFileContents = electionMultiPartyPrimaryWithDataFiles.cvrData;
    const castVoteRecords = parseCvrs(cvrsFileContents);

    const party = election.parties.find((p) => p.id === '0');
    assert(party);

    // tabulate it
    const electionTally = calculateTallyForCastVoteRecords(
      election,
      new Set(castVoteRecords)
    );

    // expected filtered result
    const libertyPartyTally = calculateTallyForCastVoteRecords(
      election,
      new Set(castVoteRecords),
      '0'
    );

    const filteredTally = filterTalliesByParty({
      election,
      electionTally,
      party,
    });
    expect(filteredTally).toStrictEqual(libertyPartyTally);
    expect(Object.keys(filteredTally.contestTallies)).toContain(
      'mayor-contest-liberty'
    );
    expect(Object.keys(filteredTally.contestTallies)).not.toContain(
      'mayor-contest-constitution'
    );
    expect(filteredTally.ballotCountsByVotingMethod).toStrictEqual(
      electionTally.ballotCountsByVotingMethod
    );

    const expectedCounts = { [VotingMethod.Precinct]: 314 };
    const filteredTally2 = filterTalliesByParty({
      election,
      electionTally,
      party,
      ballotCountsByParty: { [party.id]: expectedCounts },
    });
    expect(filteredTally2.ballotCountsByVotingMethod).toBe(expectedCounts);
    const filteredTally3 = filterTalliesByParty({
      election,
      electionTally,
      party,
      ballotCountsByParty: {},
    });
    expect(filteredTally3.ballotCountsByVotingMethod).toBe(
      electionTally.ballotCountsByVotingMethod
    );
  });
});

test('getPartyIdForCvr', () => {
  const { election } =
    electionMultiPartyPrimaryWithDataFiles.electionDefinition;
  const cvr: CastVoteRecord = {
    _ballotStyleId: '1L',
    _precinctId: 'precinct-1',
    _batchId: 'batch',
    _ballotId: '1',
    _ballotType: VotingMethod.Precinct,
    _batchLabel: 'batch',
    _scannerId: 'scanner',
    _testBallot: false,
  };
  expect(getPartyIdForCvr(cvr, election)).toBe('0');
  expect(
    getPartyIdForCvr({ ...cvr, _ballotStyleId: 'notaballotstyle' }, election)
  ).toBe(undefined);
});
