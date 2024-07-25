import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimary,
  electionTwoPartyPrimaryDefinition,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { assert, assertDefined, find, typedAs } from '@votingworks/basics';
import {
  CVR,
  Tabulation,
  YesNoContest,
  safeParseJson,
  CastVoteRecordExportFileName,
  CandidateContest,
  BallotType,
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
  GROUP_KEY_ROOT,
  getOfficialCandidateNameLookup,
  getEmptyManualElectionResults,
  combineManualElectionResults,
  buildManualResultsFixture,
  buildElectionResultsFixture,
  ContestResultsSummaries,
  combineCardCounts,
  convertManualElectionResults,
  combineElectionResults,
  mergeWriteInTallies,
  getGroupKey,
  getGroupSpecifierFromGroupKey,
  getSheetCount,
  getScannedBallotCount,
  getHmpbBallotCount,
  combineCandidateContestResults,
  buildContestResultsFixture,
  yieldToEventLoop,
} from './tabulation';
import {
  convertCastVoteRecordVotesToTabulationVotes,
  getCastVoteRecordBallotType,
  getCurrentSnapshot,
  getExportedCastVoteRecordIds,
} from '../cast_vote_records';

function castVoteRecordToTabulationCastVoteRecord(
  castVoteRecord: CVR.CVR
): Tabulation.CastVoteRecord {
  return {
    ballotStyleId: castVoteRecord.BallotStyleId,
    batchId: castVoteRecord.BatchId,
    card: castVoteRecord.BallotSheetId
      ? // eslint-disable-next-line vx/gts-safe-number-parse
        { type: 'hmpb', sheetNumber: Number(castVoteRecord.BallotSheetId) }
      : { type: 'bmd' },
    partyId: castVoteRecord.PartyIds?.[0],
    precinctId: castVoteRecord.BallotStyleUnitId,
    scannerId: castVoteRecord.CreatingDeviceId,
    votes: convertCastVoteRecordVotesToTabulationVotes(
      assertDefined(getCurrentSnapshot(castVoteRecord))
    ),
    votingMethod: assertDefined(getCastVoteRecordBallotType(castVoteRecord)),
  };
}

async function readCastVoteRecordExport(
  exportDirectoryPath: string
): Promise<Tabulation.CastVoteRecord[]> {
  const castVoteRecordIds =
    await getExportedCastVoteRecordIds(exportDirectoryPath);
  const castVoteRecords: CVR.CVR[] = [];
  for (const castVoteRecordId of [...castVoteRecordIds].sort()) {
    const castVoteRecordDirectoryPath = join(
      exportDirectoryPath,
      castVoteRecordId
    );
    const castVoteRecordReport = safeParseJson(
      readFileSync(
        join(
          castVoteRecordDirectoryPath,
          CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
        ),
        'utf-8'
      ),
      CVR.CastVoteRecordReportSchema
    ).unsafeUnwrap();
    const castVoteRecord = assertDefined(castVoteRecordReport.CVR?.[0]);
    castVoteRecords.push(castVoteRecord);
  }
  return castVoteRecords.map(castVoteRecordToTabulationCastVoteRecord);
}

test('getEmptyElectionResult', () => {
  const { election } = electionTwoPartyPrimaryDefinition;

  const emptyElectionResult = getEmptyElectionResults(election);

  // has results for all contests
  for (const contest of election.contests) {
    expect(emptyElectionResult.contestResults[contest.id]).toBeDefined();
  }

  // check an empty yes-no contest
  const fishingContest = find(
    election.contests,
    (c): c is YesNoContest => c.id === 'fishing'
  );
  expect(emptyElectionResult.contestResults[fishingContest.id]).toEqual({
    contestId: fishingContest.id,
    contestType: 'yesno',
    yesOptionId: fishingContest.yesOption.id,
    noOptionId: fishingContest.noOption.id,
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
  const { election } = electionTwoPartyPrimaryDefinition;

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
  const { election } = electionTwoPartyPrimaryDefinition;

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
  const { election } = electionTwoPartyPrimaryDefinition;

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
        yesOptionId: 'ban-fishing',
        noOptionId: 'allow-fishing',
        noTally: 6,
        overvotes: 0,
        undervotes: 0,
        yesTally: 4,
      },
      'new-zoo-either': {
        ballots: 0,
        contestId: 'new-zoo-either',
        contestType: 'yesno',
        yesOptionId: 'new-zoo-either-approved',
        noOptionId: 'new-zoo-neither-approved',
        noTally: 0,
        overvotes: 0,
        undervotes: 0,
        yesTally: 0,
      },
      'new-zoo-pick': {
        ballots: 0,
        contestId: 'new-zoo-pick',
        contestType: 'yesno',
        yesOptionId: 'new-zoo-safari',
        noOptionId: 'new-zoo-traditional',
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
    zooCouncilMammalWithGenericWriteIn.tallies[Tabulation.GENERIC_WRITE_IN_ID]
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
  expect(
    getBallotCount({
      bmd: 10,
      hmpb: [5, 4, 4, 4],
      manual: 7,
    })
  ).toEqual(22);
});

test('getHmpbBallotCount', () => {
  expect(
    getHmpbBallotCount({
      bmd: 10,
      hmpb: [10, 10],
    })
  ).toEqual(10);
  expect(
    getHmpbBallotCount({
      bmd: 10,
      hmpb: [5, 4, 4, 4],
      manual: 7,
    })
  ).toEqual(5);
});

test('getScannedBallotCount', () => {
  expect(
    getScannedBallotCount({
      bmd: 10,
      hmpb: [10, 10],
    })
  ).toEqual(20);
  expect(
    getScannedBallotCount({
      bmd: 10,
      hmpb: [5, 4, 4, 4],
      manual: 7,
    })
  ).toEqual(15);
});

test('getSheetCount', () => {
  expect(
    getSheetCount({
      bmd: 3,
      hmpb: [20],
    })
  ).toEqual(23);
  expect(
    getSheetCount({
      bmd: 3,
      hmpb: [20, 35],
    })
  ).toEqual(58);
  expect(
    getSheetCount({
      bmd: 3,
      hmpb: [20, undefined, 1] as number[],
    })
  ).toEqual(24);
  expect(
    getSheetCount({
      bmd: 3,
      hmpb: [20],
      manual: 56,
    })
  ).toEqual(23);
});

test('getBallotStyleIdPartyIdLookup', () => {
  expect(
    getBallotStyleIdPartyIdLookup(electionTwoPartyPrimaryDefinition.election)
  ).toEqual({
    '1M': '0',
    '2F': '1',
  });

  expect(
    getBallotStyleIdPartyIdLookup(electionFamousNames2021Fixtures.election)
  ).toEqual({});
});

test('mapping from group keys to and from group specifiers', () => {
  function maintainsGroupSpecifier(groupSpecifier: GroupSpecifier) {
    const groupBy: Tabulation.GroupBy = {
      groupByBallotStyle: groupSpecifier.ballotStyleId !== undefined,
      groupByBatch: groupSpecifier.batchId !== undefined,
      groupByParty: groupSpecifier.partyId !== undefined,
      groupByPrecinct: groupSpecifier.precinctId !== undefined,
      groupByScanner: groupSpecifier.scannerId !== undefined,
      groupByVotingMethod: groupSpecifier.votingMethod !== undefined,
    };
    expect(
      getGroupSpecifierFromGroupKey(getGroupKey(groupSpecifier, groupBy))
    ).toEqual(groupSpecifier);
  }

  // no attributes
  maintainsGroupSpecifier({});

  // simple group specifiers, one attribute
  maintainsGroupSpecifier({ ballotStyleId: '1M' });
  maintainsGroupSpecifier({ batchId: 'batch-1' });
  maintainsGroupSpecifier({ partyId: '0' });
  maintainsGroupSpecifier({ precinctId: 'precinct-1' });
  maintainsGroupSpecifier({ scannerId: 'scanner-1' });
  maintainsGroupSpecifier({ votingMethod: 'absentee' });

  // composite group specifiers, multiple attributes
  maintainsGroupSpecifier({
    ballotStyleId: '1M',
    partyId: '0',
    votingMethod: 'absentee',
  });

  maintainsGroupSpecifier({
    batchId: 'batch-1',
    scannerId: 'scanner-1',
    precinctId: 'precinct-1',
  });

  // with escaped characters
  expect(
    getGroupKey(
      { ballotStyleId: '=\\1M&', batchId: 'batch-1' },
      { groupByBatch: true, groupByBallotStyle: true }
    )
  ).toEqual('root&ballotStyleId=\\=\\\\1M\\&&batchId=batch-1');

  maintainsGroupSpecifier({ ballotStyleId: '=\\1M&', batchId: 'batch-1' });
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
  const { election } = electionTwoPartyPrimaryDefinition;
  let cvrs: Tabulation.CastVoteRecord[] = [];
  beforeAll(async () => {
    cvrs = await readCastVoteRecordExport(
      electionTwoPartyPrimaryFixtures.castVoteRecordExport.asDirectoryPath()
    );
  });

  test('without grouping', async () => {
    // empty election
    const emptyResults = await tabulateCastVoteRecords({ cvrs: [], election });
    expect(Object.values(emptyResults)).toHaveLength(1);
    expect(emptyResults[GROUP_KEY_ROOT]).toEqual(
      getEmptyElectionResults(election)
    );

    const someMetadata = {
      ballotStyleId: '1M',
      precinctId: 'precinct-1',
      votingMethod: BallotType.Precinct,
      batchId: 'batch-1',
      scannerId: 'scanner-1',
    } as const;

    const electionResult = (
      await tabulateCastVoteRecords({
        cvrs: [
          {
            card: { type: 'bmd' },
            votes: {
              'best-animal-mammal': ['fox'],
              'zoo-council-mammal': ['elephant', 'lion', 'write-in-0'],
              'new-zoo-either': ['new-zoo-either-approved'],
              'new-zoo-pick': ['new-zoo-traditional'],
              fishing: ['ban-fishing'],
            },
            ...someMetadata,
          },
          {
            card: { type: 'hmpb', sheetNumber: 1 },
            votes: {
              'best-animal-mammal': ['fox', 'horse'],
              'zoo-council-mammal': ['elephant', 'lion', 'zebra', 'kangaroo'],
              'new-zoo-either': [
                'new-zoo-either-approved',
                'new-zoo-neither-approved',
              ],
              'new-zoo-pick': ['new-zoo-safari', 'new-zoo-traditional'],
              fishing: ['ban-fishing', 'allow-fishing'],
            },
            ...someMetadata,
          },
          {
            card: { type: 'hmpb', sheetNumber: 1 },
            votes: {
              'best-animal-fish': ['seahorse'],
              'aquarium-council-fish': ['manta-ray', 'pufferfish'],
              'new-zoo-either': ['new-zoo-neither-approved'],
              'new-zoo-pick': ['new-zoo-safari'],
              fishing: ['ban-fishing'],
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
      })
    )[GROUP_KEY_ROOT];

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

  test('by ballot style or party', async () => {
    const resultsByBallotStyle = await tabulateCastVoteRecords({
      cvrs,
      election,
      groupBy: {
        groupByBallotStyle: true,
      },
    });

    // should be two result groups of equal size, one for each ballot style'
    expect(Object.keys(resultsByBallotStyle)).toMatchObject(
      expect.arrayContaining(['root&ballotStyleId=1M', 'root&ballotStyleId=2F'])
    );
    expect(
      Object.values(resultsByBallotStyle).map((results) =>
        getBallotCount(results.cardCounts)
      )
    ).toEqual([56, 56]);

    const resultsByParty = await tabulateCastVoteRecords({
      cvrs,
      election,
      groupBy: {
        groupByParty: true,
      },
    });

    // should be two result groups of equal size, one for each party
    expect(Object.keys(resultsByParty)).toMatchObject(
      expect.arrayContaining(['root&partyId=0', 'root&partyId=1'])
    );
    expect(
      Object.values(resultsByParty).map((results) =>
        getBallotCount(results.cardCounts)
      )
    ).toEqual([56, 56]);

    // for the current election, results by party and ballot style should be identical
    // save for the identifiers
    expect(
      resultsByBallotStyle['root&ballotStyleId=1M']?.contestResults
    ).toEqual(resultsByParty['root&partyId=0']?.contestResults);
    expect(
      resultsByBallotStyle['root&ballotStyleId=2F']?.contestResults
    ).toEqual(resultsByParty['root&partyId=1']?.contestResults);
  });

  test('by batch and scanner', async () => {
    // dataset only has one batch and one scanner, so the grouping is trivial
    const resultsByBatchAndScanner = await tabulateCastVoteRecords({
      cvrs,
      election,
      groupBy: {
        groupByBatch: true,
        groupByScanner: true,
      },
    });
    expect(Object.values(resultsByBatchAndScanner)).toHaveLength(1);
    const results =
      resultsByBatchAndScanner['root&batchId=9822c71014&scannerId=VX-00-000']!;

    // use ungrouped results, verified in previous test, to compare against for grouped results
    expect(results).toMatchObject(
      (await tabulateCastVoteRecords({ cvrs, election }))[GROUP_KEY_ROOT]!
    );
  });

  test('by voting method and precinct', async () => {
    const resultsByMethodAndPrecinct = await tabulateCastVoteRecords({
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

    expect(Object.keys(resultsByMethodAndPrecinct)).toMatchObject(
      expect.arrayContaining([
        'root&precinctId=precinct-1&votingMethod=precinct',
        'root&precinctId=precinct-1&votingMethod=absentee',
        'root&precinctId=precinct-2&votingMethod=precinct',
        'root&precinctId=precinct-2&votingMethod=absentee',
      ])
    );

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

  test('with expected groups', async () => {
    const resultsByMethodAndPrecinct = await tabulateCastVoteRecords({
      cvrs: [
        cvrs.find(
          (cvr) =>
            cvr.precinctId === 'precinct-1' && cvr.votingMethod === 'precinct'
        )!,
      ],
      election,
      groupBy: {
        groupByVotingMethod: true,
        groupByPrecinct: true,
      },
      expectedGroups: [
        {
          votingMethod: 'absentee',
          precinctId: 'precinct-1',
        },
        {
          votingMethod: 'absentee',
          precinctId: 'precinct-2',
        },
        {
          votingMethod: 'precinct',
          precinctId: 'precinct-1',
        },
        {
          votingMethod: 'precinct',
          precinctId: 'precinct-2',
        },
      ],
    });

    // should have 2 x 2 = 4 even result groups based on expected groups even though there's no CVRs
    expect(
      Object.values(resultsByMethodAndPrecinct).map((results) =>
        getBallotCount(results.cardCounts)
      )
    ).toEqual([0, 0, 1, 0]);

    // keys should be ordered as the groups were passed in
    expect(Object.keys(resultsByMethodAndPrecinct)).toEqual([
      'root&precinctId=precinct-1&votingMethod=absentee',
      'root&precinctId=precinct-2&votingMethod=absentee',
      'root&precinctId=precinct-1&votingMethod=precinct',
      'root&precinctId=precinct-2&votingMethod=precinct',
    ]);
  });
});

test('getOfficialCandidateNameLookup', () => {
  const { election } = electionTwoPartyPrimaryDefinition;
  const nameLookup = getOfficialCandidateNameLookup(election);

  expect(nameLookup.get('zoo-council-mammal', 'lion')).toEqual('Lion');

  expect(() => {
    nameLookup.get('zoo-council-mammal', 'jonathan');
  }).toThrowError();
});

test('combineManualElectionResults', () => {
  const { election } = electionTwoPartyPrimaryDefinition;

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
              name: 'Somebody',
              tally: 2,
            },
            anybody: {
              name: 'Anybody',
              tally: 8,
            },
          },
        },
      },
    })
  );

  // test for combineElectionResults
  expect(
    combineElectionResults({
      election,
      allElectionResults: [
        convertManualElectionResults(manualResults1),
        convertManualElectionResults(manualResults2),
      ],
    })
  ).toEqual(convertManualElectionResults(combinedResults));
});

test('combineCardCounts', () => {
  expect(
    combineCardCounts([
      {
        bmd: 3,
        hmpb: [1, undefined as unknown as number, 1, 1],
      },
      {
        bmd: 2,
        hmpb: [2, 2, 2, 2],
        manual: 2,
      },
    ])
  ).toEqual({
    bmd: 5,
    hmpb: [3, 2, 3, 3],
    manual: 2,
  });
});

test('convertManualElectionResults', () => {
  expect(
    convertManualElectionResults({
      ballotCount: 5,
      contestResults: {},
    })
  ).toEqual<Tabulation.ElectionResults>({
    cardCounts: {
      bmd: 0,
      hmpb: [],
      manual: 5,
    },
    contestResults: {},
  });
});

test('mergeManualWriteInTallies', () => {
  const { election } = electionTwoPartyPrimaryDefinition;

  expect(
    mergeWriteInTallies(
      buildManualResultsFixture({
        election,
        ballotCount: 7,
        contestResultsSummaries: {
          fishing: {
            type: 'yesno',
            ballots: 7,
            overvotes: 0,
            undervotes: 0,
            yesTally: 7,
            noTally: 0,
          },
          'zoo-council-mammal': {
            type: 'candidate',
            ballots: 7,
            overvotes: 0,
            undervotes: 0,
            officialOptionTallies: {
              zebra: 4,
              lion: 4,
              kangaroo: 4,
              elephant: 4,
            },
            writeInOptionTallies: {
              narwhal: {
                name: 'Narwhal',
                tally: 3,
              },
              unicorn: {
                name: 'Unicorn',
                tally: 2,
              },
            },
          },
        },
      })
    )
  ).toEqual(
    buildManualResultsFixture({
      election,
      ballotCount: 7,
      contestResultsSummaries: {
        fishing: {
          type: 'yesno',
          ballots: 7,
          overvotes: 0,
          undervotes: 0,
          yesTally: 7,
          noTally: 0,
        },
        'zoo-council-mammal': {
          type: 'candidate',
          ballots: 7,
          overvotes: 0,
          undervotes: 0,
          officialOptionTallies: {
            zebra: 4,
            lion: 4,
            kangaroo: 4,
            elephant: 4,
          },
          writeInOptionTallies: {
            [Tabulation.GENERIC_WRITE_IN_ID]: {
              name: Tabulation.GENERIC_WRITE_IN_NAME,
              tally: 5,
            },
          },
        },
      },
    })
  );
});

test('combinedCandidateContestResults - does not alter original tallies', () => {
  const contest = find(
    electionTwoPartyPrimary.contests,
    (c) => c.id === 'zoo-council-mammal'
  ) as CandidateContest;
  const contestResultsA = buildContestResultsFixture({
    contest,
    contestResultsSummary: {
      type: 'candidate',
      ballots: 50,
      writeInOptionTallies: {
        'write-in-1': {
          name: 'Write-In 1',
          tally: 10,
        },
        'write-in-2': {
          name: 'Write-In 2',
          tally: 40,
        },
      },
    },
  }) as Tabulation.CandidateContestResults;

  const contestResultsB = buildContestResultsFixture({
    contest,
    contestResultsSummary: {
      type: 'candidate',
      ballots: 50,
      writeInOptionTallies: {
        'write-in-1': {
          name: 'Write-In 1',
          tally: 20,
        },
        'write-in-3': {
          name: 'Write-In 3',
          tally: 30,
        },
      },
    },
  }) as Tabulation.CandidateContestResults;

  const aString = JSON.stringify(contestResultsA);
  const bString = JSON.stringify(contestResultsB);

  combineCandidateContestResults({
    contest,
    allContestResults: [contestResultsA, contestResultsB],
  });

  expect(JSON.stringify(contestResultsA)).toEqual(aString);
  expect(JSON.stringify(contestResultsB)).toEqual(bString);
});

test('yieldToEventLoop', async () => {
  const fn = jest.fn();
  setImmediate(fn);
  expect(fn).not.toHaveBeenCalled();
  await yieldToEventLoop();
  expect(fn).toHaveBeenCalled();
});
