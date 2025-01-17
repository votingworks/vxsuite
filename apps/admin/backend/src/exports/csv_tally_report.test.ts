import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import {
  BallotStyleGroupId,
  DEFAULT_SYSTEM_SETTINGS,
  Tabulation,
} from '@votingworks/types';
import { find } from '@votingworks/basics';
import { buildManualResultsFixture } from '@votingworks/utils';
import {
  MockCastVoteRecordFile,
  addMockCvrFileToStore,
} from '../../test/mock_cvr_file';
import { generateTallyReportCsv } from './csv_tally_report';
import { iterableToString, parseCsv } from '../../test/csv';
import { Store } from '../store';

test('uses appropriate headers', async () => {
  const store = Store.memoryStore();
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  // add some mock cast vote records with one vote each
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
      batchId: 'batch-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 1,
    },
  ];
  addMockCvrFileToStore({ electionId, mockCastVoteRecordFile, store });

  const SHARED_HEADERS = [
    'Contest',
    'Contest ID',
    'Selection',
    'Selection ID',
    'Total Votes',
  ];

  const SHARED_ROW_VALUES: Record<string, string> = {
    'Precinct ID': 'precinct-1',
    Precinct: 'Precinct 1',
    'Ballot Style ID': '1M',
    Party: 'Mammal',
    'Party ID': '0',
    'Voting Method': 'Precinct',
    Batch: 'Batch batch-1',
    'Batch ID': 'batch-1',
    'Scanner ID': 'scanner-1',
    Contest: 'Ballot Measure 3',
    'Contest ID': 'fishing',
    Selection: 'YES',
    'Selection ID': 'ban-fishing',
    'Total Votes': '1',
  };

  const testCases: Array<{
    filter?: Tabulation.Filter;
    groupBy?: Tabulation.GroupBy;
    additionalHeaders: string[];
    additionalRowAttributes?: Record<string, string>;
  }> = [
    // single groupings
    {
      groupBy: { groupByPrecinct: true },
      additionalHeaders: ['Precinct', 'Precinct ID'],
    },
    {
      groupBy: { groupByParty: true },
      additionalHeaders: ['Party', 'Party ID'],
    },
    {
      groupBy: { groupByBallotStyle: true },
      additionalHeaders: ['Party', 'Party ID', 'Ballot Style ID'],
    },
    {
      groupBy: { groupByVotingMethod: true },
      additionalHeaders: ['Voting Method'],
    },
    {
      groupBy: { groupByScanner: true },
      additionalHeaders: ['Scanner ID'],
    },
    {
      groupBy: { groupByBatch: true },
      additionalHeaders: ['Scanner ID', 'Batch', 'Batch ID'],
    },
    // redundant multiple groupings
    {
      groupBy: { groupByParty: true, groupByBallotStyle: true },
      additionalHeaders: ['Party', 'Party ID', 'Ballot Style ID'],
    },
    {
      groupBy: { groupByScanner: true, groupByBatch: true },
      additionalHeaders: ['Scanner ID', 'Batch', 'Batch ID'],
    },
    // multiple groupings
    {
      groupBy: { groupByPrecinct: true, groupByVotingMethod: true },
      additionalHeaders: ['Precinct', 'Precinct ID', 'Voting Method'],
    },
    // single filters
    {
      filter: { ballotStyleGroupIds: ['1M'] as BallotStyleGroupId[] },
      additionalHeaders: ['Party', 'Party ID', 'Ballot Style ID'],
    },
    {
      filter: { partyIds: ['0'] },
      additionalHeaders: ['Party', 'Party ID'],
    },
    {
      filter: { scannerIds: ['scanner-1'] },
      additionalHeaders: ['Scanner ID'],
    },
    {
      filter: { batchIds: ['batch-1'] },
      additionalHeaders: ['Scanner ID', 'Batch', 'Batch ID'],
    },
    // multi-filters requiring multi-value columns
    {
      filter: { precinctIds: ['precinct-1', 'precinct-2'] },
      additionalHeaders: ['Included Precincts'],
      additionalRowAttributes: {
        'Included Precincts': 'Precinct 1, Precinct 2',
      },
    },
    {
      filter: { votingMethods: ['absentee', 'precinct'] },
      additionalHeaders: ['Included Voting Methods'],
      additionalRowAttributes: {
        'Included Voting Methods': 'Absentee, Precinct',
      },
    },
    {
      filter: { ballotStyleGroupIds: ['1M', '2F'] as BallotStyleGroupId[] },
      additionalHeaders: ['Included Ballot Styles'],
      additionalRowAttributes: {
        'Included Ballot Styles': '1M, 2F',
      },
    },
    {
      filter: { partyIds: ['0', '1'] },
      additionalHeaders: ['Included Parties'],
      additionalRowAttributes: {
        'Included Parties': 'Mammal, Fish',
      },
    },
    {
      filter: { batchIds: ['batch-1', 'batch-2'] },
      additionalHeaders: ['Included Batches'],
      additionalRowAttributes: {
        'Included Batches': 'batch-1, batch-2',
      },
    },
    {
      filter: { scannerIds: ['scanner-1', 'scanner-2'] },
      additionalHeaders: ['Included Scanners'],
      additionalRowAttributes: {
        'Included Scanners': 'scanner-1, scanner-2',
      },
    },
    // multi-filter broken up by grouping
    {
      filter: { precinctIds: ['precinct-1', 'precinct-2'] },
      groupBy: { groupByPrecinct: true },
      additionalHeaders: ['Precinct', 'Precinct ID'],
    },
    // miscellaneous combinations
    {
      filter: { precinctIds: ['precinct-1'] },
      groupBy: { groupByVotingMethod: true },
      additionalHeaders: ['Precinct', 'Precinct ID', 'Voting Method'],
    },
    {
      filter: { votingMethods: ['precinct'] },
      groupBy: { groupByPrecinct: true },
      additionalHeaders: ['Precinct', 'Precinct ID', 'Voting Method'],
    },
    {
      filter: {
        precinctIds: ['precinct-1', 'precinct-2'],
        votingMethods: ['precinct'],
      },
      groupBy: { groupByBallotStyle: true },
      additionalHeaders: [
        'Party',
        'Party ID',
        'Ballot Style ID',
        'Voting Method',
        'Included Precincts',
      ],
      additionalRowAttributes: {
        'Included Precincts': 'Precinct 1, Precinct 2',
      },
    },
  ];

  for (const testCase of testCases) {
    const iterable = generateTallyReportCsv({
      store,
      filter: testCase.filter,
      groupBy: testCase.groupBy,
    });
    const fileContents = await iterableToString(iterable);
    const { headers, rows } = parseCsv(fileContents);
    expect(headers).toEqual([...testCase.additionalHeaders, ...SHARED_HEADERS]);

    const row = find(
      rows,
      (r) => r['Total Votes'] === '1' && r['Selection ID'] === 'ban-fishing'
    );
    const expectedAttributes: Record<string, string> = {
      ...SHARED_ROW_VALUES,
      ...(testCase.additionalRowAttributes || {}),
    };
    for (const [header, value] of Object.entries(row)) {
      expect(value).toEqual(expectedAttributes[header]);
    }
  }
});

test('includes rows for empty but known result groups', async () => {
  const store = Store.memoryStore();
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  // no CVRs, so all groups should be empty
  const iterable = generateTallyReportCsv({
    store,
    filter: {},
    groupBy: { groupByPrecinct: true },
  });
  const fileContents = await iterableToString(iterable);
  const { rows } = parseCsv(fileContents);

  find(rows, (r) => r['Precinct'] === 'Precinct 1');
  find(rows, (r) => r['Precinct'] === 'Precinct 2');
});

test('included contests are specific to each results group', async () => {
  const store = Store.memoryStore();
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  const iterable = generateTallyReportCsv({
    store,
    filter: {},
    groupBy: { groupByBallotStyle: true },
  });
  const fileContents = await iterableToString(iterable);
  const { rows } = parseCsv(fileContents);

  function rowExists(contestId: string, ballotStyleGroupId: string) {
    return rows.some(
      (r) =>
        r['Contest ID'] === contestId &&
        r['Ballot Style ID'] === ballotStyleGroupId
    );
  }

  // mammal ballot style entries should include mammal and nonpartisan contests, but not fish
  expect(rowExists('best-animal-mammal', '1M')).toBeTruthy();
  expect(rowExists('fishing', '1M')).toBeTruthy();
  expect(rowExists('best-animal-fish', '1M')).toBeFalsy();

  // fish ballot style entries should include fish and nonpartisan contests, but not mammal
  expect(rowExists('best-animal-mammal', '2F')).toBeFalsy();
  expect(rowExists('fishing', '2F')).toBeTruthy();
  expect(rowExists('best-animal-fish', '2F')).toBeTruthy();
});

test('included contests are restricted by the overall export filter', async () => {
  const store = Store.memoryStore();
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  const iterable = generateTallyReportCsv({
    store,
    filter: { ballotStyleGroupIds: ['1M'] as BallotStyleGroupId[] },
  });
  const fileContents = await iterableToString(iterable);
  const { rows } = parseCsv(fileContents);

  function rowExists(contestId: string) {
    return rows.some((r) => r['Contest ID'] === contestId);
  }

  // should include mammal and nonpartisan contests, but not fish
  expect(rowExists('best-animal-mammal')).toBeTruthy();
  expect(rowExists('fishing')).toBeTruthy();
  expect(rowExists('best-animal-fish')).toBeFalsy();
});

test('does not include results groups when they are excluded by the filter', async () => {
  const store = Store.memoryStore();
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  // grouping on voting method should include both precinct and absentee rows
  const byVotingMethodIterable = generateTallyReportCsv({
    store,
    groupBy: { groupByVotingMethod: true },
  });
  const byVotingMethodFileContents = await iterableToString(
    byVotingMethodIterable
  );
  const { rows: byVotingMethodRows } = parseCsv(byVotingMethodFileContents);
  expect(
    byVotingMethodRows.some((r) => r['Voting Method'] === 'Absentee')
  ).toBeTruthy();
  expect(
    byVotingMethodRows.some((r) => r['Voting Method'] === 'Precinct')
  ).toBeTruthy();

  // but if we add on a filter that excludes absentee, absentee rows should not be included
  const precinctIterable = generateTallyReportCsv({
    store,
    groupBy: { groupByVotingMethod: true },
    filter: { votingMethods: ['precinct'] },
  });
  const precinctFileContests = await iterableToString(precinctIterable);
  const { rows: precinctRows } = parseCsv(precinctFileContests);
  expect(
    precinctRows.some((r) => r['Voting Method'] === 'Absentee')
  ).toBeFalsy();
  expect(
    precinctRows.some((r) => r['Voting Method'] === 'Precinct')
  ).toBeTruthy();
});

test('incorporates manual data', async () => {
  const store = Store.memoryStore();
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

  // add some mock cast vote records with one vote each
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
      batchId: 'batch-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: {
        'zoo-council-mammal': ['lion', 'kangaroo', 'elephant'],
        fishing: ['ban-fishing'],
      },
      card: { type: 'bmd' },
      multiplier: 1,
    },
  ];
  addMockCvrFileToStore({ electionId, mockCastVoteRecordFile, store });

  store.setManualResults({
    electionId,
    precinctId: 'precinct-1',
    ballotStyleGroupId: '1M' as BallotStyleGroupId,
    votingMethod: 'absentee',
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 20,
      contestResultsSummaries: {
        'zoo-council-mammal': {
          type: 'candidate',
          ballots: 20,
          overvotes: 3,
          undervotes: 2,
          officialOptionTallies: {
            lion: 10,
            kangaroo: 5,
          },
        },
        fishing: {
          type: 'yesno',
          ballots: 20,
          undervotes: 6,
          overvotes: 4,
          yesTally: 1,
          noTally: 9,
        },
      },
    }),
  });

  const iterable = generateTallyReportCsv({
    store,
  });
  const fileContents = await iterableToString(iterable);
  const { rows } = parseCsv(fileContents);
  expect(
    rows
      .filter((r) => r['Contest ID'] === 'zoo-council-mammal')
      .map((row) => [
        row['Selection ID'],
        row['Manual Votes'],
        row['Scanned Votes'],
        row['Total Votes'],
      ])
  ).toEqual([
    ['zebra', '0', '0', '0'],
    ['lion', '10', '1', '11'],
    ['kangaroo', '5', '1', '6'],
    ['elephant', '0', '1', '1'],
    ['overvotes', '3', '0', '3'],
    ['undervotes', '2', '0', '2'],
  ]);

  expect(
    rows
      .filter((r) => r['Contest ID'] === 'fishing')
      .map((row) => [
        row['Selection ID'],
        row['Manual Votes'],
        row['Scanned Votes'],
        row['Total Votes'],
      ])
  ).toEqual([
    ['ban-fishing', '1', '1', '2'],
    ['allow-fishing', '9', '0', '9'],
    ['overvotes', '4', '0', '4'],
    ['undervotes', '6', '0', '6'],
  ]);
});

test('separate rows for manual data when grouping by an incompatible dimension', async () => {
  const store = Store.memoryStore();
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

  // add some mock cast vote records with one vote each
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
      batchId: 'batch-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: {
        fishing: ['ban-fishing'],
      },
      card: { type: 'bmd' },
      multiplier: 1,
    },
  ];
  addMockCvrFileToStore({ electionId, mockCastVoteRecordFile, store });

  store.setManualResults({
    electionId,
    precinctId: 'precinct-1',
    ballotStyleGroupId: '1M' as BallotStyleGroupId,
    votingMethod: 'absentee',
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 20,
      contestResultsSummaries: {
        fishing: {
          type: 'yesno',
          ballots: 1,
          undervotes: 0,
          overvotes: 0,
          yesTally: 1,
          noTally: 0,
        },
      },
    }),
  });

  // results should be same for these two groupings
  for (const groupBy of [
    { groupByBatch: true },
    { groupByBatch: true, groupByScanner: true },
  ]) {
    const iterable = generateTallyReportCsv({
      store,
      groupBy,
    });

    const fileContents = await iterableToString(iterable);
    const { rows } = parseCsv(fileContents);
    expect(
      rows
        .filter((r) => r['Contest ID'] === 'fishing')
        .map((row) => [
          row['Batch'],
          row['Batch ID'],
          row['Scanner ID'],
          row['Selection ID'],
          row['Manual Votes'],
          row['Scanned Votes'],
          row['Total Votes'],
        ])
    ).toEqual([
      ['Batch batch-1', 'batch-1', 'scanner-1', 'ban-fishing', '0', '1', '1'],
      ['Batch batch-1', 'batch-1', 'scanner-1', 'allow-fishing', '0', '0', '0'],
      ['Batch batch-1', 'batch-1', 'scanner-1', 'overvotes', '0', '0', '0'],
      ['Batch batch-1', 'batch-1', 'scanner-1', 'undervotes', '0', '0', '0'],
      [
        'Manual Tallies',
        'NO_BATCH__MANUAL',
        'NO_SCANNER__MANUAL',
        'ban-fishing',
        '1',
        '0',
        '1',
      ],
      [
        'Manual Tallies',
        'NO_BATCH__MANUAL',
        'NO_SCANNER__MANUAL',
        'allow-fishing',
        '0',
        '0',
        '0',
      ],
      [
        'Manual Tallies',
        'NO_BATCH__MANUAL',
        'NO_SCANNER__MANUAL',
        'overvotes',
        '0',
        '0',
        '0',
      ],
      [
        'Manual Tallies',
        'NO_BATCH__MANUAL',
        'NO_SCANNER__MANUAL',
        'undervotes',
        '0',
        '0',
        '0',
      ],
    ]);
  }

  const iterable = generateTallyReportCsv({
    store,
    groupBy: { groupByScanner: true },
  });

  const fileContents = await iterableToString(iterable);
  const { rows } = parseCsv(fileContents);
  expect(
    rows
      .filter((r) => r['Contest ID'] === 'fishing')
      .map((row) => [
        row['Scanner ID'],
        row['Selection ID'],
        row['Manual Votes'],
        row['Scanned Votes'],
        row['Total Votes'],
      ])
  ).toEqual([
    ['scanner-1', 'ban-fishing', '0', '1', '1'],
    ['scanner-1', 'allow-fishing', '0', '0', '0'],
    ['scanner-1', 'overvotes', '0', '0', '0'],
    ['scanner-1', 'undervotes', '0', '0', '0'],
    ['NO_SCANNER__MANUAL', 'ban-fishing', '1', '0', '1'],
    ['NO_SCANNER__MANUAL', 'allow-fishing', '0', '0', '0'],
    ['NO_SCANNER__MANUAL', 'overvotes', '0', '0', '0'],
    ['NO_SCANNER__MANUAL', 'undervotes', '0', '0', '0'],
  ]);
});
