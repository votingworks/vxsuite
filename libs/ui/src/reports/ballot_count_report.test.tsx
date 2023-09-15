import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { Tabulation } from '@votingworks/types';
import { within } from '@testing-library/react';
import { Optional } from '@votingworks/basics';
import { render, screen } from '../../test/react_testing_library';
import {
  BallotCountBreakdown,
  BallotCountReport,
  ColumnType,
} from './ballot_count_report';

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
  [T in ColumnType]?: string;
};

/**
 * Parses on screen grid into an array of headers, an array of row text content keyed
 * by column, and the footer if expected.
 */
function parseGrid({ expectFooter }: { expectFooter: boolean }) {
  const grid = screen.getByTestId('ballot-count-grid');

  const columns = within(grid)
    .getAllByTestId(/header-/)
    .map((cell) =>
      cell.getAttribute('data-testid')?.replace('header-', '')
    ) as ColumnType[];

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
      if (columns[j] === 'filler') continue;
      row[columns[j]] = cells[j].textContent ?? undefined;
    }
    rows.push(row);
  }

  const FOOTER_COLUMNS: ColumnType[] = [
    'scanned',
    'manual',
    'hmpb',
    'bmd',
    'total',
  ];
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
        ...cc(5),
        ballotStyleId: '1M',
        precinctId: 'precinct-1',
        partyId: '0',
        votingMethod: 'precinct',
        batchId: 'batch-10',
        scannerId: 'scanner-1',
      },
      {
        ...cc(5),
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
      ballotCountBreakdown="none"
    />
  );

  const expectedColumns: ColumnType[] = [
    'precinct',
    'ballot-style',
    'party',
    'voting-method',
    'scanner',
    'batch',
    'filler',
    'total',
  ];
  const expectedRows: RowData[] = [
    {
      'ballot-style': '1M',
      batch: 'batch-10',
      party: 'Ma',
      precinct: 'Precinct 1',
      scanner: 'scanner-1',
      total: '5',
      'voting-method': 'Precinct',
    },
    {
      'ballot-style': '2F',
      batch: 'batch-20',
      party: 'F',
      precinct: 'Precinct 2',
      scanner: 'scanner-2',
      total: '5',
      'voting-method': 'Absentee',
    },
  ];
  const expectedFooter: RowData = {
    total: '10',
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
      ballotCountBreakdown="none"
    />
  );

  {
    const { columns, rows, footer } = parseGrid({ expectFooter: true });
    expect(columns).toEqual(expectedColumns);
    expect(rows).toEqual(expectedRows);
    expect(footer).toEqual(expectedFooter);
  }
});

test('ballot count breakdowns', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;

  const cardCountsList: Tabulation.GroupList<Tabulation.CardCounts> = [
    {
      ...cc(5, undefined, 10),
      precinctId: 'precinct-1',
    },
    {
      ...cc(1, 4, 5),
      precinctId: 'precinct-2',
    },
  ];

  const testCases: Array<{
    breakdown: BallotCountBreakdown;
    expectedColumns: ColumnType[];
    expectedRows: RowData[];
    expectedFooter: RowData;
  }> = [
    {
      breakdown: 'none',
      expectedColumns: ['precinct', 'filler', 'total'],
      expectedRows: [
        {
          precinct: 'Precinct 1',
          total: '15',
        },
        {
          precinct: 'Precinct 2',
          total: '10',
        },
      ],
      expectedFooter: {
        total: '25',
      },
    },
    {
      breakdown: 'manual',
      expectedColumns: ['precinct', 'filler', 'manual', 'scanned', 'total'],
      expectedRows: [
        {
          precinct: 'Precinct 1',
          manual: '0',
          scanned: '15',
          total: '15',
        },
        {
          precinct: 'Precinct 2',
          manual: '4',
          scanned: '6',
          total: '10',
        },
      ],
      expectedFooter: {
        manual: '4',
        scanned: '21',
        total: '25',
      },
    },
    {
      breakdown: 'all',
      expectedColumns: ['precinct', 'filler', 'manual', 'bmd', 'hmpb', 'total'],
      expectedRows: [
        {
          precinct: 'Precinct 1',
          manual: '0',
          bmd: '5',
          hmpb: '10',
          total: '15',
        },
        {
          precinct: 'Precinct 2',
          manual: '4',
          bmd: '1',
          hmpb: '5',
          total: '10',
        },
      ],
      expectedFooter: {
        manual: '4',
        bmd: '6',
        hmpb: '15',
        total: '25',
      },
    },
  ];

  for (const testCase of testCases) {
    const { breakdown, expectedColumns, expectedRows, expectedFooter } =
      testCase;
    const { unmount } = render(
      <BallotCountReport
        title="Full Election Ballot Count Report"
        electionDefinition={electionDefinition}
        scannerBatches={mockScannerBatches}
        groupBy={{
          groupByPrecinct: true,
        }}
        cardCountsList={cardCountsList}
        ballotCountBreakdown={breakdown}
      />
    );
    const { columns, rows, footer } = parseGrid({ expectFooter: true });
    expect(columns).toEqual(expectedColumns);
    expect(rows).toEqual(expectedRows);
    expect(footer).toEqual(expectedFooter);
    unmount();
  }
});

test('ungrouped case', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;

  const cardCounts: Tabulation.CardCounts = cc(10, undefined, 15);

  // render as if all columns were specified
  render(
    <BallotCountReport
      title="Full Election Ballot Count Report"
      electionDefinition={electionDefinition}
      scannerBatches={mockScannerBatches}
      groupBy={{}}
      cardCountsList={[cardCounts]}
      ballotCountBreakdown="all"
    />
  );

  const { columns, rows } = parseGrid({ expectFooter: false });
  expect(columns).toEqual(['bmd', 'hmpb', 'total']);
  expect(rows).toEqual([
    {
      bmd: '10',
      hmpb: '15',
      total: '25',
    },
  ]);
});

test('title, metadata, and custom filters', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;

  // render as if all columns were specified
  render(
    <BallotCountReport
      title="Custom Filter Ballot Count Report"
      electionDefinition={electionDefinition}
      scannerBatches={mockScannerBatches}
      groupBy={{}}
      cardCountsList={[]}
      ballotCountBreakdown="none"
      customFilter={{
        precinctIds: ['precinct-1'],
      }}
    />
  );

  screen.getByText('Custom Filter Ballot Count Report');
  expect(screen.getByTestId('custom-filter-summary').textContent).toEqual(
    'Precinct: Precinct 1'
  );
});
