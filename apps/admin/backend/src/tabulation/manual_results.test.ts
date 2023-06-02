import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { buildManualResultsFixture } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { Tabulation } from '@votingworks/types';
import { Store } from '../store';
import {
  isFilterCompatibleWithManualResults,
  isGroupByCompatibleWithManualResults,
  tabulateManualResults,
} from './manual_results';
import { ManualResultsFilter, ManualResultsGroupBy } from '../types';

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
      ballotStyleIds: ['1M'],
      precinctIds: ['precinct-1'],
      partyIds: ['0'],
    })
  ).toEqual(true);
});

test('isGroupByCompatibleWithManualResults', () => {
  expect(isGroupByCompatibleWithManualResults({ groupByBatch: true })).toEqual(
    false
  );
  expect(
    isGroupByCompatibleWithManualResults({ groupByScanner: true })
  ).toEqual(false);
  expect(
    isGroupByCompatibleWithManualResults({
      groupByBallotStyle: true,
      groupByPrecinct: true,
      groupByParty: true,
      groupByVotingMethod: true,
    })
  ).toEqual(true);
});

describe('queryManualResults', () => {
  test('on incompatible filter', () => {
    const store = Store.memoryStore();
    const electionId = store.addElection(
      electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
    );
    store.setCurrentElectionId(electionId);

    expect(
      tabulateManualResults({
        electionId,
        store,
        filter: { batchIds: ['batch-1'] },
      }).err()
    ).toEqual({ type: 'incompatible-filter' });
  });

  test('on incompatible group by', () => {
    const store = Store.memoryStore();
    const electionId = store.addElection(
      electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
    );
    store.setCurrentElectionId(electionId);

    expect(
      tabulateManualResults({
        electionId,
        store,
        groupBy: { groupByBatch: true },
      }).err()
    ).toEqual({ type: 'incompatible-group-by' });
  });

  test('grouping and filtering', () => {
    const store = Store.memoryStore();
    const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
    const { election, electionData } = electionDefinition;
    const electionId = store.addElection(electionData);
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
      ballotStyleId: '1M',
      votingMethod: 'precinct',
      manualResults: getSimpleManualResultsFixture(3),
    });
    store.setManualResults({
      electionId,
      precinctId: 'precinct-1',
      ballotStyleId: '1M',
      votingMethod: 'absentee',
      manualResults: getSimpleManualResultsFixture(11),
    });
    store.setManualResults({
      electionId,
      precinctId: 'precinct-1',
      ballotStyleId: '2F',
      votingMethod: 'precinct',
      manualResults: getSimpleManualResultsFixture(8),
    });
    store.setManualResults({
      electionId,
      precinctId: 'precinct-1',
      ballotStyleId: '2F',
      votingMethod: 'absentee',
      manualResults: getSimpleManualResultsFixture(14),
    });
    store.setManualResults({
      electionId,
      precinctId: 'precinct-2',
      ballotStyleId: '1M',
      votingMethod: 'precinct',
      manualResults: getSimpleManualResultsFixture(18),
    });
    store.setManualResults({
      electionId,
      precinctId: 'precinct-2',
      ballotStyleId: '1M',
      votingMethod: 'absentee',
      manualResults: getSimpleManualResultsFixture(15),
    });
    store.setManualResults({
      electionId,
      precinctId: 'precinct-2',
      ballotStyleId: '2F',
      votingMethod: 'precinct',
      manualResults: getSimpleManualResultsFixture(21),
    });
    store.setManualResults({
      electionId,
      precinctId: 'precinct-2',
      ballotStyleId: '2F',
      votingMethod: 'absentee',
      manualResults: getSimpleManualResultsFixture(24),
    });

    const testCases: Array<{
      filter?: ManualResultsFilter;
      groupBy?: ManualResultsGroupBy;
      expected: Array<
        [
          groupKey: Tabulation.GroupKey,
          tally: number,
          groupSpecifier: Tabulation.GroupSpecifier
        ]
      >;
    }> = [
      // no filter or group case
      {
        expected: [['root', 114, {}]],
      },
      // each filter case
      {
        filter: { precinctIds: ['precinct-1'] },
        expected: [['root', 36, {}]],
      },
      {
        filter: { ballotStyleIds: ['1M'] },
        expected: [['root', 47, {}]],
      },
      {
        filter: { partyIds: ['0'] },
        expected: [['root', 47, {}]],
      },
      {
        filter: { votingMethods: ['precinct'] },
        expected: [['root', 50, {}]],
      },
      // empty filter case
      {
        filter: { votingMethods: [] },
        expected: [],
      },
      // trivial filter case
      {
        filter: { votingMethods: ['precinct', 'absentee'] },
        expected: [['root', 114, {}]],
      },
      // each grouping case
      {
        groupBy: { groupByBallotStyle: true },
        expected: [
          ['root&1M', 47, { ballotStyleId: '1M' }],
          ['root&2F', 67, { ballotStyleId: '2F' }],
        ],
      },
      {
        groupBy: { groupByParty: true },
        expected: [
          ['root&0', 47, { partyId: '0' }],
          ['root&1', 67, { partyId: '1' }],
        ],
      },
      {
        groupBy: { groupByPrecinct: true },
        expected: [
          ['root&precinct-1', 36, { precinctId: 'precinct-1' }],
          ['root&precinct-2', 78, { precinctId: 'precinct-2' }],
        ],
      },
      {
        groupBy: { groupByVotingMethod: true },
        expected: [
          ['root&precinct', 50, { votingMethod: 'precinct' }],
          ['root&absentee', 64, { votingMethod: 'absentee' }],
        ],
      },
      // composite filter & group cases
      {
        groupBy: { groupByVotingMethod: true, groupByPrecinct: true },
        expected: [
          [
            'root&precinct-1&precinct',
            11,
            { precinctId: 'precinct-1', votingMethod: 'precinct' },
          ],
          [
            'root&precinct-1&absentee',
            25,
            { precinctId: 'precinct-1', votingMethod: 'absentee' },
          ],
          [
            'root&precinct-2&precinct',
            39,
            { precinctId: 'precinct-2', votingMethod: 'precinct' },
          ],
          [
            'root&precinct-2&absentee',
            39,
            { precinctId: 'precinct-2', votingMethod: 'absentee' },
          ],
        ],
      },
      {
        filter: { ballotStyleIds: ['1M'] },
        groupBy: { groupByVotingMethod: true, groupByPrecinct: true },
        expected: [
          [
            'root&precinct-1&precinct',
            3,
            { precinctId: 'precinct-1', votingMethod: 'precinct' },
          ],
          [
            'root&precinct-1&absentee',
            11,
            { precinctId: 'precinct-1', votingMethod: 'absentee' },
          ],
          [
            'root&precinct-2&precinct',
            18,
            { precinctId: 'precinct-2', votingMethod: 'precinct' },
          ],
          [
            'root&precinct-2&absentee',
            15,
            { precinctId: 'precinct-2', votingMethod: 'absentee' },
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

      for (const [groupKey, ballotCount, groupSpecifier] of expected) {
        expect(result.ok()[groupKey]).toEqual({
          ...groupSpecifier,
          ...getSimpleManualResultsFixture(ballotCount),
        });
      }

      expect(Object.values(result.ok())).toHaveLength(
        Object.values(expected).length
      );
    }
  });
});
