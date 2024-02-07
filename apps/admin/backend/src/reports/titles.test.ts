import { err, ok } from '@votingworks/basics';
import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { Admin, Tabulation } from '@votingworks/types';
import { generateTitleForReport } from './titles';
import { ScannerBatch } from '../types';

const MOCK_SCANNER_BATCHES: ScannerBatch[] = [
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
  const unsupportedFilters: Admin.FrontendReportingFilter[] = [
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
    {
      votingMethods: ['absentee'],
      adjudicationFlags: ['isBlank'],
    },
  ];

  for (const filter of unsupportedFilters) {
    expect(
      generateTitleForReport({
        filter,
        electionDefinition,
        scannerBatches: MOCK_SCANNER_BATCHES,
      })
    ).toEqual(err('title-not-supported'));
  }

  const supportedFilters: Array<
    [filter: Admin.FrontendReportingFilter, title: string]
  > = [
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
      'Scanner VX-00-001 Batch 12345678 Tally Report',
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
      'Scanner VX-00-001 Batch 12345678 Tally Report',
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
        districtIds: ['district-1'],
      },
      'District 1 Tally Report',
    ],
    [
      {
        districtIds: ['district-1'],
        votingMethods: ['absentee'],
      },
      'District 1 Absentee Ballot Tally Report',
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
      generateTitleForReport({
        filter,
        electionDefinition,
        scannerBatches: MOCK_SCANNER_BATCHES,
      })
    ).toEqual(ok(title));
  }

  const ballotCountFilters: Array<
    [filter: Admin.FrontendReportingFilter, title: string]
  > = [
    [
      {
        adjudicationFlags: ['isBlank'],
      },
      'Blank Ballot Count Report',
    ],
    [
      {
        adjudicationFlags: ['hasOvervote'],
      },
      'Overvoted Ballot Count Report',
    ],
    [
      {
        adjudicationFlags: ['hasUndervote'],
      },
      'Undervoted Ballot Count Report',
    ],
    [
      {
        adjudicationFlags: ['hasWriteIn'],
      },
      'Write-In Ballot Count Report',
    ],
  ];

  for (const [filter, title] of ballotCountFilters) {
    expect(
      generateTitleForReport({
        filter,
        electionDefinition,
        scannerBatches: MOCK_SCANNER_BATCHES,
        reportType: 'Ballot Count',
      })
    ).toEqual(ok(title));
  }
});
