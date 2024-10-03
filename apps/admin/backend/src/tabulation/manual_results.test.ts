import { Buffer } from 'node:buffer';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { buildManualResultsFixture } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { DEFAULT_SYSTEM_SETTINGS, Tabulation } from '@votingworks/types';
import { Store } from '../store';
import {
  extractWriteInSummary,
  isFilterCompatibleWithManualResults,
  tabulateManualBallotCounts,
  tabulateManualResults,
} from './manual_results';
import { ManualResultsFilter } from '../types';

test('isFilterCompatibleWithManualResults', () => {
  expect(
    isFilterCompatibleWithManualResults({
      batchIds: ['batch-1'],
    })
  ).toEqual(false);
  expect(
    isFilterCompatibleWithManualResults({
      scannerIds: ['scanner-1'],
    })
  ).toEqual(false);
  expect(
    isFilterCompatibleWithManualResults({
      votingMethods: ['precinct'],
      ballotStyleGroupIds: ['1M'],
      precinctIds: ['precinct-1'],
      partyIds: ['0'],
    })
  ).toEqual(true);

  expect(
    isFilterCompatibleWithManualResults({
      adjudicationFlags: [],
    })
  ).toEqual(true);

  expect(
    isFilterCompatibleWithManualResults({
      adjudicationFlags: ['isBlank'],
    })
  ).toEqual(false);
});

describe('tabulateManualResults & tabulateManualBallotCounts', () => {
  test('on incompatible filter', () => {
    const store = Store.memoryStore();
    const electionId = store.addElection({
      electionData:
        electionTwoPartyPrimaryFixtures.electionDefinition.electionData,
      systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
      electionPackageFileContents: Buffer.of(),
      electionPackageHash: 'test-election-package-hash',
    });
    store.setCurrentElectionId(electionId);

    expect(
      tabulateManualResults({
        electionId,
        store,
        filter: { batchIds: ['batch-1'] },
      }).err()
    ).toEqual({ type: 'incompatible-filter' });

    expect(
      tabulateManualBallotCounts({
        electionId,
        store,
        filter: { batchIds: ['batch-1'] },
      }).err()
    ).toEqual({ type: 'incompatible-filter' });
  });
  test('grouping and filtering', () => {
    const store = Store.memoryStore();
    const { electionDefinition } = electionTwoPartyPrimaryFixtures;
    const { election, electionData } = electionDefinition;
    const electionId = store.addElection({
      electionData,
      systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
      electionPackageFileContents: Buffer.of(),
      electionPackageHash: 'test-election-package-hash',
    });
    store.setCurrentElectionId(electionId);

    // since we're only interested in how results are combined, we can use
    // simplest possible fixtures
    function getSimpleManualResultsFixture(ballotCount: number) {
      return buildManualResultsFixture({
        election,
        ballotCount,
        contestResultsSummaries: {
          fishing: {
            type: 'yesno',
            ballots: ballotCount,
            overvotes: 0,
            undervotes: 0,
            yesTally: ballotCount,
            noTally: 0,
          },
        },
      });
    }

    // add manual results for each possibility
    store.setManualResults({
      electionId,
      precinctId: 'precinct-1',
      ballotStyleGroupId: '1M',
      votingMethod: 'precinct',
      manualResults: getSimpleManualResultsFixture(3),
    });
    store.setManualResults({
      electionId,
      precinctId: 'precinct-1',
      ballotStyleGroupId: '1M',
      votingMethod: 'absentee',
      manualResults: getSimpleManualResultsFixture(11),
    });
    store.setManualResults({
      electionId,
      precinctId: 'precinct-1',
      ballotStyleGroupId: '2F',
      votingMethod: 'precinct',
      manualResults: getSimpleManualResultsFixture(8),
    });
    store.setManualResults({
      electionId,
      precinctId: 'precinct-1',
      ballotStyleGroupId: '2F',
      votingMethod: 'absentee',
      manualResults: getSimpleManualResultsFixture(14),
    });
    store.setManualResults({
      electionId,
      precinctId: 'precinct-2',
      ballotStyleGroupId: '1M',
      votingMethod: 'precinct',
      manualResults: getSimpleManualResultsFixture(18),
    });
    store.setManualResults({
      electionId,
      precinctId: 'precinct-2',
      ballotStyleGroupId: '1M',
      votingMethod: 'absentee',
      manualResults: getSimpleManualResultsFixture(15),
    });
    store.setManualResults({
      electionId,
      precinctId: 'precinct-2',
      ballotStyleGroupId: '2F',
      votingMethod: 'precinct',
      manualResults: getSimpleManualResultsFixture(21),
    });
    store.setManualResults({
      electionId,
      precinctId: 'precinct-2',
      ballotStyleGroupId: '2F',
      votingMethod: 'absentee',
      manualResults: getSimpleManualResultsFixture(24),
    });

    const testCases: Array<{
      filter?: ManualResultsFilter;
      groupBy?: Tabulation.GroupBy;
      expected: Array<[groupKey: Tabulation.GroupKey, tally: number]>;
    }> = [
      // no filter or group case
      {
        expected: [['root', 114]],
      },
      // each filter case
      {
        filter: { precinctIds: ['precinct-1'] },
        expected: [['root', 36]],
      },
      {
        filter: { ballotStyleGroupIds: ['1M'] },
        expected: [['root', 47]],
      },
      {
        filter: { partyIds: ['0'] },
        expected: [['root', 47]],
      },
      {
        filter: { votingMethods: ['precinct'] },
        expected: [['root', 50]],
      },
      // empty filter case
      {
        filter: { votingMethods: [] },
        expected: [],
      },
      // trivial filter case
      {
        filter: { votingMethods: ['precinct', 'absentee'] },
        expected: [['root', 114]],
      },
      // each grouping case
      {
        groupBy: { groupByBallotStyle: true },
        expected: [
          ['root&ballotStyleGroupId=1M', 47],
          ['root&ballotStyleGroupId=2F', 67],
        ],
      },
      {
        groupBy: { groupByParty: true },
        expected: [
          ['root&partyId=0', 47],
          ['root&partyId=1', 67],
        ],
      },
      {
        groupBy: { groupByPrecinct: true },
        expected: [
          ['root&precinctId=precinct-1', 36],
          ['root&precinctId=precinct-2', 78],
        ],
      },
      {
        groupBy: { groupByVotingMethod: true },
        expected: [
          ['root&votingMethod=precinct', 50],
          ['root&votingMethod=absentee', 64],
        ],
      },
      // composite filter & group cases
      {
        groupBy: { groupByVotingMethod: true, groupByPrecinct: true },
        expected: [
          ['root&precinctId=precinct-1&votingMethod=precinct', 11],
          ['root&precinctId=precinct-1&votingMethod=absentee', 25],
          ['root&precinctId=precinct-2&votingMethod=precinct', 39],
          ['root&precinctId=precinct-2&votingMethod=absentee', 39],
        ],
      },
      {
        filter: { ballotStyleGroupIds: ['1M'] },
        groupBy: { groupByVotingMethod: true, groupByPrecinct: true },
        expected: [
          ['root&precinctId=precinct-1&votingMethod=precinct', 3],
          ['root&precinctId=precinct-1&votingMethod=absentee', 11],
          ['root&precinctId=precinct-2&votingMethod=precinct', 18],
          ['root&precinctId=precinct-2&votingMethod=absentee', 15],
        ],
      },
      {
        groupBy: { groupByPrecinct: true, groupByBatch: true },
        expected: [
          [
            `root&batchId=${Tabulation.MANUAL_BATCH_ID}&precinctId=precinct-1`,
            36,
          ],
          [
            `root&batchId=${Tabulation.MANUAL_BATCH_ID}&precinctId=precinct-2`,
            78,
          ],
        ],
      },
      {
        groupBy: { groupByPrecinct: true, groupByScanner: true },
        expected: [
          [
            `root&precinctId=precinct-1&scannerId=${Tabulation.MANUAL_SCANNER_ID}`,
            36,
          ],
          [
            `root&precinctId=precinct-2&scannerId=${Tabulation.MANUAL_SCANNER_ID}`,
            78,
          ],
        ],
      },
    ];

    for (const { filter, groupBy, expected } of testCases) {
      const result = tabulateManualResults({
        electionId,
        store,
        filter,
        groupBy,
      });
      assert(result.isOk());

      for (const [groupKey, ballotCount] of expected) {
        expect(result.ok()[groupKey]).toEqual(
          getSimpleManualResultsFixture(ballotCount)
        );
      }

      expect(Object.values(result.ok())).toHaveLength(
        Object.values(expected).length
      );
    }

    for (const { filter, groupBy, expected } of testCases) {
      const result = tabulateManualBallotCounts({
        electionId,
        store,
        filter,
        groupBy,
      });
      assert(result.isOk());

      for (const [groupKey, ballotCount] of expected) {
        expect(result.ok()[groupKey]).toEqual(ballotCount);
      }

      expect(Object.values(result.ok())).toHaveLength(
        Object.values(expected).length
      );
    }
  });
});

test('extractManualWriteInSummary', () => {
  const { election } = electionTwoPartyPrimaryFixtures;
  expect(
    extractWriteInSummary({
      election,
      manualResults: buildManualResultsFixture({
        election,
        ballotCount: 25,
        contestResultsSummaries: {
          'zoo-council-mammal': {
            type: 'candidate',
            ballots: 25,
            officialOptionTallies: {
              lion: 10,
              zebra: 5,
            },
            writeInOptionTallies: {
              somebody: {
                name: 'Somebody',
                tally: 3,
              },
              anybody: {
                name: 'Anybody',
                tally: 7,
              },
            },
          },
        },
      }),
    })
  ).toEqual({
    contestWriteInSummaries: {
      'aquarium-council-fish': {
        candidateTallies: {},
        contestId: 'aquarium-council-fish',
        invalidTally: 0,
        pendingTally: 0,
        totalTally: 0,
      },
      'zoo-council-mammal': {
        candidateTallies: {
          anybody: {
            id: 'anybody',
            isWriteIn: true,
            name: 'Anybody',
            tally: 7,
          },
          somebody: {
            id: 'somebody',
            isWriteIn: true,
            name: 'Somebody',
            tally: 3,
          },
        },
        contestId: 'zoo-council-mammal',
        invalidTally: 0,
        pendingTally: 0,
        totalTally: 10,
      },
    },
  });
});
