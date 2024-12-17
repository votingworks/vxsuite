import { err, ok } from '@votingworks/basics';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { Admin, BallotStyleGroupId, Tabulation } from '@votingworks/types';
import { generateTitleForReport } from './titles';
import { ScannerBatch } from '../types';

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();

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
      ballotStyleGroupIds: ['1M', '2F'] as BallotStyleGroupId[],
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
      votingMethods: ['absentee'],
    },
    {
      precinctIds: ['precinct-1'],
      ballotStyleGroupIds: ['1M'] as BallotStyleGroupId[],
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
        reportType: 'Tally',
      })
    ).toEqual(err('title-not-supported'));
  }

  const supportedFilters: Array<
    [filter: Admin.FrontendReportingFilter, title: string]
  > = [
    [{}, 'Tally Report'],
    [
      {
        precinctIds: ['precinct-1'],
      },
      'Tally Report • Precinct 1',
    ],
    [
      {
        ballotStyleGroupIds: ['1M'] as BallotStyleGroupId[],
      },
      'Tally Report • Ballot Style 1M',
    ],
    [
      {
        votingMethods: ['absentee'],
      },
      'Tally Report • Absentee Ballots',
    ],
    [
      {
        partyIds: ['0'],
      },
      'Tally Report • Mammal Party',
    ],
    [
      {
        batchIds: ['12345678-0000-0000-0000-000000000000'],
      },
      'Tally Report • Scanner VX-00-001, Batch 1',
    ],
    [
      {
        scannerIds: ['VX-00-001'],
      },
      'Tally Report • Scanner VX-00-001',
    ],
    [
      {
        districtIds: ['district-1'],
      },
      'Tally Report • District 1',
    ],
    [
      {
        batchIds: [Tabulation.MANUAL_BATCH_ID],
      },
      'Tally Report • Manual Tallies',
    ],
    [
      {
        scannerIds: [Tabulation.MANUAL_SCANNER_ID],
      },
      'Tally Report • Manual Tallies',
    ],
  ];

  for (const [filter, title] of supportedFilters) {
    expect(
      generateTitleForReport({
        filter,
        electionDefinition,
        scannerBatches: MOCK_SCANNER_BATCHES,
        reportType: 'Tally',
      })
    ).toEqual(ok(title));
  }

  const ballotCountFilters: Array<
    [filter: Admin.FrontendReportingFilter, title: string]
  > = [
    [{}, 'Ballot Count Report'],
    [
      {
        adjudicationFlags: ['isBlank'],
      },
      'Ballot Count Report • Blank Ballots',
    ],
    [
      {
        adjudicationFlags: ['hasOvervote'],
      },
      'Ballot Count Report • Ballots With Overvotes',
    ],
    [
      {
        adjudicationFlags: ['hasUndervote'],
      },
      'Ballot Count Report • Ballots With Undervotes',
    ],
    [
      {
        adjudicationFlags: ['hasWriteIn'],
      },
      'Ballot Count Report • Ballots With Write-Ins',
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
