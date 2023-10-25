import { ElectionDefinition, Tabulation } from '@votingworks/types';
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

/**
 * Columns that may appear in a the ballot count report table.
 */
const COLUMNS = [
  'precinct',
  'ballot-style',
  'party',
  'voting-method',
  'scanner',
  'batch',
  'center-fill', // spacing between the attributes and the counts
  'manual',
  'bmd',
  'hmpb',
  'total',
  'right-fill', // spacing to bring the total away from the right margin
] as const;

export type Column = (typeof COLUMNS)[number];

const COLUMN_LABELS: Record<Column, string> = {
  precinct: 'Precinct',
  'ballot-style': 'Ballot Style',
  party: 'Party',
  'voting-method': 'Voting Method',
  scanner: 'Scanner ID',
  batch: 'Batch ID',
  'center-fill': '',
  manual: 'Manual',
  bmd: 'BMD',
  hmpb: 'HMPB',
  total: 'Total',
  'right-fill': '',
};

// minmax(0, max-content) = fit to content unless table is overflowing
// max-content = fit to content
// fr = expand to fit remaining space proportionally
const COLUMN_WIDTHS: Record<Column, string> = {
  precinct: 'minmax(0, max-content)',
  'ballot-style': 'minmax(0, max-content)',
  party: 'minmax(0, max-content)',
  'voting-method': 'minmax(0, max-content)',
  scanner: 'minmax(0, max-content)',
  batch: 'minmax(0, max-content)',
  'center-fill': '5fr',
  manual: 'max-content',
  bmd: 'max-content',
  hmpb: 'max-content',
  total: 'max-content',
  'right-fill': '2fr',
};

const BallotCountGrid = styled.div<{
  columns: Column[];
  hasGroups: boolean;
}>`
  width: 7.5in;
  display: grid;
  grid-template-columns: ${({ columns }) =>
    columns.map((c) => COLUMN_WIDTHS[c]).join(' ')};
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

type NumberColumn = Extract<
  Column,
  'manual' | 'scanned' | 'bmd' | 'hmpb' | 'total'
>;

function getFormattedCount(
  cardCounts: Tabulation.CardCounts,
  column: NumberColumn
): string {
  const number = (() => {
    switch (column) {
      case 'manual':
        return cardCounts.manual ?? 0;
      case 'bmd':
        return cardCounts.bmd;
      case 'hmpb':
        return getHmpbBallotCount(cardCounts);
      case 'total':
        return getBallotCount(cardCounts);
      // istanbul ignore next - compile time check for completeness
      default:
        throwIllegalValue(column);
    }
  })();

  return format.count(number);
}

function getCellClass(column: Column): Optional<string> {
  switch (column) {
    case 'precinct':
    case 'ballot-style':
    case 'party':
    case 'voting-method':
    case 'scanner':
    case 'batch':
      return undefined;
    case 'center-fill':
      return 'filler';
    case 'right-fill':
      return undefined;
    case 'manual':
    case 'bmd':
    case 'hmpb':
    case 'total':
      return 'number';
    // istanbul ignore next - compile time check for completeness
    default:
      throwIllegalValue(column);
  }
}

function getBatchLabel(batchId: string): string {
  return batchId === Tabulation.MANUAL_BATCH_ID
    ? 'Manual'
    : batchId.slice(0, Tabulation.BATCH_ID_DISPLAY_LENGTH);
}

function getScannerLabel(scannerId: string): string {
  return scannerId === Tabulation.MANUAL_SCANNER_ID ? 'Manual' : scannerId;
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
  const batchLookup: Record<string, Tabulation.ScannerBatch> = {};
  for (const scannerBatch of scannerBatches) {
    batchLookup[scannerBatch.batchId] = scannerBatch;
  }

  const columns: Column[] = [];
  const hasGroups = !isGroupByEmpty(groupBy);

  if (groupBy.groupByPrecinct) {
    columns.push('precinct');
  }
  if (groupBy.groupByBallotStyle) {
    columns.push('ballot-style');
  }
  if (
    election.type === 'primary' &&
    (groupBy.groupByParty || groupBy.groupByBallotStyle)
  ) {
    columns.push('party');
  }
  if (groupBy.groupByVotingMethod) {
    columns.push('voting-method');
  }
  if (groupBy.groupByScanner || groupBy.groupByBatch) {
    columns.push('scanner');
  }
  if (groupBy.groupByBatch) {
    columns.push('batch');
  }

  if (hasGroups) {
    columns.push('center-fill');
  }

  // always show manual counts if they exist
  const hasNonZeroManualData = cardCountsList.some((cc) => !!cc.manual);
  if (hasNonZeroManualData) {
    columns.push('manual');
  }
  columns.push('bmd');
  columns.push('hmpb');
  columns.push('total');

  columns.push('right-fill');

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
          key={column}
          className={getCellClass(column)}
          data-testid={`header-${column}`}
        >
          {COLUMN_LABELS[column]}
        </span>
      ))}
      {/* Body */}
      {cardCountsList.map((cardCounts) => {
        const partyId = determinePartyId(electionDefinition, cardCounts);
        const scannerId =
          cardCounts.scannerId ??
          (cardCounts.batchId === Tabulation.MANUAL_BATCH_ID
            ? Tabulation.MANUAL_SCANNER_ID
            : cardCounts.batchId
            ? batchLookup[cardCounts.batchId].scannerId
            : undefined);
        const rowKey = getGroupKey(cardCounts, groupBy);
        return (
          <React.Fragment key={rowKey}>
            {columns.map((column) => {
              let content = '';
              switch (column) {
                case 'precinct':
                  content = getPrecinctById(
                    electionDefinition,
                    assertDefined(cardCounts.precinctId)
                  ).name;
                  break;
                case 'ballot-style':
                  content = assertDefined(cardCounts.ballotStyleId);
                  break;
                case 'party':
                  content = getPartyById(
                    electionDefinition,
                    assertDefined(partyId)
                  ).name;
                  break;
                case 'voting-method':
                  content =
                    Tabulation.VOTING_METHOD_LABELS[
                      assertDefined(cardCounts.votingMethod)
                    ];
                  break;
                case 'scanner':
                  content = getScannerLabel(assertDefined(scannerId));
                  break;
                case 'batch':
                  content = getBatchLabel(assertDefined(cardCounts.batchId));
                  break;
                case 'center-fill':
                case 'right-fill':
                  break;
                case 'manual':
                case 'bmd':
                case 'hmpb':
                case 'total':
                  content = getFormattedCount(cardCounts, column);
                  break;
                // istanbul ignore next - compile time check for completeness
                default:
                  throwIllegalValue(column);
              }
              return (
                <span
                  key={column}
                  className={getCellClass(column)}
                  data-testid={`data-${column}`}
                >
                  {content}
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
            assert(column !== COLUMNS[0]);
            switch (column) {
              case 'ballot-style':
              case 'party':
              case 'voting-method':
              case 'scanner':
              case 'batch':
              case 'center-fill':
                return <span key={column} className="filler" />;
              case 'manual':
              case 'bmd':
              case 'hmpb':
              case 'total':
                return (
                  <span
                    key={column}
                    data-testid={`footer-${column}`}
                    className="number"
                  >
                    {getFormattedCount(totalCardCounts, column)}
                  </span>
                );
              case 'right-fill':
                return <span key={column} />;
              // istanbul ignore next - compile time check for completeness
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
  testId?: string;
  electionDefinition: ElectionDefinition;
  scannerBatches: Tabulation.ScannerBatch[];
  cardCountsList: Tabulation.GroupList<Tabulation.CardCounts>;
  groupBy: Tabulation.GroupBy;
  customFilter?: Tabulation.Filter;
  generatedAtTime?: Date;
}

export function BallotCountReport({
  title,
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
          <h1>{title}</h1>
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
