import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleDefinition,
  electionMinimalExhaustiveSampleFixtures,
} from '@votingworks/fixtures';
import { assert, find, typedAs } from '@votingworks/basics';
import { CVR, Tabulation, safeParse } from '@votingworks/types';
import { readFileSync } from 'fs';
import { join } from 'path';
import { GroupSpecifier } from '@votingworks/types/src/tabulation';
import {
  getBallotCount,
  getBallotStyleIdPartyIdLookup,
  getEmptyElectionResults,
  extractGroupSpecifier,
  tabulateCastVoteRecords,
  isGroupByEmpty,
  GROUP_KEY_ROOT,
  getOfficialCandidateNameLookup,
} from './tabulation';
import { CAST_VOTE_RECORD_REPORT_FILENAME } from './filenames';
import {
  convertCastVoteRecordVotesToTabulationVotes,
  getCurrentSnapshot,
} from './cast_vote_record_report';

/**
 * There is definitely value in testing against the entire `ElectionResults`
 * object returned from tabulation, but it makes the test assertions much
 * harder to read. Use this utility to simplify the output for easier testing,
 * being aware that candidate metadata is not being tested.
 */
function flattenElectionResultForTesting(
  electionResult: Tabulation.ElectionResults
) {
  const flattenedContestResults = Object.values(
    electionResult.contestResults
  ).map((contestResult) => {
    const flattened: Record<string, number | string> = {};
    flattened['contestId'] = contestResult.contestId;
    flattened['ballots'] = contestResult.ballots;
    flattened['overvotes'] = contestResult.overvotes;
    flattened['undervotes'] = contestResult.undervotes;
    if (contestResult.contestType === 'yesno') {
      flattened['yesTally'] = contestResult.yesTally;
      flattened['noTally'] = contestResult.noTally;
    } else {
      for (const candidateTally of Object.values(contestResult.tallies)) {
        flattened[candidateTally.id] = candidateTally.tally;
      }
    }
    return flattened;
  });
  return {
    cardCounts: electionResult.cardCounts,
    contestResults: flattenedContestResults,
  };
}

/**
 * For testing with small cast vote record files only.
 */
function loadCastVoteRecordsFromReport(
  directoryPath: string
): Tabulation.CastVoteRecord[] {
  const cvrReport = safeParse(
    CVR.CastVoteRecordReportSchema,
    JSON.parse(
      readFileSync(
        join(directoryPath, CAST_VOTE_RECORD_REPORT_FILENAME)
      ).toString()
    )
  ).unsafeUnwrap();

  const cvrs: Tabulation.CastVoteRecord[] = [];
  for (const cvr of cvrReport.CVR!) {
    cvrs.push({
      ballotStyleId: cvr.BallotStyleId,
      batchId: cvr.BatchId,
      scannerId: cvr.CreatingDeviceId,
      precinctId: cvr.BallotStyleUnitId,
      votingMethod: cvr.vxBallotType as Tabulation.VotingMethod,
      card: cvr.BallotSheetId
        ? // eslint-disable-next-line vx/gts-safe-number-parse
          { type: 'hmpb', sheetNumber: Number(cvr.BallotSheetId) }
        : { type: 'bmd' },
      votes: convertCastVoteRecordVotesToTabulationVotes(
        getCurrentSnapshot(cvr)!
      ),
    });
  }

  return cvrs;
}

test('getEmptyElectionResult', () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;

  const emptyElectionResult = getEmptyElectionResults(election);

  // has results for all contests
  for (const contest of election.contests) {
    expect(emptyElectionResult.contestResults[contest.id]).toBeDefined();
  }

  // check an empty yes-no contest
  const fishingContest = find(election.contests, (c) => c.id === 'fishing');
  expect(emptyElectionResult.contestResults[fishingContest.id]).toEqual({
    contestId: fishingContest.id,
    contestType: 'yesno',
    overvotes: 0,
    undervotes: 0,
    ballots: 0,
    yesTally: 0,
    noTally: 0,
  });

  // check an empty candidate contests
  const zooCouncilMammalContest = find(
    election.contests,
    (c) => c.id === 'zoo-council-mammal'
  );
  expect(
    emptyElectionResult.contestResults[zooCouncilMammalContest.id]
  ).toEqual({
    contestId: 'zoo-council-mammal',
    contestType: 'candidate',
    votesAllowed: 3,
    ballots: 0,
    undervotes: 0,
    overvotes: 0,
    tallies: {
      elephant: {
        id: 'elephant',
        name: 'Elephant',
        tally: 0,
      },
      kangaroo: {
        id: 'kangaroo',
        name: 'Kangaroo',
        tally: 0,
      },
      lion: {
        id: 'lion',
        name: 'Lion',
        tally: 0,
      },
      zebra: {
        id: 'zebra',
        name: 'Zebra',
        tally: 0,
      },
      'write-in': {
        id: 'write-in',
        isWriteIn: true,
        name: 'Write-In',
        tally: 0,
      },
    },
  });
});

test('getEmptyElectionResults without generic write-in', () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;

  const emptyElectionResult = getEmptyElectionResults(election, false);
  // check an empty candidate contests
  const zooCouncilMammalContest = find(
    election.contests,
    (c) => c.id === 'zoo-council-mammal'
  );
  expect(
    emptyElectionResult.contestResults[zooCouncilMammalContest.id]!
  ).toEqual({
    contestId: 'zoo-council-mammal',
    contestType: 'candidate',
    votesAllowed: 3,
    ballots: 0,
    undervotes: 0,
    overvotes: 0,
    tallies: {
      elephant: {
        id: 'elephant',
        name: 'Elephant',
        tally: 0,
      },
      kangaroo: {
        id: 'kangaroo',
        name: 'Kangaroo',
        tally: 0,
      },
      lion: {
        id: 'lion',
        name: 'Lion',
        tally: 0,
      },
      zebra: {
        id: 'zebra',
        name: 'Zebra',
        tally: 0,
      },
    },
  });
});

test('getBallotCount', () => {
  expect(
    getBallotCount({
      bmd: 10,
      hmpb: [10, 10],
    })
  ).toEqual(20);
});

test('isGroupByEmpty', () => {
  expect(isGroupByEmpty({})).toEqual(true);
  expect(isGroupByEmpty({ groupByBallotStyle: true })).toEqual(false);
  expect(isGroupByEmpty({ groupByBatch: true })).toEqual(false);
  expect(isGroupByEmpty({ groupByPrecinct: true })).toEqual(false);
  expect(isGroupByEmpty({ groupByParty: true })).toEqual(false);
  expect(isGroupByEmpty({ groupByScanner: true })).toEqual(false);
  expect(isGroupByEmpty({ groupByVotingMethod: true })).toEqual(false);
});

test('getBallotStyleIdPartyIdLookup', () => {
  expect(
    getBallotStyleIdPartyIdLookup(
      electionMinimalExhaustiveSampleDefinition.election
    )
  ).toEqual({
    '1M': '0',
    '2F': '1',
  });

  expect(
    getBallotStyleIdPartyIdLookup(electionFamousNames2021Fixtures.election)
  ).toEqual({});
});

type ObjectWithGroupSpecifier = { something: 'something' } & GroupSpecifier;

test('extractGroupSpecifier', () => {
  expect(
    extractGroupSpecifier(
      typedAs<ObjectWithGroupSpecifier>({
        something: 'something',
        ballotStyleId: '1M',
        partyId: '0',
        votingMethod: 'absentee',
      })
    )
  ).toEqual({
    ballotStyleId: '1M',
    partyId: '0',
    votingMethod: 'absentee',
  });

  expect(
    extractGroupSpecifier(
      typedAs<ObjectWithGroupSpecifier>({
        something: 'something',
        batchId: 'batch-1',
        scannerId: 'scanner-1',
        precinctId: 'precinct-1',
      })
    )
  ).toEqual({
    batchId: 'batch-1',
    scannerId: 'scanner-1',
    precinctId: 'precinct-1',
  });
});

describe('tabulateCastVoteRecords', () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;
  const cvrs = loadCastVoteRecordsFromReport(
    electionMinimalExhaustiveSampleFixtures.castVoteRecordReport.asDirectoryPath()
  );

  test('without grouping', () => {
    // empty election
    const emptyResults = tabulateCastVoteRecords({ cvrs: [], election });
    expect(Object.values(emptyResults)).toHaveLength(1);
    expect(emptyResults[GROUP_KEY_ROOT]).toEqual(
      getEmptyElectionResults(election)
    );

    const someMetadata = {
      ballotStyleId: '1M',
      precinctId: 'precinct-1',
      votingMethod: CVR.vxBallotType.Precinct,
      batchId: 'batch-1',
      scannerId: 'scanner-1',
    } as const;

    const electionResult = tabulateCastVoteRecords({
      cvrs: [
        {
          card: { type: 'bmd' },
          votes: {
            'best-animal-mammal': ['fox'],
            'zoo-council-mammal': ['elephant', 'lion', 'write-in-0'],
            'new-zoo-either': ['yes'],
            'new-zoo-pick': ['no'],
            fishing: ['yes'],
          },
          ...someMetadata,
        },
        {
          card: { type: 'hmpb', sheetNumber: 1 },
          votes: {
            'best-animal-mammal': ['fox', 'horse'],
            'zoo-council-mammal': ['elephant', 'lion', 'zebra', 'kangaroo'],
            'new-zoo-either': ['yes', 'no'],
            'new-zoo-pick': ['yes', 'no'],
            fishing: ['yes', 'no'],
          },
          ...someMetadata,
        },
        {
          card: { type: 'hmpb', sheetNumber: 1 },
          votes: {
            'best-animal-fish': ['seahorse'],
            'aquarium-council-fish': ['manta-ray', 'pufferfish'],
            'new-zoo-either': ['no'],
            'new-zoo-pick': ['yes'],
            fishing: ['yes'],
          },
          ...someMetadata,
        },
        {
          card: { type: 'bmd' },
          votes: {
            'best-animal-fish': [],
            'aquarium-council-fish': ['manta-ray'],
            'new-zoo-either': [],
            'new-zoo-pick': [],
            fishing: [],
          },
          ...someMetadata,
        },
      ],
      election,
    })[GROUP_KEY_ROOT];

    assert(electionResult);
    expect(flattenElectionResultForTesting(electionResult)).toEqual({
      cardCounts: {
        bmd: 2,
        hmpb: [2],
      },
      contestResults: [
        {
          ballots: 2,
          contestId: 'best-animal-mammal',
          fox: 1,
          horse: 0,
          otter: 0,
          overvotes: 1,
          undervotes: 0,
        },
        {
          ballots: 2,
          contestId: 'best-animal-fish',
          overvotes: 0,
          salmon: 0,
          seahorse: 1,
          undervotes: 1,
        },
        {
          ballots: 2,
          contestId: 'zoo-council-mammal',
          elephant: 1,
          kangaroo: 0,
          lion: 1,
          overvotes: 3,
          undervotes: 0,
          'write-in': 1,
          zebra: 0,
        },
        {
          ballots: 2,
          contestId: 'aquarium-council-fish',
          'manta-ray': 2,
          overvotes: 0,
          pufferfish: 1,
          rockfish: 0,
          triggerfish: 0,
          undervotes: 1,
          'write-in': 0,
        },
        {
          ballots: 4,
          contestId: 'new-zoo-either',
          noTally: 1,
          overvotes: 1,
          undervotes: 1,
          yesTally: 1,
        },
        {
          ballots: 4,
          contestId: 'new-zoo-pick',
          noTally: 1,
          overvotes: 1,
          undervotes: 1,
          yesTally: 1,
        },
        {
          ballots: 4,
          contestId: 'fishing',
          noTally: 0,
          overvotes: 1,
          undervotes: 1,
          yesTally: 2,
        },
      ],
    });
  });

  // use ungrouped results, verified in last test, to compare against for grouped results
  const ungroupedResults = tabulateCastVoteRecords({ cvrs, election })[
    GROUP_KEY_ROOT
  ];
  assert(ungroupedResults);

  test('by ballot style or party', () => {
    const resultsByBallotStyle = tabulateCastVoteRecords({
      cvrs,
      election,
      groupBy: {
        groupByBallotStyle: true,
      },
    });

    // should be two result groups of equal size, one for each ballot style
    expect(
      Object.values(resultsByBallotStyle).map((results) =>
        getBallotCount(results.cardCounts)
      )
    ).toEqual([56, 56]);

    // group keys should match specifiers
    expect(extractGroupSpecifier(resultsByBallotStyle['root&1M']!)).toEqual({
      ballotStyleId: '1M',
    });
    expect(extractGroupSpecifier(resultsByBallotStyle['root&2F']!)).toEqual({
      ballotStyleId: '2F',
    });

    const resultsByParty = tabulateCastVoteRecords({
      cvrs,
      election,
      groupBy: {
        groupByParty: true,
      },
    });

    // should be two result groups of equal size, one for each party
    expect(
      Object.values(resultsByParty).map((results) =>
        getBallotCount(results.cardCounts)
      )
    ).toEqual([56, 56]);

    expect(extractGroupSpecifier(resultsByParty['root&0']!)).toEqual({
      partyId: '0',
    });
    expect(extractGroupSpecifier(resultsByParty['root&1']!)).toEqual({
      partyId: '1',
    });

    // for the current election, results by party and ballot style should be identical
    // save for the identifiers
    expect(resultsByBallotStyle['root&1M']?.contestResults).toEqual(
      resultsByParty['root&0']?.contestResults
    );
    expect(resultsByBallotStyle['root&2F']?.contestResults).toEqual(
      resultsByParty['root&1']?.contestResults
    );
  });

  test('by batch and scanner', () => {
    // dataset only has one batch and one scanner, so the grouping is trivial
    const resultsByBatchAndScanner = tabulateCastVoteRecords({
      cvrs,
      election,
      groupBy: {
        groupByBatch: true,
        groupByScanner: true,
      },
    });
    expect(Object.values(resultsByBatchAndScanner)).toHaveLength(1);
    const results = Object.values(resultsByBatchAndScanner)[0]!;
    expect(extractGroupSpecifier(results)).toEqual({
      batchId: expect.anything(),
      scannerId: expect.anything(),
    });
    expect(results).toMatchObject(ungroupedResults);
  });

  test('by voting method and precinct', () => {
    const resultsByMethodAndPrecinct = tabulateCastVoteRecords({
      cvrs,
      election,
      groupBy: {
        groupByVotingMethod: true,
        groupByPrecinct: true,
      },
    });

    // should have 2 x 2 = 4 even result groups
    expect(
      Object.values(resultsByMethodAndPrecinct).map((results) =>
        getBallotCount(results.cardCounts)
      )
    ).toEqual([28, 28, 28, 28]);

    // group keys should match group specifiers
    expect(
      extractGroupSpecifier(
        resultsByMethodAndPrecinct['root&precinct-1&precinct']!
      )
    ).toEqual({
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
    });
    expect(
      extractGroupSpecifier(
        resultsByMethodAndPrecinct['root&precinct-1&absentee']!
      )
    ).toEqual({
      precinctId: 'precinct-1',
      votingMethod: 'absentee',
    });
    expect(
      extractGroupSpecifier(
        resultsByMethodAndPrecinct['root&precinct-2&precinct']!
      )
    ).toEqual({
      precinctId: 'precinct-2',
      votingMethod: 'precinct',
    });
    expect(
      extractGroupSpecifier(
        resultsByMethodAndPrecinct['root&precinct-2&absentee']!
      )
    ).toEqual({
      precinctId: 'precinct-2',
      votingMethod: 'absentee',
    });

    // all results should be identical
    const resultsAsArray = Object.values(resultsByMethodAndPrecinct);
    const firstResult = resultsAsArray[0]!;
    for (let i = 1; i < 3; i += 1) {
      const otherResult = resultsAsArray[i]!;
      expect(firstResult.contestResults).toEqual(otherResult.contestResults);
      expect(firstResult.cardCounts).toEqual(otherResult.cardCounts);
    }

    // sanity check result
    expect(flattenElectionResultForTesting(firstResult)).toEqual({
      cardCounts: {
        bmd: 28,
        hmpb: [],
      },
      contestResults: [
        {
          ballots: 14,
          contestId: 'best-animal-mammal',
          fox: 9,
          horse: 1,
          otter: 1,
          overvotes: 2,
          undervotes: 1,
        },
        {
          ballots: 14,
          contestId: 'best-animal-fish',
          overvotes: 1,
          salmon: 11,
          seahorse: 1,
          undervotes: 1,
        },
        {
          ballots: 14,
          contestId: 'zoo-council-mammal',
          elephant: 6,
          kangaroo: 6,
          lion: 7,
          overvotes: 3,
          undervotes: 6,
          'write-in': 6,
          zebra: 8,
        },
        {
          ballots: 14,
          contestId: 'aquarium-council-fish',
          'manta-ray': 5,
          overvotes: 4,
          pufferfish: 4,
          rockfish: 4,
          triggerfish: 4,
          undervotes: 3,
          'write-in': 4,
        },
        {
          ballots: 28,
          contestId: 'new-zoo-either',
          noTally: 2,
          overvotes: 2,
          undervotes: 22,
          yesTally: 2,
        },
        {
          ballots: 28,
          contestId: 'new-zoo-pick',
          noTally: 2,
          overvotes: 2,
          undervotes: 22,
          yesTally: 2,
        },
        {
          ballots: 28,
          contestId: 'fishing',
          noTally: 2,
          overvotes: 2,
          undervotes: 22,
          yesTally: 2,
        },
      ],
    });
  });
});

test('getOfficialCandidateNameLookup', () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;
  const nameLookup = getOfficialCandidateNameLookup(election);

  expect(nameLookup.get('zoo-council-mammal', 'lion')).toEqual('Lion');

  expect(() => {
    nameLookup.get('zoo-council-mammal', 'jonathan');
  }).toThrowError();
});
