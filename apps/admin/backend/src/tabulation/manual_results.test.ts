import { describe, expect, test } from 'vite-plus/test';
import { Buffer } from 'node:buffer';
import {
  electionTwoPartyPrimaryFixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { buildManualResultsFixture } from '@votingworks/utils';
import {
  BallotStyleGroupId,
  DEFAULT_SYSTEM_SETTINGS,
  Tabulation,
} from '@votingworks/types';
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
      ballotStyleGroupIds: ['1M'] as BallotStyleGroupId[],
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
    const store = Store.memoryStore(makeTemporaryDirectory());
    const electionId = store.addElection({
      electionData: electionTwoPartyPrimaryFixtures.electionJson.asText(),
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
    const store = Store.memoryStore(makeTemporaryDirectory());
    const electionDefinition =
      electionTwoPartyPrimaryFixtures.readElectionDefinition();
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
        expected: [['{}', 114]],
      },
      // each filter case
      {
        filter: { precinctIds: ['precinct-1'] },
        expected: [['{}', 36]],
      },
      {
        filter: { ballotStyleGroupIds: ['1M'] as BallotStyleGroupId[] },
        expected: [['{}', 47]],
      },
      {
        filter: { partyIds: ['0'] },
        expected: [['{}', 47]],
      },
      {
        filter: { votingMethods: ['precinct'] },
        expected: [['{}', 50]],
      },
      // empty filter case
      {
        filter: { votingMethods: [] },
        expected: [],
      },
      // trivial filter case
      {
        filter: { votingMethods: ['precinct', 'absentee'] },
        expected: [['{}', 114]],
      },
      // each grouping case
      {
        groupBy: { groupByBallotStyle: true },
        expected: [
          ['{"ballotStyleGroupId":"1M"}', 47],
          ['{"ballotStyleGroupId":"2F"}', 67],
        ],
      },
      {
        groupBy: { groupByParty: true },
        expected: [
          ['{"partyId":"0"}', 47],
          ['{"partyId":"1"}', 67],
        ],
      },
      {
        groupBy: { groupByPrecinct: true },
        expected: [
          ['{"precinctId":"precinct-1"}', 36],
          ['{"precinctId":"precinct-2"}', 78],
        ],
      },
      {
        groupBy: { groupByVotingMethod: true },
        expected: [
          ['{"votingMethod":"precinct"}', 50],
          ['{"votingMethod":"absentee"}', 64],
        ],
      },
      // composite filter & group cases
      {
        groupBy: { groupByVotingMethod: true, groupByPrecinct: true },
        expected: [
          ['{"precinctId":"precinct-1","votingMethod":"precinct"}', 11],
          ['{"precinctId":"precinct-1","votingMethod":"absentee"}', 25],
          ['{"precinctId":"precinct-2","votingMethod":"precinct"}', 39],
          ['{"precinctId":"precinct-2","votingMethod":"absentee"}', 39],
        ],
      },
      {
        filter: { ballotStyleGroupIds: ['1M'] as BallotStyleGroupId[] },
        groupBy: { groupByVotingMethod: true, groupByPrecinct: true },
        expected: [
          ['{"precinctId":"precinct-1","votingMethod":"precinct"}', 3],
          ['{"precinctId":"precinct-1","votingMethod":"absentee"}', 11],
          ['{"precinctId":"precinct-2","votingMethod":"precinct"}', 18],
          ['{"precinctId":"precinct-2","votingMethod":"absentee"}', 15],
        ],
      },
      {
        groupBy: { groupByPrecinct: true, groupByBatch: true },
        expected: [
          [
            `{"batchId":"${Tabulation.MANUAL_BATCH_ID}","precinctId":"precinct-1"}`,
            36,
          ],
          [
            `{"batchId":"${Tabulation.MANUAL_BATCH_ID}","precinctId":"precinct-2"}`,
            78,
          ],
        ],
      },
      {
        groupBy: { groupByPrecinct: true, groupByScanner: true },
        expected: [
          [
            `{"precinctId":"precinct-1","scannerId":"${Tabulation.MANUAL_SCANNER_ID}"}`,
            36,
          ],
          [
            `{"precinctId":"precinct-2","scannerId":"${Tabulation.MANUAL_SCANNER_ID}"}`,
            78,
          ],
        ],
      },
    ];

    for (const { filter, groupBy, expected } of testCases) {
      const manualResultsGroupMap = tabulateManualResults({
        electionId,
        store,
        filter,
        groupBy,
      }).unsafeUnwrap();

      for (const [groupKey, ballotCount] of expected) {
        expect(manualResultsGroupMap[groupKey]).toEqual(
          getSimpleManualResultsFixture(ballotCount)
        );
      }

      expect(Object.values(manualResultsGroupMap)).toHaveLength(
        Object.values(expected).length
      );
    }

    for (const { filter, groupBy, expected } of testCases) {
      const manualBallotCountsGroupMap = tabulateManualBallotCounts({
        electionId,
        store,
        filter,
        groupBy,
      }).unsafeUnwrap();

      for (const [groupKey, ballotCount] of expected) {
        expect(manualBallotCountsGroupMap[groupKey]).toEqual(ballotCount);
      }

      expect(Object.values(manualBallotCountsGroupMap)).toHaveLength(
        Object.values(expected).length
      );
    }
  });
});

test('extractManualWriteInSummary', () => {
  const election = electionTwoPartyPrimaryFixtures.readElection();
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
