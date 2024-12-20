import { Admin, ElectionDefinition, Tabulation } from '@votingworks/types';
import {
  Optional,
  assert,
  assertDefined,
  find,
  throwIllegalValue,
} from '@votingworks/basics';
import styled, { ThemeProvider } from 'styled-components';
import {
  combineCardCounts,
  determinePartyId,
  format,
  getBallotCount,
  getMaxSheetsPerBallot,
  getGroupKey,
  getHmpbBallotCount,
  getPartyById,
  getPrecinctById,
  isGroupByEmpty,
} from '@votingworks/utils';
import React from 'react';
import { printedReportThemeFn, PrintedReport, reportColors } from './layout';
import { LogoMark } from '../logo_mark';
import { CustomFilterSummary } from './custom_filter_summary';
import {
  getBatchLabel,
  getScannerLabel,
  LabeledScannerBatch,
  prefixedTitle,
} from './utils';
import {
  ReportElectionInfo,
  ReportHeader,
  ReportTitle,
  TestModeBanner,
} from './report_header';
import { AdminReportMetadata } from './admin_report_metadata';

export const ATTRIBUTE_COLUMNS = [
  'precinct',
  'ballot-style',
  'party',
  'voting-method',
  'scanner',
  'batch',
] as const;
type AttributeColumnId = (typeof ATTRIBUTE_COLUMNS)[number];
interface AttributeColumn {
  type: 'attribute';
  id: AttributeColumnId;
}

type BallotCountColumnId = 'manual' | 'bmd' | 'hmpb' | 'total';
interface BallotCountColumn {
  type: 'ballot-count';
  id: BallotCountColumnId;
}

interface SheetCountColumn {
  type: 'sheet-count';
  /* zero-based index of the sheet */
  id: number;
}

// filler columns provide flex spacing in the grid
export const FILLER_COLUMNS = ['center', 'right'] as const;
type FillerColumnId = (typeof FILLER_COLUMNS)[number];
interface FillerColumn {
  type: 'filler';
  id: FillerColumnId;
}

export type Column =
  | AttributeColumn
  | BallotCountColumn
  | SheetCountColumn
  | FillerColumn;

const COLUMN_LABELS: Record<AttributeColumnId | BallotCountColumnId, string> = {
  precinct: 'Precinct',
  'ballot-style': 'Ballot Style',
  party: 'Party',
  'voting-method': 'Voting Method',
  scanner: 'Scanner ID',
  batch: 'Batch',
  manual: 'Manual',
  bmd: 'BMD',
  hmpb: 'HMPB',
  total: 'Total',
};

function getColumnLabel(column: Column): string {
  switch (column.type) {
    case 'attribute':
    case 'ballot-count':
      return COLUMN_LABELS[column.id];
    case 'sheet-count':
      return `Sheet ${column.id + 1}`;
    case 'filler':
      return '';
    // istanbul ignore next
    default:
      throwIllegalValue(column);
  }
}

function getColumnWidth(column: Column): string {
  switch (column.type) {
    case 'attribute':
      // fit to content unless table is overflowing
      return 'minmax(0, max-content)';
    case 'ballot-count':
    case 'sheet-count':
      // always fit content
      return 'max-content';
    case 'filler':
      switch (column.id) {
        case 'center':
          return '5fr';
        case 'right':
          return '2fr';
        // istanbul ignore next
        default:
          throwIllegalValue(column);
      }
    // istanbul ignore next
    // eslint-disable-next-line no-fallthrough
    default:
      throwIllegalValue(column);
  }
}

const BallotCountGrid = styled.div<{
  columns: Column[];
  hasGroups: boolean;
}>`
  width: 7.5in;
  display: grid;
  grid-template-columns: ${({ columns }) =>
    columns.map((c) => getColumnWidth(c)).join(' ')};
  page-break-inside: auto;
  font-size: 14px;

  span {
    border-bottom: 0.5px solid #ddd;
    padding: 0.25em 0.5em 0.25em 0.25em;
    white-space: nowrap;
    text-align: left;
    overflow-x: hidden;
    text-overflow: ellipsis;
  }

  /* vertical borders */
  ${({ columns }) => {
    const numColumns = columns.length;
    let css = ``;
    for (let i = 2; i <= numColumns; i += 1) {
      css += `span:nth-child(${numColumns}n + ${i}) { 
        border-left: 1px solid #ddd;
       }`;
    }
    return css;
  }}

  /* row striping */
  ${({ columns }) => {
    const numColumns = columns.length;
    let css = ``;
    for (let i = 1; i <= numColumns; i += 1) {
      css += `span.striping:nth-child(${2 * numColumns}n + ${i}) { 
        background-color: #f5f5f5;

        @media print {
          background-color: ${reportColors.container};
        }
       }`;
    }
    return css;
  }}

  .bold {
    font-weight: 500;
  }

  .italic {
    font-style: italic;
  }

  .thicker-top-border {
    border-top: 1.5px solid #ddd;
  }

  .thicker-bottom-border {
    border-bottom-width: 2px;
  }

  .no-bottom-border {
    border-bottom: none;
  }

  .thicker-left-border {
    border-left-width: 1.5px !important;
  }

  .no-left-border {
    border-left: none !important;
  }

  .number {
    text-align: right;
  }

  .cell-text-overflow {
    position: relative;
    overflow-x: visible;
    text-overflow: unset;
  }
`;

const SUM_TOTAL_CLASSES = [
  'cell-text-overflow',
  'bold',
  'thicker-top-border',
  'no-bottom-border',
];

function getColumnKey(column: Column): string {
  return `${column.type}-${column.id}`;
}

function getFormattedCount(
  cardCounts: Tabulation.CardCounts,
  column: BallotCountColumn | SheetCountColumn
): string {
  const number = (() => {
    switch (column.id) {
      case 'manual':
        return cardCounts.manual ?? 0;
      case 'bmd':
        return cardCounts.bmd;
      case 'hmpb':
        return getHmpbBallotCount(cardCounts);
      case 'total':
        return getBallotCount(cardCounts);
      // sheet count case
      default:
        assert(typeof column.id === 'number');
        // istanbul ignore next - trivial default value
        return cardCounts.hmpb[column.id] ?? 0;
    }
  })();

  return format.count(number);
}

type RowType = 'group-header' | 'header' | 'data' | 'footer';

function isNumberColumn(column: Column): boolean {
  return column.type === 'ballot-count' || column.type === 'sheet-count';
}

function getCellClass(
  column: Column,
  row: RowType,
  includeSheetCounts: boolean
): Optional<string> {
  const classes: string[] = [];

  // center filler column is just for spacing, doesn't need border
  if (column.type === 'filler' && column.id === 'center') {
    classes.push('no-left-border');
  }

  // special formatting for sheet count breakdown
  if (includeSheetCounts) {
    // left border of sheet count area
    if (column.type === 'sheet-count' && column.id === 0) {
      classes.push('thicker-left-border');
    }

    // right border of sheet count area
    if (column.id === 'total') {
      classes.push('thicker-left-border');
    }

    // bold the headers and footers of first sheet count column
    if (column.type === 'sheet-count' && column.id === 0 && row !== 'data') {
      classes.push('bold');
    }

    // italicize subsequent sheet count columns
    if (column.type === 'sheet-count' && column.id > 0) {
      classes.push('italic');
    }

    if (row === 'group-header') {
      // top border of sheet count area
      if (column.type === 'sheet-count') {
        classes.push('thicker-top-border');
      }

      // remove extra lines outside of sheet count area
      if (column.type !== 'sheet-count' && column.id !== 'total') {
        classes.push('no-left-border');
      }
      classes.push('no-bottom-border');
    }
  }

  if (row === 'header') {
    classes.push('thicker-bottom-border');
    if (column.type !== 'sheet-count') {
      classes.push('bold');
    }
  }

  if (row === 'data') {
    classes.push('striping');
    if (isNumberColumn(column)) {
      classes.push('number');
    }
  }

  if (row === 'footer') {
    classes.push('no-bottom-border');
    classes.push('thicker-top-border');

    if (column.type !== 'sheet-count') {
      classes.push('bold');
    }

    // remove borders so "Sum Total" text appears to span multiple cells
    if (column.type === 'attribute') {
      classes.push('no-left-border');
    }

    if (isNumberColumn(column)) {
      classes.push('number');
    }
  }

  return classes.join(' ');
}

function getScannerId(
  cardCounts: Tabulation.GroupOf<Tabulation.CardCounts>,
  scannerBatches: LabeledScannerBatch[]
): string {
  // asserts that the batchId is defined if the scannerId is not
  return (
    cardCounts.scannerId ??
    (cardCounts.batchId === Tabulation.MANUAL_BATCH_ID
      ? Tabulation.MANUAL_SCANNER_ID
      : find(scannerBatches, (batch) => batch.batchId === cardCounts.batchId)
          .scannerId)
  );
}

function getCellContent({
  column,
  cardCounts,
  electionDefinition,
  scannerBatches,
}: {
  column: Column;
  cardCounts: Tabulation.GroupOf<Tabulation.CardCounts>;
  electionDefinition: ElectionDefinition;
  scannerBatches: LabeledScannerBatch[];
}): string {
  switch (column.type) {
    case 'attribute':
      switch (column.id) {
        case 'precinct':
          return getPrecinctById(
            electionDefinition,
            assertDefined(cardCounts.precinctId)
          ).name;
        case 'ballot-style':
          return assertDefined(cardCounts.ballotStyleGroupId);
        case 'party':
          return getPartyById(
            electionDefinition,
            assertDefined(determinePartyId(electionDefinition, cardCounts))
          ).name;
        case 'voting-method':
          return Tabulation.VOTING_METHOD_LABELS[
            assertDefined(cardCounts.votingMethod)
          ];
        case 'scanner':
          return getScannerLabel(getScannerId(cardCounts, scannerBatches));
        case 'batch':
          return getBatchLabel(
            assertDefined(cardCounts.batchId),
            scannerBatches
          );
        // istanbul ignore next
        default:
          throwIllegalValue(column);
      }
    // eslint-disable-next-line no-fallthrough
    case 'filler':
      return '';
    case 'ballot-count':
    case 'sheet-count':
      return getFormattedCount(cardCounts, column);
    // istanbul ignore next
    default:
      throwIllegalValue(column);
  }
}

/**
 * The table is a grid with a list of `<span>` elements as children, rather
 * than row elements. In order to make this easier to test and style, the
 * convention is that every "row" has the same number of cells, even if they
 * are empty or appear to have span greater than 1.
 *
 * Using a grid rather than a table allows more powerful, content-responsive
 * column widths.
 */
function BallotCountTable({
  electionDefinition,
  scannerBatches,
  cardCountsList,
  groupBy,
  includeSheetCounts,
}: {
  electionDefinition: ElectionDefinition;
  scannerBatches: LabeledScannerBatch[];
  cardCountsList: Tabulation.GroupList<Tabulation.CardCounts>;
  groupBy: Tabulation.GroupBy;
  includeSheetCounts: boolean;
}): JSX.Element {
  const { election } = electionDefinition;

  const columns: Column[] = [];
  const hasGroups = !isGroupByEmpty(groupBy);

  if (groupBy.groupByPrecinct) {
    columns.push({ type: 'attribute', id: 'precinct' });
  }
  if (groupBy.groupByBallotStyle) {
    columns.push({ type: 'attribute', id: 'ballot-style' });
  }
  if (
    election.type === 'primary' &&
    (groupBy.groupByParty || groupBy.groupByBallotStyle)
  ) {
    columns.push({ type: 'attribute', id: 'party' });
  }
  if (groupBy.groupByVotingMethod) {
    columns.push({ type: 'attribute', id: 'voting-method' });
  }
  if (groupBy.groupByScanner || groupBy.groupByBatch) {
    columns.push({ type: 'attribute', id: 'scanner' });
  }
  if (groupBy.groupByBatch) {
    columns.push({ type: 'attribute', id: 'batch' });
  }

  if (hasGroups) {
    columns.push({ type: 'filler', id: 'center' });
  }

  // always show manual counts if they exist
  const hasNonZeroManualData = cardCountsList.some((cc) => !!cc.manual);
  if (hasNonZeroManualData) {
    columns.push({ type: 'ballot-count', id: 'manual' });
  }

  columns.push({ type: 'ballot-count', id: 'bmd' });

  // we show the sheet counts if the flag is true even if it's a single-sheet
  // election. it's the caller's responsibility to check the election definition
  if (includeSheetCounts) {
    // istanbul ignore next - trivial default value
    const sheetCount = getMaxSheetsPerBallot(election) ?? 1;
    for (let i = 0; i < sheetCount; i += 1) {
      columns.push({ type: 'sheet-count', id: i });
    }
  } else {
    columns.push({ type: 'ballot-count', id: 'hmpb' });
  }

  columns.push({ type: 'ballot-count', id: 'total' });
  columns.push({ type: 'filler', id: 'right' });

  const totalCardCounts = combineCardCounts(cardCountsList);

  return (
    <BallotCountGrid
      columns={columns}
      hasGroups={hasGroups}
      data-testid="ballot-count-grid"
    >
      {/* Group Header */}
      {includeSheetCounts &&
        columns.map((column) => (
          <span
            key={getColumnKey(column)}
            className={getCellClass(column, 'group-header', includeSheetCounts)}
            data-testid={`group-header-${getColumnKey(column)}`}
          >
            {column.type === 'sheet-count' ? 'HMPB' : ''}
          </span>
        ))}
      {/* Header */}
      {columns.map((column) => (
        <span
          key={getColumnKey(column)}
          className={`${getCellClass(column, 'header', includeSheetCounts)}`}
          data-testid={`header-${getColumnKey(column)}`}
        >
          {getColumnLabel(column)}
        </span>
      ))}
      {/* Data */}
      {cardCountsList.map((cardCounts) => {
        const rowKey = getGroupKey(cardCounts, groupBy);
        return (
          <React.Fragment key={rowKey}>
            {columns.map((column) => {
              const key = getColumnKey(column);
              return (
                <span
                  key={key}
                  className={getCellClass(column, 'data', includeSheetCounts)}
                  data-testid={`data-${key}`}
                >
                  {getCellContent({
                    column,
                    cardCounts,
                    electionDefinition,
                    scannerBatches,
                  })}
                </span>
              );
            })}
          </React.Fragment>
        );
      })}
      {/* Footer */}
      {hasGroups && (
        <React.Fragment>
          <span className={SUM_TOTAL_CLASSES.join(' ')}>Sum Totals</span>
          {/* eslint-disable-next-line array-callback-return */}
          {columns.slice(1).map((column) => {
            const key = getColumnKey(column);
            switch (column.type) {
              case 'ballot-count':
              case 'sheet-count':
                return (
                  <span
                    key={key}
                    data-testid={`footer-${key}`}
                    className={getCellClass(
                      column,
                      'footer',
                      includeSheetCounts
                    )}
                  >
                    {getFormattedCount(totalCardCounts, column)}
                  </span>
                );
              case 'attribute':
              case 'filler':
                return (
                  <span
                    key={key}
                    className={getCellClass(
                      column,
                      'footer',
                      includeSheetCounts
                    )}
                  />
                );
              // istanbul ignore next
              default:
                throwIllegalValue(column);
            }
          })}
        </React.Fragment>
      )}
    </BallotCountGrid>
  );
}

export interface BallotCountReportProps {
  title: string;
  isTest: boolean;
  isOfficial: boolean;
  testId?: string;
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
  scannerBatches: LabeledScannerBatch[];
  cardCountsList: Tabulation.GroupList<Tabulation.CardCounts>;
  groupBy: Tabulation.GroupBy;
  includeSheetCounts?: boolean;
  customFilter?: Admin.FrontendReportingFilter;
  generatedAtTime?: Date;
}

export function BallotCountReport({
  title,
  isTest,
  isOfficial,
  testId,
  electionDefinition,
  electionPackageHash,
  scannerBatches,
  cardCountsList,
  groupBy,
  includeSheetCounts,
  customFilter,
  generatedAtTime = new Date(),
}: BallotCountReportProps): JSX.Element {
  const { election } = electionDefinition;

  return (
    <ThemeProvider theme={printedReportThemeFn}>
      <PrintedReport data-testid={testId}>
        {isTest && <TestModeBanner />}
        <LogoMark />
        <ReportHeader style={{ marginBottom: '1em' }}>
          <ReportTitle>{prefixedTitle({ isOfficial, title })}</ReportTitle>
          {customFilter && (
            <CustomFilterSummary
              electionDefinition={electionDefinition}
              scannerBatches={scannerBatches}
              filter={customFilter}
            />
          )}
          <ReportElectionInfo election={election} />
          <AdminReportMetadata
            generatedAtTime={generatedAtTime}
            electionDefinition={electionDefinition}
            electionPackageHash={electionPackageHash}
          />
        </ReportHeader>
        <BallotCountTable
          electionDefinition={electionDefinition}
          scannerBatches={scannerBatches}
          cardCountsList={cardCountsList}
          groupBy={groupBy}
          includeSheetCounts={includeSheetCounts ?? false}
        />
      </PrintedReport>
    </ThemeProvider>
  );
}
