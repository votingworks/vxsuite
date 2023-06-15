import React from 'react';

import {
  electionWithMsEitherNeither,
  multiPartyPrimaryElectionDefinition,
} from '@votingworks/fixtures';
import { TallyCategory, Tabulation } from '@votingworks/types';

import { assert } from '@votingworks/basics';
import { ScannerBatch } from '@votingworks/admin-backend';
import {
  getByText as domGetByText,
  screen,
} from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';

import { BallotCountsTable } from './ballot_counts_table';
import { ApiMock, createApiMock } from '../../test/helpers/api_mock';
import { mockBallotCountsTableGroupBy } from '../../test/helpers/api_expect_helpers';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

function mockCardCounts(bmdCount: number): Tabulation.CardCounts {
  return {
    bmd: bmdCount,
    hmpb: [],
  };
}

describe('Ballot Counts by Precinct', () => {
  const cardCountsByPrecinct: Array<Tabulation.GroupOf<Tabulation.CardCounts>> =
    [
      {
        precinctId: '6526',
        ...mockCardCounts(38),
      },
      {
        precinctId: '6529',
        ...mockCardCounts(52),
      },
      {
        precinctId: '6528',
        ...mockCardCounts(22),
      },
    ];

  it('renders as expected when there is no tally data', async () => {
    apiMock.expectGetCardCounts(
      mockBallotCountsTableGroupBy({ groupByPrecinct: true }),
      []
    );
    apiMock.expectGetScannerBatches([]);
    apiMock.expectGetManualResultsMetadata([]);
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Precinct} />,
      { apiMock }
    );
    await screen.findByText('Precinct');
    for (const precinct of electionWithMsEitherNeither.precincts) {
      getByText(precinct.name);
      const tableRow = getByText(precinct.name).closest('tr');
      expect(tableRow).toBeDefined();
      expect(domGetByText(tableRow!, 0)).toBeInTheDocument();
      expect(
        domGetByText(tableRow!, `Unofficial ${precinct.name} Tally Report`)
      ).toBeInTheDocument();
    }
    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 0)).toBeInTheDocument();
    expect(
      domGetByText(tableRow!, 'Unofficial Tally Reports for All Precincts')
    ).toBeInTheDocument();

    // There should be 2 more rows then the number of precincts (header row and totals row)
    expect(getAllByTestId('table-row').length).toEqual(
      electionWithMsEitherNeither.precincts.length + 2
    );
  });

  it('renders as expected when there is tally data', async () => {
    apiMock.expectGetCardCounts(
      mockBallotCountsTableGroupBy({ groupByPrecinct: true }),
      cardCountsByPrecinct
    );
    apiMock.expectGetScannerBatches([]);
    apiMock.expectGetManualResultsMetadata([]);
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Precinct} />,
      {
        apiMock,
      }
    );
    await screen.findByText('Precinct');
    for (const precinct of electionWithMsEitherNeither.precincts) {
      // Expect that 0 ballots are counted when the precinct is missing in the dictionary or the tally says there are 0 ballots
      const expectedNumberOfBallots =
        cardCountsByPrecinct.find((cc) => cc.precinctId === precinct.id)?.bmd ??
        0;
      getByText(precinct.name);
      const tableRow = getByText(precinct.name).closest('tr');
      expect(tableRow).toBeDefined();
      expect(
        domGetByText(tableRow!, expectedNumberOfBallots)
      ).toBeInTheDocument();
      expect(
        domGetByText(tableRow!, `Unofficial ${precinct.name} Tally Report`)
      ).toBeInTheDocument();
    }
    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 112)).toBeInTheDocument();
    expect(
      domGetByText(tableRow!, 'Unofficial Tally Reports for All Precincts')
    ).toBeInTheDocument();

    // There should be 2 more rows then the number of precincts (header row and totals row)
    expect(getAllByTestId('table-row').length).toEqual(
      electionWithMsEitherNeither.precincts.length + 2
    );
  });
});

describe('Ballot Counts by Scanner', () => {
  const cardCountsByScanner: Array<Tabulation.GroupOf<Tabulation.CardCounts>> =
    [
      {
        scannerId: 'scanner-1',
        ...mockCardCounts(25),
      },
      {
        scannerId: 'scanner-2',
        ...mockCardCounts(52),
      },
    ];
  const scannerIds = ['scanner-1', 'scanner-2'];

  it('renders as expected when there is no tally data', async () => {
    apiMock.expectGetCardCounts(
      mockBallotCountsTableGroupBy({ groupByScanner: true }),
      []
    );
    apiMock.expectGetScannerBatches([]);
    apiMock.expectGetManualResultsMetadata([]);
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Scanner} />,
      { apiMock }
    );

    await screen.findByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 0)).toBeInTheDocument();

    // There should be 2 rows in the table, the header row and the totals row.
    expect(getAllByTestId('table-row').length).toEqual(2);
  });

  it('renders as expected when there is tally data', async () => {
    apiMock.expectGetCardCounts(
      mockBallotCountsTableGroupBy({ groupByScanner: true }),
      cardCountsByScanner
    );
    apiMock.expectGetScannerBatches([]);
    apiMock.expectGetManualResultsMetadata([]);
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Scanner} />,
      {
        apiMock,
      }
    );

    await screen.findByText('Scanner ID');
    for (const scannerId of scannerIds) {
      const expectedNumberOfBallots =
        cardCountsByScanner.find((cc) => cc.scannerId === scannerId)?.bmd ?? 0;
      getByText(scannerId);
      const tableRow = getByText(scannerId).closest('tr');
      expect(tableRow).toBeDefined();
      expect(
        domGetByText(tableRow!, expectedNumberOfBallots)
      ).toBeInTheDocument();
      if (expectedNumberOfBallots > 0) {
        expect(
          domGetByText(
            tableRow!,
            `Unofficial Scanner ${scannerId} Tally Report`
          )
        ).toBeInTheDocument();
      }
    }
    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 77)).toBeInTheDocument();

    expect(getAllByTestId('table-row').length).toEqual(scannerIds.length + 2);
  });

  it('renders as expected when there is tally data and manual data', async () => {
    apiMock.expectGetCardCounts(
      mockBallotCountsTableGroupBy({ groupByScanner: true }),
      cardCountsByScanner
    );
    apiMock.expectGetScannerBatches([]);
    apiMock.expectGetManualResultsMetadata([
      {
        precinctId: 'any',
        ballotStyleId: 'any',
        votingMethod: 'precinct',
        ballotCount: 54,
        createdAt: 'any',
      },
    ]);
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Scanner} />,
      {
        apiMock,
      }
    );

    await screen.findByText('Scanner ID');

    getByText('Manually Entered Results');
    let tableRow = getByText('Manually Entered Results').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 54)).toBeInTheDocument();

    getByText('Total Ballot Count');
    tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 131)).toBeInTheDocument();

    expect(getAllByTestId('table-row').length).toEqual(scannerIds.length + 3);
  });
});

// Test party ballot counts
describe('Ballots Counts by Party', () => {
  const cardCountsByParty: Array<Tabulation.GroupOf<Tabulation.CardCounts>> = [
    {
      partyId: '0',
      ...mockCardCounts(25),
    },
    {
      partyId: '4',
      ...mockCardCounts(52),
    },
  ];

  const expectedParties = [
    { partyName: 'Constitution Party', partyId: '3' },
    { partyName: 'Federalist Party', partyId: '4' },
    { partyName: 'Liberty Party', partyId: '0' },
  ];

  it('renders as expected when there is no data', async () => {
    apiMock.expectGetCardCounts(
      mockBallotCountsTableGroupBy({ groupByParty: true }),
      []
    );
    apiMock.expectGetScannerBatches([]);
    apiMock.expectGetManualResultsMetadata([]);
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Party} />,
      {
        electionDefinition: {
          ...multiPartyPrimaryElectionDefinition,
          electionData: '',
        },
        apiMock,
      }
    );

    await screen.findByText('Party');

    for (const { partyName } of expectedParties) {
      getByText(partyName);
      const tableRow = getByText(partyName).closest('tr');
      expect(tableRow).toBeDefined();
      expect(domGetByText(tableRow!, 0)).toBeInTheDocument();
      expect(
        domGetByText(tableRow!, `Unofficial ${partyName} Tally Report`)
      ).toBeInTheDocument();
    }

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 0)).toBeInTheDocument();

    expect(getAllByTestId('table-row').length).toEqual(
      expectedParties.length + 2
    );
  });

  it('renders as expected when there is tally data', async () => {
    apiMock.expectGetCardCounts(
      mockBallotCountsTableGroupBy({ groupByParty: true }),
      cardCountsByParty
    );
    apiMock.expectGetScannerBatches([]);
    apiMock.expectGetManualResultsMetadata([]);
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Party} />,
      {
        electionDefinition: {
          ...multiPartyPrimaryElectionDefinition,
          electionData: '',
        },
        apiMock,
      }
    );

    await screen.findByText('Party');

    for (const { partyName, partyId } of expectedParties) {
      const expectedNumberOfBallots =
        cardCountsByParty.find((cc) => cc.partyId === partyId)?.bmd ?? 0;
      getByText(partyName);
      const tableRow = getByText(partyName).closest('tr');
      expect(tableRow).toBeDefined();
      expect(
        domGetByText(tableRow!, expectedNumberOfBallots)
      ).toBeInTheDocument();
      expect(
        domGetByText(tableRow!, `Unofficial ${partyName} Tally Report`)
      ).toBeInTheDocument();
    }

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 77)).toBeInTheDocument();

    expect(getAllByTestId('table-row').length).toEqual(
      expectedParties.length + 2
    );
  });
});

describe('Ballots Counts by VotingMethod', () => {
  const cardCountsByVotingMethod: Array<
    Tabulation.GroupOf<Tabulation.CardCounts>
  > = [
    {
      votingMethod: 'absentee',
      ...mockCardCounts(25),
    },
    {
      votingMethod: 'precinct',
      ...mockCardCounts(42),
    },
  ];
  const expectedLabels = [
    {
      method: 'absentee',
      label: 'Absentee',
    },
    { method: 'precinct', label: 'Precinct' },
  ];

  it('renders as expected when there is no data', async () => {
    apiMock.expectGetCardCounts(
      mockBallotCountsTableGroupBy({ groupByVotingMethod: true }),
      []
    );
    apiMock.expectGetScannerBatches([]);
    apiMock.expectGetManualResultsMetadata([]);
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.VotingMethod} />,
      { apiMock }
    );

    await screen.findByText('Voting Method');
    for (const { label } of expectedLabels) {
      getByText(label);
      const tableRow = getByText(label).closest('tr');
      expect(tableRow).toBeDefined();
      expect(domGetByText(tableRow!, 0)).toBeInTheDocument();
      expect(
        domGetByText(tableRow!, `Unofficial ${label} Ballot Tally Report`)
      ).toBeInTheDocument();
    }

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 0)).toBeInTheDocument();

    expect(getAllByTestId('table-row').length).toEqual(
      expectedLabels.length + 2
    );
  });

  it('renders as expected when there is tally data', async () => {
    apiMock.expectGetCardCounts(
      mockBallotCountsTableGroupBy({ groupByVotingMethod: true }),
      cardCountsByVotingMethod
    );
    apiMock.expectGetScannerBatches([]);
    apiMock.expectGetManualResultsMetadata([]);

    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.VotingMethod} />,
      { apiMock }
    );

    await screen.findByText('Voting Method');
    for (const { method, label } of expectedLabels) {
      const expectedNumberOfBallots =
        cardCountsByVotingMethod.find((cc) => cc.votingMethod === method)
          ?.bmd ?? 0;
      getByText(label);
      const tableRow = getByText(label).closest('tr');
      expect(tableRow).toBeDefined();
      expect(
        domGetByText(tableRow!, expectedNumberOfBallots)
      ).toBeInTheDocument();
      expect(
        domGetByText(tableRow!, `Unofficial ${label} Ballot Tally Report`)
      ).toBeInTheDocument();
    }

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 67)).toBeInTheDocument();

    expect(getAllByTestId('table-row').length).toEqual(
      expectedLabels.length + 2
    );
  });
});

describe('Ballots Counts by Batch', () => {
  beforeEach(() => {
    apiMock.expectGetCastVoteRecordFileMode('official');
  });

  const cardCountsByBatch: Array<Tabulation.GroupOf<Tabulation.CardCounts>> = [
    {
      batchId: '12341',
      ...mockCardCounts(25),
    },
    {
      batchId: '12342',
      ...mockCardCounts(15),
    },
    {
      batchId: '12343',
      ...mockCardCounts(32),
    },
  ];

  const scannerBatches: ScannerBatch[] = [
    {
      electionId: 'any',
      batchId: '12341',
      label: 'Batch 1',
      scannerId: '001',
    },
    {
      electionId: 'any',
      batchId: '12342',
      label: 'Batch 2',
      scannerId: '001',
    },
    {
      electionId: 'any',
      batchId: '12343',
      label: 'Batch 1',
      scannerId: '002',
    },
  ];

  it('renders as expected when there is no data', async () => {
    apiMock.expectGetCardCounts(
      mockBallotCountsTableGroupBy({ groupByBatch: true }),
      []
    );
    apiMock.expectGetScannerBatches(scannerBatches);
    apiMock.expectGetManualResultsMetadata([]);
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Batch} />,
      { apiMock }
    );

    await screen.findByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 0)).toBeInTheDocument();

    expect(getAllByTestId('table-row').length).toEqual(2);
  });

  const expectedLabels = [
    {
      batchId: '12341',
      label: 'Batch 1',
      scannerLabel: '001',
    },
    {
      batchId: '12342',
      label: 'Batch 2',
      scannerLabel: '001',
    },
    {
      batchId: '12343',
      label: 'Batch 1',
      scannerLabel: '002',
    },
  ];

  it('renders as expected when there is tally data', async () => {
    apiMock.expectGetCardCounts(
      mockBallotCountsTableGroupBy({ groupByBatch: true }),
      cardCountsByBatch
    );
    apiMock.expectGetScannerBatches(scannerBatches);
    apiMock.expectGetManualResultsMetadata([]);
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Batch} />,
      { apiMock }
    );

    await screen.findByText('Batch Name');

    for (const { batchId, label, scannerLabel } of expectedLabels) {
      const expectedNumberOfBallots =
        cardCountsByBatch.find((cc) => cc.batchId === batchId)?.bmd ?? 0;
      const tableRow = getAllByTestId(`batch-${batchId}`)[0].closest('tr');
      assert(tableRow);
      expect(domGetByText(tableRow, label)).toBeInTheDocument();
      expect(
        domGetByText(tableRow, expectedNumberOfBallots)
      ).toBeInTheDocument();
      expect(domGetByText(tableRow, scannerLabel)).toBeInTheDocument();
      expect(
        domGetByText(tableRow, `Unofficial ${label} Tally Report`)
      ).toBeInTheDocument();
    }

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 72)).toBeInTheDocument();

    // There should be 2 extra table rows in addition to the batches, one for the headers, and one for the total row.
    expect(getAllByTestId('table-row').length).toEqual(
      expectedLabels.length + 2
    );
  });

  it('renders as expected where there is tally data and manual data', async () => {
    apiMock.expectGetCardCounts(
      mockBallotCountsTableGroupBy({ groupByBatch: true }),
      cardCountsByBatch
    );
    apiMock.expectGetScannerBatches(scannerBatches);
    apiMock.expectGetManualResultsMetadata([
      {
        precinctId: 'any',
        ballotStyleId: 'any',
        votingMethod: 'precinct',
        ballotCount: 54,
        createdAt: 'any',
      },
    ]);
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Batch} />,
      {
        apiMock,
      }
    );

    await screen.findByText('Batch Name');
    const manualTableRow = getAllByTestId('batch-manual')[0].closest('tr');
    assert(manualTableRow);
    domGetByText(manualTableRow, 'Manually Entered Results');
    domGetByText(manualTableRow, 54);

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    assert(tableRow);
    domGetByText(tableRow, 126);

    // There should be 3 extra table rows in addition to the batches, one for the headers, one for the manual data, and one for the total row.
    expect(getAllByTestId('table-row').length).toEqual(
      expectedLabels.length + 3
    );
  });
});
