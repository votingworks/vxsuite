import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleDefinition,
  electionMinimalExhaustiveSampleFixtures,
} from '@votingworks/fixtures';
import { assert, find, typedAs } from '@votingworks/basics';
import {
  CVR,
  Tabulation,
  safeParse,
  writeInCandidate,
} from '@votingworks/types';
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
  getEmptyManualElectionResults,
  combineManualElectionResults,
  buildManualResultsFixture,
  buildElectionResultsFixture,
  ContestResultsSummaries,
} from './tabulation';
import { CAST_VOTE_RECORD_REPORT_FILENAME } from './filenames';
import {
  convertCastVoteRecordVotesToTabulationVotes,
  getCurrentSnapshot,
} from './cast_vote_record_report';

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
  // check an empty candidate contest
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

test('getEmptyManualElectionResults', () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;

  const emptyManualElectionResults = getEmptyManualElectionResults(election);

  // empty manual results should closely match empty regular results without the generic write-in
  const emptyElectionResults = getEmptyElectionResults(election, false);

  expect(emptyManualElectionResults.ballotCount).toEqual(0);
  expect(emptyManualElectionResults.contestResults['fishing']).toEqual(
    emptyElectionResults.contestResults['fishing']
  );
  expect(
    emptyManualElectionResults.contestResults['zoo-council-mammal']
  ).toEqual(emptyElectionResults.contestResults['zoo-council-mammal']);
});

test('buildElectionResultsFixture', () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;

  const ballotCount = 10;
  const cardCounts: Tabulation.CardCounts = {
    bmd: 5,
    hmpb: [5],
  };
  const contestResultsSummaries: ContestResultsSummaries = {
    'zoo-council-mammal': {
      type: 'candidate',
      ballots: 10,
      overvotes: 1,
      undervotes: 0,
      officialOptionTallies: {
        elephant: 2,
        kangaroo: 3,
        lion: 4,
      },
    },
    'aquarium-council-fish': {
      type: 'candidate',
      ballots: 10,
      writeInOptionTallies: {
        somebody: {
          id: 'somebody',
          name: 'Somebody',
          tally: 10,
        },
      },
    },
    fishing: {
      type: 'yesno',
      ballots: 10,
      yesTally: 4,
      noTally: 6,
    },
    'new-zoo-pick': {
      type: 'yesno',
      ballots: 0,
      overvotes: 10,
    },
  };

  // test entirety of one fixture to verify completeness
  const electionResultsFixtureWithoutGenericWriteIn =
    buildElectionResultsFixture({
      election,
      cardCounts,
      contestResultsSummaries,
      includeGenericWriteIn: false,
    });
  expect(electionResultsFixtureWithoutGenericWriteIn).toEqual({
    cardCounts,
    contestResults: {
      'aquarium-council-fish': {
        ballots: 10,
        contestId: 'aquarium-council-fish',
        contestType: 'candidate',
        overvotes: 0,
        tallies: {
          'manta-ray': {
            id: 'manta-ray',
            name: 'Manta Ray',
            tally: 0,
          },
          pufferfish: {
            id: 'pufferfish',
            name: 'Pufferfish',
            tally: 0,
          },
          rockfish: {
            id: 'rockfish',
            name: 'Rockfish',
            tally: 0,
          },
          somebody: {
            id: 'somebody',
            isWriteIn: true,
            name: 'Somebody',
            tally: 10,
          },
          triggerfish: {
            id: 'triggerfish',
            name: 'Triggerfish',
            tally: 0,
          },
        },
        undervotes: 0,
        votesAllowed: 2,
      },
      'best-animal-fish': {
        ballots: 0,
        contestId: 'best-animal-fish',
        contestType: 'candidate',
        overvotes: 0,
        tallies: {
          salmon: {
            id: 'salmon',
            name: 'Salmon',
            tally: 0,
          },
          seahorse: {
            id: 'seahorse',
            name: 'Seahorse',
            tally: 0,
          },
        },
        undervotes: 0,
        votesAllowed: 1,
      },
      'best-animal-mammal': {
        ballots: 0,
        contestId: 'best-animal-mammal',
        contestType: 'candidate',
        overvotes: 0,
        tallies: {
          fox: {
            id: 'fox',
            name: 'Fox',
            tally: 0,
          },
          horse: {
            id: 'horse',
            name: 'Horse',
            tally: 0,
          },
          otter: {
            id: 'otter',
            name: 'Otter',
            tally: 0,
          },
        },
        undervotes: 0,
        votesAllowed: 1,
      },
      fishing: {
        ballots: 10,
        contestId: 'fishing',
        contestType: 'yesno',
        noTally: 6,
        overvotes: 0,
        undervotes: 0,
        yesTally: 4,
      },
      'new-zoo-either': {
        ballots: 0,
        contestId: 'new-zoo-either',
        contestType: 'yesno',
        noTally: 0,
        overvotes: 0,
        undervotes: 0,
        yesTally: 0,
      },
      'new-zoo-pick': {
        ballots: 0,
        contestId: 'new-zoo-pick',
        contestType: 'yesno',
        noTally: 0,
        overvotes: 10,
        undervotes: 0,
        yesTally: 0,
      },
      'zoo-council-mammal': {
        ballots: 10,
        contestId: 'zoo-council-mammal',
        contestType: 'candidate',
        overvotes: 1,
        tallies: {
          elephant: {
            id: 'elephant',
            name: 'Elephant',
            tally: 2,
          },
          kangaroo: {
            id: 'kangaroo',
            name: 'Kangaroo',
            tally: 3,
          },
          lion: {
            id: 'lion',
            name: 'Lion',
            tally: 4,
          },
          zebra: {
            id: 'zebra',
            name: 'Zebra',
            tally: 0,
          },
        },
        undervotes: 0,
        votesAllowed: 3,
      },
    },
  });

  // check that the generic write-in option includes the generic write-in
  const electionResultsFixtureWithGenericWriteIn = buildElectionResultsFixture({
    election,
    cardCounts,
    contestResultsSummaries,
    includeGenericWriteIn: true,
  });
  const zooCouncilMammalWithGenericWriteIn =
    electionResultsFixtureWithGenericWriteIn.contestResults[
      'zoo-council-mammal'
    ] as Tabulation.CandidateContestResults;
  expect(
    zooCouncilMammalWithGenericWriteIn.tallies[writeInCandidate.id]
  ).toBeDefined();

  // check that manual results fixture matches the regular election fixture
  // minus the metadata
  const manualResultsFixture = buildManualResultsFixture({
    election,
    ballotCount,
    contestResultsSummaries,
  });

  expect(manualResultsFixture.contestResults).toEqual(
    electionResultsFixtureWithoutGenericWriteIn.contestResults
  );
  expect(manualResultsFixture.ballotCount).toEqual(ballotCount);
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
    expect(electionResult).toEqual(
      buildElectionResultsFixture({
        election,
        includeGenericWriteIn: true,
        cardCounts: {
          bmd: 2,
          hmpb: [2],
        },
        contestResultsSummaries: {
          'best-animal-mammal': {
            type: 'candidate',
            ballots: 2,
            overvotes: 1,
            officialOptionTallies: {
              fox: 1,
              horse: 0,
              otter: 0,
            },
          },
          'best-animal-fish': {
            type: 'candidate',
            ballots: 2,
            undervotes: 1,
            officialOptionTallies: {
              salmon: 0,
              seahorse: 1,
            },
          },
          'zoo-council-mammal': {
            type: 'candidate',
            ballots: 2,
            overvotes: 3,
            officialOptionTallies: {
              lion: 1,
              elephant: 1,
              'write-in': 1,
            },
          },
          'aquarium-council-fish': {
            type: 'candidate',
            ballots: 2,
            undervotes: 1,
            officialOptionTallies: {
              pufferfish: 1,
              'manta-ray': 2,
            },
          },
          'new-zoo-either': {
            type: 'yesno',
            ballots: 4,
            undervotes: 1,
            overvotes: 1,
            yesTally: 1,
            noTally: 1,
          },
          'new-zoo-pick': {
            type: 'yesno',
            ballots: 4,
            undervotes: 1,
            overvotes: 1,
            yesTally: 1,
            noTally: 1,
          },
          fishing: {
            type: 'yesno',
            ballots: 4,
            undervotes: 1,
            overvotes: 1,
            yesTally: 2,
          },
        },
      })
    );
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

    // sanity check actual results
    expect(firstResult).toMatchObject(
      buildElectionResultsFixture({
        election,
        includeGenericWriteIn: true,
        cardCounts: {
          bmd: 28,
          hmpb: [],
        },
        contestResultsSummaries: {
          'best-animal-mammal': {
            type: 'candidate',
            ballots: 14,
            overvotes: 2,
            undervotes: 1,
            officialOptionTallies: {
              fox: 9,
              horse: 1,
              otter: 1,
            },
          },
          'best-animal-fish': {
            type: 'candidate',
            ballots: 14,
            overvotes: 1,
            undervotes: 1,
            officialOptionTallies: {
              salmon: 11,
              seahorse: 1,
            },
          },
          'zoo-council-mammal': {
            type: 'candidate',
            ballots: 14,
            overvotes: 3,
            undervotes: 6,
            officialOptionTallies: {
              lion: 7,
              elephant: 6,
              kangaroo: 6,
              zebra: 8,
              'write-in': 6,
            },
          },
          'aquarium-council-fish': {
            type: 'candidate',
            ballots: 14,
            overvotes: 4,
            undervotes: 3,
            officialOptionTallies: {
              pufferfish: 4,
              'manta-ray': 5,
              rockfish: 4,
              triggerfish: 4,
              'write-in': 4,
            },
          },
          'new-zoo-either': {
            type: 'yesno',
            ballots: 28,
            undervotes: 22,
            overvotes: 2,
            yesTally: 2,
            noTally: 2,
          },
          'new-zoo-pick': {
            type: 'yesno',
            ballots: 28,
            undervotes: 22,
            overvotes: 2,
            yesTally: 2,
            noTally: 2,
          },
          fishing: {
            type: 'yesno',
            ballots: 28,
            undervotes: 22,
            overvotes: 2,
            yesTally: 2,
            noTally: 2,
          },
        },
      })
    );
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

test('combineManualElectionResults', () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;

  const manualResults1 = buildManualResultsFixture({
    election,
    ballotCount: 10,
    contestResultsSummaries: {
      fishing: {
        type: 'yesno',
        ballots: 10,
        overvotes: 3,
        undervotes: 2,
        yesTally: 5,
        noTally: 0,
      },
      'zoo-council-mammal': {
        type: 'candidate',
        ballots: 10,
        overvotes: 3,
        undervotes: 2,
        officialOptionTallies: {
          zebra: 8,
          lion: 6,
          kangaroo: 7,
          elephant: 2,
        },
        writeInOptionTallies: {
          somebody: {
            id: 'somebody',
            name: 'Somebody',
            tally: 2,
          },
        },
      },
    },
  });
  const manualResults2 = buildManualResultsFixture({
    election,
    ballotCount: 20,
    contestResultsSummaries: {
      fishing: {
        type: 'yesno',
        ballots: 20,
        overvotes: 7,
        undervotes: 2,
        yesTally: 2,
        noTally: 9,
      },
      'zoo-council-mammal': {
        type: 'candidate',
        ballots: 20,
        overvotes: 9,
        undervotes: 14,
        officialOptionTallies: {
          zebra: 0,
          lion: 12,
          kangaroo: 12,
          elephant: 5,
        },
        writeInOptionTallies: {
          anybody: {
            id: 'anybody',
            name: 'Anybody',
            tally: 8,
          },
        },
      },
    },
  });

  const combinedResults = combineManualElectionResults({
    election,
    allManualResults: [manualResults1, manualResults2],
  });

  expect(combinedResults).toEqual(
    buildManualResultsFixture({
      election,
      ballotCount: 30,
      contestResultsSummaries: {
        fishing: {
          type: 'yesno',
          ballots: 30,
          overvotes: 10,
          undervotes: 4,
          yesTally: 7,
          noTally: 9,
        },
        'zoo-council-mammal': {
          type: 'candidate',
          ballots: 30,
          overvotes: 12,
          undervotes: 16,
          officialOptionTallies: {
            zebra: 8,
            lion: 18,
            kangaroo: 19,
            elephant: 7,
          },
          writeInOptionTallies: {
            somebody: {
              id: 'somebody',
              name: 'Somebody',
              tally: 2,
            },
            anybody: {
              id: 'anybody',
              name: 'Anybody',
              tally: 8,
            },
          },
        },
      },
    })
  );
});
