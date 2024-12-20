import {
  electionFamousNames2021Fixtures,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import {
  BallotStyleGroupId,
  Dictionary,
  formatElectionHashes,
  Tabulation,
} from '@votingworks/types';
import { within } from '@testing-library/react';
import { Optional } from '@votingworks/basics';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { render, screen } from '../../test/react_testing_library';
import {
  ATTRIBUTE_COLUMNS,
  BallotCountReport,
  FILLER_COLUMNS,
} from './ballot_count_report';
import { mockScannerBatches } from '../../test/fixtures';

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();

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

type RowData = Dictionary<string>;

/**
 * Parses on screen grid into an array of headers, an array of row text content keyed
 * by column, and the footer if expected.
 */
function parseGrid({
  expectFooter,
  expectGroupHeader,
}: {
  expectFooter: boolean;
  expectGroupHeader?: boolean;
}) {
  const grid = screen.getByTestId('ballot-count-grid');

  // strip header data test ids, e.g. 'header-ballot-count-bmd', down to
  // the column id only, e.g. 'bmd', for brevity
  const columnIds = within(grid)
    .getAllByTestId(/^header-/)
    .map(
      (cell) =>
        cell
          .getAttribute('data-testid')
          ?.replace(/header-/, '')
          ?.replace(/attribute-|ballot-count-|sheet-count-|filler-/, '')
    ) as string[];

  const width = columnIds.length;
  const allCells = grid.childNodes;
  expect(allCells.length % width).toEqual(0);

  const numRows = allCells.length / width;
  const numHeaderRows = expectGroupHeader ? 2 : 1;
  const numDataRows = numRows - numHeaderRows - (expectFooter ? 1 : 0);

  const rows: RowData[] = [];
  for (let i = 0; i < numDataRows; i += 1) {
    const row: RowData = {};
    const cells = [...allCells].slice(
      (i + numHeaderRows) * width,
      (i + numHeaderRows + 1) * width
    );
    for (let j = 0; j < width; j += 1) {
      const columnId = columnIds[j];
      if (columnId === 'center' || columnId === 'right') continue;
      row[columnId] = cells[j].textContent ?? undefined;
    }
    rows.push(row);
  }

  const IGNORED_FOOTER_COLUMNS: string[] = [
    ...ATTRIBUTE_COLUMNS,
    ...FILLER_COLUMNS,
  ];
  let footer: Optional<RowData>;
  if (expectFooter) {
    screen.getByText(/Sum Total/);
    footer = {};
    const cells = [...allCells].slice((numRows - 1) * width, numRows * width);
    for (let j = 0; j < width; j += 1) {
      const columnId = columnIds[j];
      if (IGNORED_FOOTER_COLUMNS.includes(columnId)) continue;
      footer[columnId] = cells[j].textContent ?? undefined;
    }
  }

  return {
    columns: columnIds,
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
        ballotStyleGroupId: '1M' as BallotStyleGroupId,
        precinctId: 'precinct-1',
        partyId: '0',
        votingMethod: 'precinct',
        batchId: 'batch-10',
        scannerId: 'scanner-1',
      },
      {
        ...cc(9, undefined, 11),
        ballotStyleGroupId: '2F' as BallotStyleGroupId,
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
      electionPackageHash="test-election-package-hash"
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

  const expectedColumns = [
    'precinct',
    'ballot-style',
    'party',
    'voting-method',
    'scanner',
    'batch',
    'center',
    'bmd',
    'hmpb',
    'total',
    'right',
  ];
  const expectedRows: RowData[] = [
    {
      'ballot-style': '1M',
      batch: 'Batch 10',
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
      batch: 'Batch 20',
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
      electionPackageHash="test-election-package-hash"
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
      electionPackageHash="test-election-package-hash"
      scannerBatches={mockScannerBatches}
      groupBy={{
        groupByPrecinct: true,
        groupByParty: true,
      }}
      cardCountsList={primaryPrecinctCardCountsList}
    />
  );

  const expectedColumns = [
    'precinct',
    'party',
    'center',
    'manual',
    'bmd',
    'hmpb',
    'total',
    'right',
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

test('shows HMPB sheet counts', () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.makeMultiSheetElectionDefinition();

  const votingMethodCardCountsList: Tabulation.GroupList<Tabulation.CardCounts> =
    [
      {
        ...cc(3, undefined, 12, 10, 7),
        votingMethod: 'absentee',
      },
      {
        ...cc(9, undefined, 11, 11, 10),
        votingMethod: 'precinct',
      },
    ];

  render(
    <BallotCountReport
      title="Full Election Ballot Count Report"
      isOfficial={false}
      isTest={false}
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      scannerBatches={mockScannerBatches}
      groupBy={{
        groupByVotingMethod: true,
      }}
      cardCountsList={votingMethodCardCountsList}
      includeSheetCounts
    />
  );

  const expectedColumns = [
    'voting-method',
    'center',
    'bmd',
    '0',
    '1',
    '2',
    'total',
    'right',
  ];
  const expectedRows: RowData[] = [
    {
      'voting-method': 'Absentee',
      bmd: '3',
      '0': '12',
      '1': '10',
      '2': '7',
      total: '15',
    },
    {
      'voting-method': 'Precinct',
      bmd: '9',
      '0': '11',
      '1': '11',
      '2': '10',
      total: '20',
    },
  ];
  const expectedFooter: RowData = {
    bmd: '12',
    '0': '23',
    '1': '21',
    '2': '17',
    total: '35',
  };

  const { columns, rows, footer } = parseGrid({
    expectFooter: true,
    expectGroupHeader: true,
  });
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
      electionPackageHash="test-election-package-hash"
      scannerBatches={mockScannerBatches}
      groupBy={{
        groupByBatch: true,
      }}
      cardCountsList={batchCardCountsList}
    />
  );

  const expectedColumns = [
    'scanner',
    'batch',
    'center',
    'manual',
    'bmd',
    'hmpb',
    'total',
    'right',
  ];
  const expectedRows: RowData[] = [
    {
      scanner: 'scanner-1',
      batch: 'Batch 10',
      manual: '0',
      bmd: '3',
      hmpb: '0',
      total: '3',
    },
    {
      scanner: 'Manual Tallies',
      batch: 'Manual Tallies',
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
      electionPackageHash="test-election-package-hash"
      scannerBatches={mockScannerBatches}
      groupBy={{}}
      cardCountsList={[cardCounts]}
    />
  );

  const { columns, rows } = parseGrid({ expectFooter: false });
  expect(columns).toEqual(['bmd', 'hmpb', 'total', 'right']);
  expect(rows).toEqual([
    {
      bmd: '10',
      hmpb: '15',
      total: '25',
    },
  ]);
});

test('election info, metadata, and custom filters', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;

  render(
    <BallotCountReport
      title="Custom Filter Ballot Count Report"
      isOfficial={false}
      isTest={false}
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      scannerBatches={mockScannerBatches}
      groupBy={{}}
      cardCountsList={[]}
      customFilter={{
        precinctIds: ['precinct-1'],
      }}
      generatedAtTime={new Date(2020, 0, 1, 0, 0, 0)}
    />
  );

  screen.getByText('Unofficial Custom Filter Ballot Count Report');
  screen.getByText(
    'Example Primary Election, Sep 8, 2021, Sample County, State of Sample'
  );
  screen.getByText(
    hasTextAcrossElements('Report Generated: Jan 1, 2020, 12:00 AM')
  );
  screen.getByText(
    hasTextAcrossElements(
      `Election ID: ${formatElectionHashes(
        electionDefinition.ballotHash,
        'test-election-package-hash'
      )}`
    )
  );
  expect(screen.getByTestId('custom-filter-summary').textContent).toEqual(
    'Precinct: Precinct 1'
  );
});

test('test mode banner', () => {
  render(
    <BallotCountReport
      title="Title"
      isTest
      isOfficial={false}
      electionDefinition={electionTwoPartyPrimaryDefinition}
      electionPackageHash="test-election-package-hash"
      scannerBatches={mockScannerBatches}
      groupBy={{}}
      cardCountsList={[]}
    />
  );

  screen.getByText('Test Report');
});

test('titles', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;

  const testCases: Array<{
    isOfficial: boolean;
    expectedTitle: string;
  }> = [
    {
      isOfficial: true,
      expectedTitle: 'Official Title',
    },
    {
      isOfficial: false,
      expectedTitle: 'Unofficial Title',
    },
  ];
  for (const { isOfficial, expectedTitle } of testCases) {
    const { unmount } = render(
      <BallotCountReport
        title="Title"
        isTest={false}
        isOfficial={isOfficial}
        electionDefinition={electionDefinition}
        electionPackageHash="test-election-package-hash"
        scannerBatches={mockScannerBatches}
        groupBy={{}}
        cardCountsList={[]}
        customFilter={{
          precinctIds: ['precinct-1'],
        }}
      />
    );
    screen.getByRole('heading', { name: expectedTitle });
    expect(screen.queryByText('Test Report')).not.toBeInTheDocument();
    unmount();
  }
});
