import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { Tabulation } from '@votingworks/types';
import { within } from '@testing-library/react';
import { Optional } from '@votingworks/basics';
import { render, screen } from '../../test/react_testing_library';
import { BallotCountReport, Column } from './ballot_count_report';

const mockScannerBatches: Tabulation.ScannerBatch[] = [
  {
    batchId: 'batch-10',
    scannerId: 'scanner-1',
  },
  {
    batchId: 'batch-11',
    scannerId: 'scanner-1',
  },
  {
    batchId: 'batch-20',
    scannerId: 'scanner-2',
  },
];

// shorthand for creating a card counts object
function cc(
  bmd: number,
  manual?: number,
  ...hmpb: number[]
): Tabulation.CardCounts {
  return {
    bmd,
    manual,
    hmpb,
  };
}

type RowData = {
  [T in Column]?: string;
};

/**
 * Parses on screen grid into an array of headers, an array of row text content keyed
 * by column, and the footer if expected.
 */
function parseGrid({ expectFooter }: { expectFooter: boolean }) {
  const grid = screen.getByTestId('ballot-count-grid');

  const columns = within(grid)
    .getAllByTestId(/header-/)
    .map(
      (cell) => cell.getAttribute('data-testid')?.replace('header-', '')
    ) as Column[];

  const width = columns.length;
  const allCells = grid.childNodes;
  expect(allCells.length % width).toEqual(0);

  const numRows = allCells.length / width;
  const numDataRows = expectFooter ? numRows - 2 : numRows - 1;

  const rows: RowData[] = [];
  for (let i = 0; i < numDataRows; i += 1) {
    const row: RowData = {};
    const cells = [...allCells].slice((i + 1) * width, (i + 2) * width);
    for (let j = 0; j < width; j += 1) {
      const column = columns[j];
      if (column === 'center-fill' || column === 'right-fill') continue;
      row[column] = cells[j].textContent ?? undefined;
    }
    rows.push(row);
  }

  const FOOTER_COLUMNS: Column[] = ['manual', 'hmpb', 'bmd', 'total'];
  let footer: Optional<RowData>;
  if (expectFooter) {
    screen.getByText(/Sum Total/);
    footer = {};
    const cells = [...allCells].slice((numRows - 1) * width, numRows * width);
    for (let j = 0; j < width; j += 1) {
      const column = columns[j];
      if (!FOOTER_COLUMNS.includes(column)) continue;
      footer[column] = cells[j].textContent ?? undefined;
    }
  }

  return {
    columns,
    rows,
    footer,
  };
}

// actual reports like this are not practical, but we can test every column
test('can render all attribute columns', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;

  const maximalAttributeCardCountsList: Tabulation.GroupList<Tabulation.CardCounts> =
    [
      {
        ...cc(3, undefined, 4),
        ballotStyleId: '1M',
        precinctId: 'precinct-1',
        partyId: '0',
        votingMethod: 'precinct',
        batchId: 'batch-10',
        scannerId: 'scanner-1',
      },
      {
        ...cc(9, undefined, 11),
        ballotStyleId: '2F',
        precinctId: 'precinct-2',
        partyId: '1',
        votingMethod: 'absentee',
        batchId: 'batch-20',
        scannerId: 'scanner-2',
      },
    ];

  // render as if all columns were specified
  const { unmount } = render(
    <BallotCountReport
      title="Full Election Ballot Count Report"
      isOfficial={false}
      isTest={false}
      electionDefinition={electionDefinition}
      scannerBatches={mockScannerBatches}
      groupBy={{
        groupByPrecinct: true,
        groupByBallotStyle: true,
        groupByParty: true,
        groupByVotingMethod: true,
        groupByScanner: true,
        groupByBatch: true,
      }}
      cardCountsList={maximalAttributeCardCountsList}
    />
  );

  const expectedColumns: Column[] = [
    'precinct',
    'ballot-style',
    'party',
    'voting-method',
    'scanner',
    'batch',
    'center-fill',
    'bmd',
    'hmpb',
    'total',
    'right-fill',
  ];
  const expectedRows: RowData[] = [
    {
      'ballot-style': '1M',
      batch: 'batch-10',
      party: 'Mammal',
      precinct: 'Precinct 1',
      scanner: 'scanner-1',
      bmd: '3',
      hmpb: '4',
      total: '7',
      'voting-method': 'Precinct',
    },
    {
      'ballot-style': '2F',
      batch: 'batch-20',
      party: 'Fish',
      precinct: 'Precinct 2',
      scanner: 'scanner-2',
      bmd: '9',
      hmpb: '11',
      total: '20',
      'voting-method': 'Absentee',
    },
  ];
  const expectedFooter: RowData = {
    bmd: '12',
    hmpb: '15',
    total: '27',
  };

  {
    const { columns, rows, footer } = parseGrid({ expectFooter: true });
    expect(columns).toEqual(expectedColumns);
    expect(rows).toEqual(expectedRows);
    expect(footer).toEqual(expectedFooter);
  }

  unmount();

  // expect same report, but report should infer the inferrable columns (scanner, party)
  render(
    <BallotCountReport
      title="Full Election Ballot Count Report"
      isOfficial={false}
      isTest={false}
      electionDefinition={electionDefinition}
      scannerBatches={mockScannerBatches}
      groupBy={{
        groupByPrecinct: true,
        groupByBallotStyle: true,
        groupByVotingMethod: true,
        groupByBatch: true,
      }}
      cardCountsList={maximalAttributeCardCountsList.map((cardCounts) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { scannerId, partyId, ...rest } = cardCounts;
        return rest;
      })}
    />
  );

  {
    const { columns, rows, footer } = parseGrid({ expectFooter: true });
    expect(columns).toEqual(expectedColumns);
    expect(rows).toEqual(expectedRows);
    expect(footer).toEqual(expectedFooter);
  }
});

test('shows manual counts', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;

  const primaryPrecinctCardCountsList: Tabulation.GroupList<Tabulation.CardCounts> =
    [
      {
        ...cc(3, 3, 4),
        precinctId: 'precinct-1',
        partyId: '0',
      },
      {
        ...cc(9, undefined, 11),
        precinctId: 'precinct-2',
        partyId: '1',
      },
    ];

  render(
    <BallotCountReport
      title="Full Election Ballot Count Report"
      isOfficial={false}
      isTest={false}
      electionDefinition={electionDefinition}
      scannerBatches={mockScannerBatches}
      groupBy={{
        groupByPrecinct: true,
        groupByParty: true,
      }}
      cardCountsList={primaryPrecinctCardCountsList}
    />
  );

  const expectedColumns: Column[] = [
    'precinct',
    'party',
    'center-fill',
    'manual',
    'bmd',
    'hmpb',
    'total',
    'right-fill',
  ];
  const expectedRows: RowData[] = [
    {
      party: 'Mammal',
      precinct: 'Precinct 1',
      manual: '3',
      bmd: '3',
      hmpb: '4',
      total: '10',
    },
    {
      party: 'Fish',
      precinct: 'Precinct 2',
      manual: '0',
      bmd: '9',
      hmpb: '11',
      total: '20',
    },
  ];
  const expectedFooter: RowData = {
    manual: '3',
    bmd: '12',
    hmpb: '15',
    total: '30',
  };

  const { columns, rows, footer } = parseGrid({ expectFooter: true });
  expect(columns).toEqual(expectedColumns);
  expect(rows).toEqual(expectedRows);
  expect(footer).toEqual(expectedFooter);
});

test('shows separate manual rows when group by is not compatible with manual results', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;

  const batchCardCountsList: Tabulation.GroupList<Tabulation.CardCounts> = [
    {
      ...cc(3),
      batchId: 'batch-10',
    },
    {
      ...cc(0, 2),
      batchId: Tabulation.MANUAL_BATCH_ID,
    },
  ];

  render(
    <BallotCountReport
      title="Full Election Ballot Count Report"
      isTest={false}
      isOfficial={false}
      electionDefinition={electionDefinition}
      scannerBatches={mockScannerBatches}
      groupBy={{
        groupByBatch: true,
      }}
      cardCountsList={batchCardCountsList}
    />
  );

  const expectedColumns: Column[] = [
    'scanner',
    'batch',
    'center-fill',
    'manual',
    'bmd',
    'hmpb',
    'total',
    'right-fill',
  ];
  const expectedRows: RowData[] = [
    {
      scanner: 'scanner-1',
      batch: 'batch-10',
      manual: '0',
      bmd: '3',
      hmpb: '0',
      total: '3',
    },
    {
      scanner: 'Manual',
      batch: 'Manual',
      manual: '2',
      bmd: '0',
      hmpb: '0',
      total: '2',
    },
  ];
  const expectedFooter: RowData = {
    manual: '2',
    bmd: '3',
    hmpb: '0',
    total: '5',
  };

  const { columns, rows, footer } = parseGrid({ expectFooter: true });
  expect(columns).toEqual(expectedColumns);
  expect(rows).toEqual(expectedRows);
  expect(footer).toEqual(expectedFooter);
});

test('ungrouped case', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;

  const cardCounts: Tabulation.CardCounts = cc(10, undefined, 15);

  // render as if all columns were specified
  render(
    <BallotCountReport
      title="Full Election Ballot Count Report"
      isOfficial={false}
      isTest={false}
      electionDefinition={electionDefinition}
      scannerBatches={mockScannerBatches}
      groupBy={{}}
      cardCountsList={[cardCounts]}
    />
  );

  const { columns, rows } = parseGrid({ expectFooter: false });
  expect(columns).toEqual(['bmd', 'hmpb', 'total', 'right-fill']);
  expect(rows).toEqual([
    {
      bmd: '10',
      hmpb: '15',
      total: '25',
    },
  ]);
});

test('metadata and custom filters', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;

  render(
    <BallotCountReport
      title="Custom Filter Ballot Count Report"
      isOfficial={false}
      isTest={false}
      electionDefinition={electionDefinition}
      scannerBatches={mockScannerBatches}
      groupBy={{}}
      cardCountsList={[]}
      customFilter={{
        precinctIds: ['precinct-1'],
      }}
    />
  );

  screen.getByText('Unofficial Custom Filter Ballot Count Report');
  screen.getByText('Example Primary Election');
  expect(screen.getByTestId('custom-filter-summary').textContent).toEqual(
    'Precinct: Precinct 1'
  );
});

test('titles', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;

  const testCases: Array<{
    isTest: boolean;
    isOfficial: boolean;
    expectedTitle: string;
  }> = [
    {
      isTest: true,
      isOfficial: true,
      expectedTitle: 'Test Official Title',
    },
    {
      isTest: true,
      isOfficial: false,
      expectedTitle: 'Test Unofficial Title',
    },
    {
      isTest: false,
      isOfficial: true,
      expectedTitle: 'Official Title',
    },
    {
      isTest: false,
      isOfficial: false,
      expectedTitle: 'Unofficial Title',
    },
  ];
  for (const { isTest, isOfficial, expectedTitle } of testCases) {
    const { unmount } = render(
      <BallotCountReport
        title="Title"
        isTest={isTest}
        isOfficial={isOfficial}
        electionDefinition={electionDefinition}
        scannerBatches={mockScannerBatches}
        groupBy={{}}
        cardCountsList={[]}
        customFilter={{
          precinctIds: ['precinct-1'],
        }}
      />
    );
    screen.getByRole('heading', { name: expectedTitle });
    unmount();
  }
});
