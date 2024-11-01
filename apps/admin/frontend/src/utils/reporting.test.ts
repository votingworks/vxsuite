import { Election, Tabulation } from '@votingworks/types';
import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { err, ok } from '@votingworks/basics';
import type { ScannerBatch } from '@votingworks/admin-backend';
import {
  canonicalizeFilter,
  canonicalizeGroupBy,
  generateTallyReportPdfFilename,
  generateTitleForReport,
} from './reporting';

const scannerBatches: ScannerBatch[] = [
  {
    batchId: '12345678-0000-0000-0000-000000000000',
    scannerId: 'VX-00-001',
    label: 'Batch 1',
    electionId: 'id',
  },
  {
    batchId: '23456789-0000-0000-0000-000000000000',
    scannerId: 'VX-00-001',
    label: 'Batch 2',
    electionId: 'id',
  },
  {
    batchId: '34567890-0000-0000-0000-000000000000',
    scannerId: 'VX-00-002',
    label: 'Batch 3',
    electionId: 'id',
  },
];

test('generateTitleForReport', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  const unsupportedFilters: Tabulation.Filter[] = [
    {
      precinctIds: ['precinct-1', 'precinct-2'],
    },
    {
      ballotStyleIds: ['1M', '2F'],
    },
    {
      batchIds: ['1', '2'],
    },
    {
      scannerIds: ['1', '2'],
    },
    {
      votingMethods: ['absentee', 'precinct'],
    },
    {
      partyIds: ['0', '1'],
    },
    {
      precinctIds: ['precinct-1'],
      ballotStyleIds: ['1M'],
      batchIds: ['12345678-0000-0000-0000-000000000000'],
    },
    {
      scannerIds: ['VX-00-001'],
      votingMethods: ['absentee'],
      partyIds: ['1'],
    },
  ];

  for (const filter of unsupportedFilters) {
    expect(
      generateTitleForReport({ filter, electionDefinition, scannerBatches })
    ).toEqual(err('title-not-supported'));
  }

  const supportedFilters: Array<[filter: Tabulation.Filter, title: string]> = [
    [
      {
        precinctIds: ['precinct-1'],
      },
      'Precinct 1 Tally Report',
    ],
    [
      {
        ballotStyleIds: ['1M'],
      },
      'Ballot Style 1M Tally Report',
    ],
    [
      {
        votingMethods: ['absentee'],
      },
      'Absentee Ballot Tally Report',
    ],
    [
      {
        partyIds: ['0'],
      },
      'Mammal Party Tally Report',
    ],
    [
      {
        batchIds: ['12345678-0000-0000-0000-000000000000'],
      },
      'Scanner VX-00-001 Batch 1 12345678 Tally Report',
    ],
    [
      {
        scannerIds: ['VX-00-001'],
      },
      'Scanner VX-00-001 Tally Report',
    ],
    [
      {
        precinctIds: ['precinct-1'],
        ballotStyleIds: ['1M'],
      },
      'Ballot Style 1M Precinct 1 Tally Report',
    ],
    [
      {
        precinctIds: ['precinct-1'],
        votingMethods: ['absentee'],
      },
      'Precinct 1 Absentee Ballot Tally Report',
    ],
    [
      {
        ballotStyleIds: ['1M'],
        votingMethods: ['absentee'],
      },
      'Ballot Style 1M Absentee Ballot Tally Report',
    ],
    [
      {
        ballotStyleIds: ['1M'],
        partyIds: ['0'],
      },
      'Mammal Party Ballot Style 1M Tally Report',
    ],
    [
      {
        partyIds: ['0'],
        votingMethods: ['absentee'],
      },
      'Mammal Party Absentee Ballot Tally Report',
    ],
    [
      {
        partyIds: ['0'],
        precinctIds: ['precinct-1'],
      },
      'Mammal Party Precinct 1 Tally Report',
    ],
    [
      {
        scannerIds: ['VX-00-001'],
        batchIds: ['12345678-0000-0000-0000-000000000000'],
      },
      'Scanner VX-00-001 Batch 1 12345678 Tally Report',
    ],
    [
      {
        precinctIds: ['precinct-1'],
        scannerIds: ['VX-00-001'],
      },
      'Precinct 1 Scanner VX-00-001 Tally Report',
    ],
    [
      {
        batchIds: [Tabulation.MANUAL_BATCH_ID],
      },
      'Manual Batch Tally Report',
    ],
    [
      {
        batchIds: [Tabulation.MANUAL_BATCH_ID],
        scannerIds: [Tabulation.MANUAL_SCANNER_ID],
      },
      'Manual Batch Tally Report',
    ],
    [
      {
        scannerIds: [Tabulation.MANUAL_SCANNER_ID],
      },
      'Manual Batch Tally Report',
    ],
  ];

  for (const [filter, title] of supportedFilters) {
    expect(
      generateTitleForReport({ filter, electionDefinition, scannerBatches })
    ).toEqual(ok(title));
  }

  // Ballot Count Report
  expect(
    generateTitleForReport({
      filter: { precinctIds: ['precinct-1'] },
      electionDefinition,
      scannerBatches,
      reportType: 'Ballot Count',
    })
  ).toEqual(ok('Precinct 1 Ballot Count Report'));
});

test('canonicalizeFilter', () => {
  expect(canonicalizeFilter({})).toEqual({});
  expect(
    canonicalizeFilter({
      precinctIds: [],
      ballotStyleIds: [],
      batchIds: [],
      scannerIds: [],
      votingMethods: [],
      partyIds: [],
    })
  ).toEqual({});
  expect(
    canonicalizeFilter({
      precinctIds: ['b', 'a'],
      ballotStyleIds: ['b', 'a'],
      batchIds: ['b', 'a'],
      scannerIds: ['b', 'a'],
      votingMethods: ['precinct', 'absentee'],
      partyIds: ['b', 'a'],
    })
  ).toEqual({
    precinctIds: ['a', 'b'],
    ballotStyleIds: ['a', 'b'],
    batchIds: ['a', 'b'],
    scannerIds: ['a', 'b'],
    votingMethods: ['absentee', 'precinct'],
    partyIds: ['a', 'b'],
  });
});

test('canonicalizeGroupBy', () => {
  expect(canonicalizeGroupBy({})).toEqual({
    groupByScanner: false,
    groupByBatch: false,
    groupByBallotStyle: false,
    groupByPrecinct: false,
    groupByParty: false,
    groupByVotingMethod: false,
  });

  const allTrueGroupBy: Tabulation.GroupBy = {
    groupByScanner: true,
    groupByBatch: true,
    groupByBallotStyle: true,
    groupByPrecinct: true,
    groupByParty: true,
    groupByVotingMethod: true,
  };
  expect(canonicalizeGroupBy(allTrueGroupBy)).toEqual(allTrueGroupBy);
});

test('generateReportPdfFilename', () => {
  const { election } = electionTwoPartyPrimaryDefinition;
  const testCases: Array<{
    filter?: Tabulation.Filter;
    groupBy?: Tabulation.GroupBy;
    expectedFilename: string;
    isTestMode?: boolean;
    isOfficialResults?: boolean;
  }> = [
    {
      expectedFilename:
        'unofficial-full-election-tally-report__2023-12-09_15-59-32.pdf',
    },
    {
      isOfficialResults: true,
      expectedFilename:
        'official-full-election-tally-report__2023-12-09_15-59-32.pdf',
    },
    {
      groupBy: { groupByBallotStyle: true },
      expectedFilename:
        'unofficial-tally-reports-by-ballot-style__2023-12-09_15-59-32.pdf',
    },
    {
      groupBy: { groupByPrecinct: true },
      expectedFilename:
        'unofficial-tally-reports-by-precinct__2023-12-09_15-59-32.pdf',
    },
    {
      groupBy: { groupByVotingMethod: true },
      expectedFilename:
        'unofficial-tally-reports-by-voting-method__2023-12-09_15-59-32.pdf',
    },
    {
      groupBy: { groupByBatch: true },
      expectedFilename:
        'unofficial-tally-reports-by-batch__2023-12-09_15-59-32.pdf',
    },
    {
      groupBy: { groupByScanner: true },
      expectedFilename:
        'unofficial-tally-reports-by-scanner__2023-12-09_15-59-32.pdf',
    },
    {
      groupBy: { groupByPrecinct: true, groupByVotingMethod: true },
      expectedFilename:
        'unofficial-tally-reports-by-precinct-and-voting-method__2023-12-09_15-59-32.pdf',
    },
    {
      filter: { precinctIds: ['precinct-1', 'precinct-2'] },
      expectedFilename:
        'unofficial-custom-tally-report__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        precinctIds: ['precinct-1'],
        ballotStyleIds: ['1M'],
        votingMethods: ['absentee'],
      },
      expectedFilename:
        'unofficial-custom-tally-report__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        precinctIds: ['precinct-1'],
      },
      expectedFilename:
        'unofficial-precinct-1-tally-report__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        ballotStyleIds: ['1M'],
      },
      expectedFilename:
        'unofficial-ballot-style-1M-tally-report__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        votingMethods: ['absentee'],
      },
      expectedFilename:
        'unofficial-absentee-ballots-tally-report__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        scannerIds: ['VX-00-000'],
      },
      expectedFilename:
        'unofficial-scanner-VX-00-000-tally-report__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        batchIds: ['12345678-0000-0000-0000-000000000000'],
      },
      expectedFilename:
        'unofficial-batch-12345678-tally-report__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        ballotStyleIds: ['1M'],
        votingMethods: ['absentee'],
      },
      expectedFilename:
        'unofficial-ballot-style-1M-absentee-ballots-tally-report__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        votingMethods: ['absentee'],
      },
      groupBy: { groupByPrecinct: true },
      expectedFilename:
        'unofficial-absentee-ballots-tally-reports-by-precinct__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        votingMethods: ['absentee'],
      },
      isTestMode: true,
      expectedFilename:
        'TEST-unofficial-absentee-ballots-tally-report__2023-12-09_15-59-32.pdf',
    },
  ];

  for (const testCase of testCases) {
    expect(
      generateTallyReportPdfFilename({
        election,
        filter: testCase.filter ?? {},
        groupBy: testCase.groupBy ?? {},
        isTestMode: testCase.isTestMode ?? false,
        isOfficialResults: testCase.isOfficialResults ?? false,
        time: new Date(2023, 11, 9, 15, 59, 32),
      })
    ).toEqual(testCase.expectedFilename);
  }
});

test('generateReportPdfFilename when too long', () => {
  const { election: originalElection } = electionTwoPartyPrimaryDefinition;
  const election: Election = {
    ...originalElection,
    precincts: [
      {
        id: 'precinct-1',
        name: 'A'.repeat(256),
      },
      {
        id: 'precinct-2',
        name: 'Precinct 2',
      },
    ],
  };
  expect(
    generateTallyReportPdfFilename({
      election,
      filter: { precinctIds: ['precinct-1'] },
      groupBy: {},
      isTestMode: false,
      isOfficialResults: false,
      time: new Date(2022, 4, 11, 15, 2, 3),
    })
  ).toEqual('unofficial-custom-tally-report__2022-05-11_15-02-03.pdf');
});
