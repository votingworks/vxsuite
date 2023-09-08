import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { DEFAULT_SYSTEM_SETTINGS, Tabulation } from '@votingworks/types';
import { find } from '@votingworks/basics';
import {
  MockCastVoteRecordFile,
  addMockCvrFileToStore,
} from '../../test/mock_cvr_file';
import { generateResultsCsv } from './csv_results';
import { parseCsv, streamToString } from '../../test/csv';
import { Store } from '../store';

test('uses appropriate headers', async () => {
  const store = Store.memoryStore();
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
  });
  store.setCurrentElectionId(electionId);

  // add some mock cast vote records with one vote each
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleId: '1M',
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
    'Votes',
  ];

  const SHARED_ROW_VALUES: Record<string, string> = {
    'Precinct ID': 'precinct-1',
    Precinct: 'Precinct 1',
    'Ballot Style ID': '1M',
    Party: 'Mammal',
    'Party ID': '0',
    'Voting Method': 'Precinct',
    'Batch ID': 'batch-1',
    'Scanner ID': 'scanner-1',
    Contest: 'Ballot Measure 3',
    'Contest ID': 'fishing',
    Selection: 'YES',
    'Selection ID': 'ban-fishing',
    Votes: '1',
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
      additionalHeaders: ['Scanner ID', 'Batch ID'],
    },
    // redundant multiple groupings
    {
      groupBy: { groupByParty: true, groupByBallotStyle: true },
      additionalHeaders: ['Party', 'Party ID', 'Ballot Style ID'],
    },
    {
      groupBy: { groupByScanner: true, groupByBatch: true },
      additionalHeaders: ['Scanner ID', 'Batch ID'],
    },
    // multiple groupings
    {
      groupBy: { groupByPrecinct: true, groupByVotingMethod: true },
      additionalHeaders: ['Precinct', 'Precinct ID', 'Voting Method'],
    },
    // single filters
    {
      filter: { ballotStyleIds: ['1M'] },
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
      additionalHeaders: ['Scanner ID', 'Batch ID'],
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
      filter: { ballotStyleIds: ['1M', '2F'] },
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
    const stream = await generateResultsCsv({
      store,
      filter: testCase.filter,
      groupBy: testCase.groupBy,
    });
    const fileContents = await streamToString(stream);
    const { headers, rows } = parseCsv(fileContents);
    expect(headers).toEqual([...testCase.additionalHeaders, ...SHARED_HEADERS]);

    const row = find(
      rows,
      (r) => r['Votes'] === '1' && r['Selection ID'] === 'ban-fishing'
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
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
  });
  store.setCurrentElectionId(electionId);

  // no CVRs, so all groups should be empty
  const stream = await generateResultsCsv({
    store,
    filter: {},
    groupBy: { groupByPrecinct: true },
  });
  const fileContents = await streamToString(stream);
  const { rows } = parseCsv(fileContents);

  find(rows, (r) => r['Precinct'] === 'Precinct 1');
  find(rows, (r) => r['Precinct'] === 'Precinct 2');
});

test('included contests are specific to each results group', async () => {
  const store = Store.memoryStore();
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
  });
  store.setCurrentElectionId(electionId);

  const stream = await generateResultsCsv({
    store,
    filter: {},
    groupBy: { groupByBallotStyle: true },
  });
  const fileContents = await streamToString(stream);
  const { rows } = parseCsv(fileContents);

  function rowExists(contestId: string, ballotStyleId: string) {
    return rows.some(
      (r) =>
        r['Contest ID'] === contestId && r['Ballot Style ID'] === ballotStyleId
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
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
  });
  store.setCurrentElectionId(electionId);

  const stream = await generateResultsCsv({
    store,
    filter: { ballotStyleIds: ['1M'] },
  });
  const fileContents = await streamToString(stream);
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
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
  });
  store.setCurrentElectionId(electionId);

  // grouping on voting method should include both precinct and absentee rows
  const byVotingMethodStream = await generateResultsCsv({
    store,
    groupBy: { groupByVotingMethod: true },
  });
  const byVotingMethodFileContents = await streamToString(byVotingMethodStream);
  const { rows: byVotingMethodRows } = parseCsv(byVotingMethodFileContents);
  expect(
    byVotingMethodRows.some((r) => r['Voting Method'] === 'Absentee')
  ).toBeTruthy();
  expect(
    byVotingMethodRows.some((r) => r['Voting Method'] === 'Precinct')
  ).toBeTruthy();

  // but if we add on a filter that excludes absentee, absentee rows should not be included
  const precinctStream = await generateResultsCsv({
    store,
    groupBy: { groupByVotingMethod: true },
    filter: { votingMethods: ['precinct'] },
  });
  const precinctFileContests = await streamToString(precinctStream);
  const { rows: precinctRows } = parseCsv(precinctFileContests);
  expect(
    precinctRows.some((r) => r['Voting Method'] === 'Absentee')
  ).toBeFalsy();
  expect(
    precinctRows.some((r) => r['Voting Method'] === 'Precinct')
  ).toBeTruthy();
});
