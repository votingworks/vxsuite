import { ElectionDefinition, Tabulation } from '@votingworks/types';
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
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
  getScannedBallotCount,
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
const COLUMN_TYPES = [
  'precinct',
  'ballot-style',
  'party',
  'voting-method',
  'scanner',
  'batch',
  'filler', // spacing between the attributes and the counts
  'manual',
  'scanned',
  'bmd',
  'hmpb',
  'total',
] as const;

export type ColumnType = typeof COLUMN_TYPES[number];

const COLUMN_LABELS: Record<ColumnType, string> = {
  precinct: 'Precinct',
  'ballot-style': 'Ballot Style',
  party: 'Party',
  'voting-method': 'Voting Method',
  scanner: 'Scanner ID',
  batch: 'Batch ID',
  filler: '',
  manual: 'Manual',
  scanned: 'Scanned',
  bmd: 'BMD',
  hmpb: 'HMPB',
  total: 'Total',
};

// minmax(0, max-content) = fit to content unless table is overflowing
// max-content = fit to content
// fr = expand to fit remaining space proportionally
const COLUMN_WIDTHS: Record<ColumnType, string> = {
  precinct: 'minmax(0, max-content)',
  'ballot-style': 'minmax(0, max-content)',
  party: 'minmax(0, max-content)',
  'voting-method': 'minmax(0, max-content)',
  scanner: 'minmax(0, max-content)',
  batch: 'minmax(0, max-content)',
  filler: '5fr',
  manual: 'max-content',
  scanned: 'max-content',
  bmd: 'max-content',
  hmpb: 'max-content',
  total: 'minmax(min-content, 2fr)',
};

const BallotCountGrid = styled.div<{
  columns: ColumnType[];
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

  .no-border-left {
    border-left: none !important;
  }

  .sum-total {
    position: relative;
    overflow-x: visible;
    text-overflow: unset;
  }
`;

type NumberColumnType = Extract<
  ColumnType,
  'manual' | 'scanned' | 'bmd' | 'hmpb' | 'total'
>;

function getCount(
  cardCounts: Tabulation.CardCounts,
  column: NumberColumnType
): string {
  const number = (() => {
    switch (column) {
      case 'manual':
        return cardCounts.manual ?? 0;
      case 'scanned':
        return getScannedBallotCount(cardCounts);
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

export type BallotCountBreakdown = 'none' | 'manual' | 'all';

function BallotCountTable({
  electionDefinition,
  scannerBatches,
  cardCountsList,
  groupBy,
  ballotCountBreakdown,
}: {
  electionDefinition: ElectionDefinition;
  scannerBatches: Tabulation.ScannerBatch[];
  cardCountsList: Tabulation.GroupList<Tabulation.CardCounts>;
  groupBy: Tabulation.GroupBy;
  ballotCountBreakdown: BallotCountBreakdown;
}): JSX.Element {
  const { election } = electionDefinition;
  const batchLookup: Record<string, Tabulation.ScannerBatch> = {};
  for (const scannerBatch of scannerBatches) {
    batchLookup[scannerBatch.batchId] = scannerBatch;
  }

  const columns: ColumnType[] = [];
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
    columns.push('filler');
  }

  const hasNonZeroManualData = cardCountsList.some((cc) => !!cc.manual);
  if (
    ballotCountBreakdown === 'manual' ||
    (ballotCountBreakdown === 'all' && hasNonZeroManualData)
  ) {
    columns.push('manual');
  }
  if (ballotCountBreakdown === 'manual') {
    columns.push('scanned');
  }
  if (ballotCountBreakdown === 'all') {
    columns.push('bmd');
    columns.push('hmpb');
  }
  columns.push('total');

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
          className={column === 'filler' ? 'no-border-left' : undefined}
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
          (cardCounts.batchId
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
                  ).abbrev;
                  break;
                case 'voting-method':
                  content =
                    Tabulation.VOTING_METHOD_LABELS[
                      assertDefined(cardCounts.votingMethod)
                    ];
                  break;
                case 'scanner':
                  content = assertDefined(scannerId);
                  break;
                case 'batch':
                  content = assertDefined(cardCounts.batchId).slice(
                    0,
                    Tabulation.BATCH_ID_DISPLAY_LENGTH
                  );
                  break;
                case 'filler':
                  break;
                case 'manual':
                case 'scanned':
                case 'bmd':
                case 'hmpb':
                case 'total':
                  content = getCount(cardCounts, column);
                  break;
                // istanbul ignore next - compile time check for completeness
                default:
                  throwIllegalValue(column);
              }
              return (
                <span
                  key={column}
                  className={column === 'filler' ? 'no-border-left' : undefined}
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
          <span className="sum-total">
            {ballotCountBreakdown === 'none' ? 'Sum Total' : 'Sum Totals'}
          </span>
          {/* eslint-disable-next-line array-callback-return */}
          {columns.slice(1).map((column) => {
            assert(column !== COLUMN_TYPES[0]);
            switch (column) {
              case 'ballot-style':
              case 'party':
              case 'voting-method':
              case 'scanner':
              case 'batch':
              case 'filler':
                return (
                  <span
                    key={column}
                    data-testid={`footer-${column}`}
                    className="no-border-left"
                  />
                );
              case 'manual':
              case 'scanned':
              case 'bmd':
              case 'hmpb':
              case 'total':
                return (
                  <span key={column} data-testid={`footer-${column}`}>
                    {getCount(totalCardCounts, column)}
                  </span>
                );
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
  ballotCountBreakdown: BallotCountBreakdown;
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
  ballotCountBreakdown,
}: BallotCountReportProps): JSX.Element {
  const { election } = electionDefinition;

  return (
    <ThemeProvider theme={tallyReportThemeFn}>
      <TallyReport data-testid={testId}>
        <ReportSection>
          <LogoMark />
          <h1>{title}</h1>
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
            ballotCountBreakdown={ballotCountBreakdown}
          />
        </ReportSection>
      </TallyReport>
    </ThemeProvider>
  );
}
