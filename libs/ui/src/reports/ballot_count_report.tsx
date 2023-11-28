import { Admin, ElectionDefinition, Tabulation } from '@votingworks/types';
import {
  Optional,
  assert,
  assertDefined,
  throwIllegalValue,
} from '@votingworks/basics';
import styled, { ThemeProvider } from 'styled-components';
import {
  combineCardCounts,
  determinePartyId,
  format,
  getBallotCount,
  getGroupKey,
  getHmpbBallotCount,
  getPartyById,
  getPrecinctById,
  isGroupByEmpty,
} from '@votingworks/utils';
import React from 'react';
import { ReportSection, tallyReportThemeFn, TallyReport } from './tally_report';
import { LogoMark } from '../logo_mark';
import { TallyReportMetadata } from './tally_report_metadata';
import { CustomFilterSummary } from './custom_filter_summary';
import { getBatchLabel, getScannerLabel, prefixedTitle } from './utils';

const ATTRIBUTE_COLUMNS = [
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

const BALLOT_COUNT_COLUMNS = ['manual', 'bmd', 'hmpb', 'total'] as const;
type BallotCountColumnId = (typeof BALLOT_COUNT_COLUMNS)[number];
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
const FILLER_COLUMNS = ['center', 'right'] as const;
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
  batch: 'Batch ID',
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
      return `Sheet ${column.id}`;
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
      break;
    // istanbul ignore next
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
      css += `span:nth-child(${2 * numColumns}n + ${i}) { 
        background-color: #f5f5f5;

        @media print {
          background-color: #e8e8e8;
        }
       }`;
    }
    return css;
  }}

  /* header */
  span:nth-child(-n + ${({ columns }) => columns.length}) {
    font-weight: 500;
    background-color: white;
    border-bottom-width: 2px;
  }

  /* footer */
  span:nth-last-child(-n + ${({ columns }) => columns.length}) {
    background-color: white;
    border-bottom: none;
    font-weight: ${({ hasGroups }) => (hasGroups ? 500 : 400)};
    border-top: ${({ hasGroups }) => (hasGroups ? '1.5px' : '0')} solid #ddd;
  }

  .filler {
    border-left: none !important;
  }

  .number {
    text-align: right;
  }

  .sum-total {
    position: relative;
    overflow-x: visible;
    text-overflow: unset;
  }
`;

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
        return cardCounts.hmpb[column.id] ?? 0;
    }
  })();

  return format.count(number);
}

function getCellClass(column: Column): Optional<string> {
  switch (column.type) {
    case 'attribute':
      return undefined;
    case 'filler':
      switch (column.id) {
        case 'center':
          return 'filler';
        case 'right':
          return undefined;
        // istanbul ignore next
        default:
          throwIllegalValue(column);
      }
      break;
    case 'ballot-count':
    case 'sheet-count':
      return 'number';
    // istanbul ignore next
    default:
      throwIllegalValue(column);
  }
}

type BatchLookup = Record<string, Tabulation.ScannerBatch>;
function getScannerId(
  cardCounts: Tabulation.GroupOf<Tabulation.CardCounts>,
  batchLookup: BatchLookup
): Optional<string> {
  return (
    cardCounts.scannerId ??
    (cardCounts.batchId === Tabulation.MANUAL_BATCH_ID
      ? Tabulation.MANUAL_SCANNER_ID
      : cardCounts.batchId
      ? batchLookup[cardCounts.batchId].scannerId
      : undefined)
  );
}

function getCellContent({
  column,
  cardCounts,
  electionDefinition,
  batchLookup,
}: {
  column: Column;
  cardCounts: Tabulation.GroupOf<Tabulation.CardCounts>;
  electionDefinition: ElectionDefinition;
  batchLookup: BatchLookup;
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
          return assertDefined(cardCounts.ballotStyleId);
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
          return getScannerLabel(
            assertDefined(getScannerId(cardCounts, batchLookup))
          );
        case 'batch':
          return getBatchLabel(assertDefined(cardCounts.batchId));
        // istanbul ignore next
        default:
          throwIllegalValue(column);
      }
      break;
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

function BallotCountTable({
  electionDefinition,
  scannerBatches,
  cardCountsList,
  groupBy,
}: {
  electionDefinition: ElectionDefinition;
  scannerBatches: Tabulation.ScannerBatch[];
  cardCountsList: Tabulation.GroupList<Tabulation.CardCounts>;
  groupBy: Tabulation.GroupBy;
}): JSX.Element {
  const { election } = electionDefinition;
  const batchLookup: BatchLookup = {};
  for (const scannerBatch of scannerBatches) {
    batchLookup[scannerBatch.batchId] = scannerBatch;
  }

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
  columns.push({ type: 'ballot-count', id: 'hmpb' });
  columns.push({ type: 'ballot-count', id: 'total' });

  columns.push({ type: 'filler', id: 'right' });

  const totalCardCounts = combineCardCounts(cardCountsList);

  return (
    <BallotCountGrid
      columns={columns}
      hasGroups={hasGroups}
      data-testid="ballot-count-grid"
    >
      {/* Header */}
      {columns.map((column) => (
        <span
          key={getColumnKey(column)}
          className={getCellClass(column)}
          data-testid={`header-${getColumnKey(column)}`}
        >
          {getColumnLabel(column)}
        </span>
      ))}
      {/* Body */}
      {cardCountsList.map((cardCounts) => {
        const rowKey = getGroupKey(cardCounts, groupBy);
        return (
          <React.Fragment key={rowKey}>
            {columns.map((column) => {
              const key = getColumnKey(column);
              return (
                <span
                  key={key}
                  className={getCellClass(column)}
                  data-testid={`data-${key}`}
                >
                  {getCellContent({
                    column,
                    cardCounts,
                    electionDefinition,
                    batchLookup,
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
          <span className="sum-total">Sum Totals</span>
          {/* eslint-disable-next-line array-callback-return */}
          {columns.slice(1).map((column) => {
            const key = getColumnKey(column);
            switch (column.type) {
              case 'attribute':
                // in the footer, attribute columns are empty filler
                return <span key={key} className="filler" />;
              case 'ballot-count':
              case 'sheet-count':
                return (
                  <span
                    key={key}
                    data-testid={`footer-${key}`}
                    className={getCellClass(column)}
                  >
                    {getFormattedCount(totalCardCounts, column)}
                  </span>
                );
              case 'filler':
                return <span key={key} className={getCellClass(column)} />;
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
  scannerBatches: Tabulation.ScannerBatch[];
  cardCountsList: Tabulation.GroupList<Tabulation.CardCounts>;
  groupBy: Tabulation.GroupBy;
  customFilter?: Admin.ReportingFilter;
  generatedAtTime?: Date;
}

export function BallotCountReport({
  title,
  isTest,
  isOfficial,
  testId,
  electionDefinition,
  scannerBatches,
  cardCountsList,
  groupBy,
  customFilter,
  generatedAtTime = new Date(),
}: BallotCountReportProps): JSX.Element {
  const { election } = electionDefinition;

  return (
    <ThemeProvider theme={tallyReportThemeFn}>
      <TallyReport data-testid={testId}>
        <ReportSection>
          <LogoMark />
          <h1>{prefixedTitle({ isOfficial, isTest, title })}</h1>
          <h2>{electionDefinition.election.title}</h2>
          {customFilter && (
            <CustomFilterSummary
              electionDefinition={electionDefinition}
              filter={customFilter}
            />
          )}
          <TallyReportMetadata
            generatedAtTime={generatedAtTime}
            election={election}
          />
          <BallotCountTable
            electionDefinition={electionDefinition}
            scannerBatches={scannerBatches}
            cardCountsList={cardCountsList}
            groupBy={groupBy}
          />
        </ReportSection>
      </TallyReport>
    </ThemeProvider>
  );
}
