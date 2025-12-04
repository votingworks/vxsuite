import React from 'react';
import styled, { ThemeProvider } from 'styled-components';
import {
  ElectionDefinition,
  hasSplits,
  BallotPrintCount,
} from '@votingworks/types';
import { format } from '@votingworks/utils';
import { throwIllegalValue } from '@votingworks/basics';

import { PrintedReport, reportColors, printedReportThemeFn } from './layout';
import { LogoMark } from '../logo_mark';
import {
  ReportHeader,
  ReportTitle,
  ReportElectionInfo,
  TestModeBanner,
} from './report_header';
import { ReportGeneratedMetadata } from './report_generated_metadata';
import { FillerColumn } from './ballot_count_report';

type AttributeColumnId =
  | 'precinctName'
  | 'precinctSplitName'
  | 'party'
  | 'language';
interface AttributeColumn {
  type: 'attribute';
  id: AttributeColumnId;
}

type CountColumnId = 'absentee' | 'precinct' | 'total';
interface CountColumn {
  type: 'count';
  id: CountColumnId;
}

type Column = AttributeColumn | CountColumn | FillerColumn;

const COLUMN_LABELS: Record<AttributeColumnId | CountColumnId, string> = {
  precinctName: 'Precinct Name',
  precinctSplitName: 'Precinct / Split Name',
  party: 'Party',
  language: 'Language',
  precinct: 'Precinct',
  absentee: 'Absentee',
  total: 'Total',
};

function getColumnLabel(column: Column): string {
  switch (column.type) {
    case 'attribute':
    case 'count':
      return COLUMN_LABELS[column.id];
    case 'filler':
      return '';
    default:
      throwIllegalValue(column);
  }
}

function getColumnWidth(column: Column): string {
  switch (column.type) {
    case 'attribute':
      return 'minmax(0, max-content)';
    case 'count':
      return 'max-content';
    case 'filler':
      return '1fr';
    default:
      throwIllegalValue(column);
  }
}

const BallotsPrintedGrid = styled.div<{
  columns: Column[];
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

  .thicker-top-border {
    border-top: 1.5px solid #ddd;
  }

  .thicker-bottom-border {
    border-bottom-width: 2px;
  }

  .no-bottom-border {
    border-bottom: none;
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

function getFormattedCount(row: BallotPrintCount, column: CountColumn): string {
  const number = (() => {
    switch (column.id) {
      case 'absentee':
        return row.absenteeCount;
      case 'precinct':
        return row.precinctCount;
      case 'total':
        return row.totalCount;
      default:
        throwIllegalValue(column.id);
    }
  })();

  return format.count(number);
}

type RowType = 'header' | 'data' | 'footer';

function isNumberColumn(column: Column): boolean {
  return column.type === 'count';
}

function getCellClass(column: Column, row: RowType): string {
  const classes: string[] = [];

  // center filler column is just for spacing, doesn't need border
  if (column.type === 'filler' && column.id === 'center') {
    classes.push('no-left-border');
  }

  if (row === 'header') {
    classes.push('thicker-bottom-border');
    classes.push('bold');
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
    classes.push('bold');

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

function getCellContent({
  column,
  row,
}: {
  column: Column;
  row: BallotPrintCount;
}): string {
  switch (column.type) {
    case 'attribute':
      switch (column.id) {
        case 'precinctName':
        case 'precinctSplitName':
          return row.precinctOrSplitName;
        case 'party':
          return row.partyName ?? '';
        case 'language':
          return format.languageDisplayName({
            languageCode: row.languageCode,
            displayLanguageCode: 'en',
          });
        default:
          throwIllegalValue(column);
      }
    // eslint-disable-next-line no-fallthrough
    case 'filler':
      return '';
    case 'count':
      return getFormattedCount(row, column);
    default:
      throwIllegalValue(column);
  }
}

function BallotsPrintedTable({
  electionDefinition,
  printCounts,
}: {
  electionDefinition: ElectionDefinition;
  printCounts: BallotPrintCount[];
}): JSX.Element {
  const { election } = electionDefinition;
  const hasPrecinctSplits = election.precincts.some((p) => hasSplits(p));

  const columns: Column[] = [];

  columns.push({
    type: 'attribute',
    id: hasPrecinctSplits ? 'precinctSplitName' : 'precinctName',
  });

  if (election.type === 'primary') {
    columns.push({ type: 'attribute', id: 'party' });
  }

  columns.push({ type: 'attribute', id: 'language' });

  columns.push({ type: 'filler', id: 'center' });

  columns.push({ type: 'count', id: 'total' });
  columns.push({ type: 'count', id: 'precinct' });
  columns.push({ type: 'count', id: 'absentee' });
  columns.push({ type: 'filler', id: 'right' });

  const totalAbsentee = printCounts.reduce(
    (acc, row) => acc + row.absenteeCount,
    0
  );
  const totalPrecinct = printCounts.reduce(
    (acc, row) => acc + row.precinctCount,
    0
  );
  const totalTotal = printCounts.reduce((acc, row) => acc + row.totalCount, 0);

  return (
    <BallotsPrintedGrid columns={columns}>
      {/* Header */}
      {columns.map((column) => (
        <span
          key={getColumnKey(column)}
          className={getCellClass(column, 'header')}
        >
          {getColumnLabel(column)}
        </span>
      ))}
      {/* Data */}
      {printCounts.map((row) => {
        const rowKey = `${row.precinctOrSplitName}-${row.ballotStyleId}`;
        return (
          <React.Fragment key={rowKey}>
            {columns.map((column) => (
              <span
                key={getColumnKey(column)}
                className={getCellClass(column, 'data')}
              >
                {getCellContent({ column, row })}
              </span>
            ))}
          </React.Fragment>
        );
      })}
      {/* Footer */}
      <React.Fragment>
        <span className={SUM_TOTAL_CLASSES.join(' ')}>Sum Totals</span>
        {columns.slice(1).map((column) => {
          const key = getColumnKey(column);
          switch (column.type) {
            case 'count':
              return (
                <span key={key} className={getCellClass(column, 'footer')}>
                  {format.count(
                    column.id === 'absentee'
                      ? totalAbsentee
                      : column.id === 'precinct'
                      ? totalPrecinct
                      : totalTotal
                  )}
                </span>
              );
            case 'filler':
            case 'attribute':
              return (
                <span key={key} className={getCellClass(column, 'footer')} />
              );
            default:
              return throwIllegalValue(column);
          }
        })}
      </React.Fragment>
    </BallotsPrintedGrid>
  );
}

export interface BallotsPrintedReportProps {
  electionDefinition: ElectionDefinition;
  electionPackageHash?: string;
  printCounts: BallotPrintCount[];
  generatedAtTime?: Date;
  isTestMode: boolean;
}

export function BallotsPrintedReport({
  electionDefinition,
  electionPackageHash,
  printCounts,
  generatedAtTime = new Date(),
  isTestMode,
}: BallotsPrintedReportProps): JSX.Element {
  const { election } = electionDefinition;
  return (
    <ThemeProvider theme={printedReportThemeFn}>
      <PrintedReport>
        {isTestMode && (
          <TestModeBanner overrideText="This report was generated in test mode and reflects test ballot print counts only." />
        )}
        <LogoMark />
        <ReportHeader style={{ marginBottom: '1em' }}>
          <ReportTitle>Ballots Printed Report</ReportTitle>
          <ReportElectionInfo election={election} />
          <ReportGeneratedMetadata
            generatedAtTime={generatedAtTime}
            electionDefinition={electionDefinition}
            electionPackageHash={electionPackageHash}
          />
        </ReportHeader>
        <BallotsPrintedTable
          electionDefinition={electionDefinition}
          printCounts={printCounts}
        />
      </PrintedReport>
    </ThemeProvider>
  );
}
