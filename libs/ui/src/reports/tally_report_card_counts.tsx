import styled from 'styled-components';
import { Tabulation } from '@votingworks/types';
import {
  format,
  getBallotCount,
  getScannedBallotCount,
} from '@votingworks/utils';
import { TD, TH } from '../table';
import { reportColors } from './layout';

const CardCountTable = styled.div`
  margin-bottom: 1em;
  border: 1px solid ${reportColors.outline};
  border-width: 0 1px;
  break-inside: avoid;

  table {
    width: 100%;
  }

  th {
    background: ${reportColors.container};
    padding: 0.375em;
    text-align: left;
  }

  td {
    padding: 0.25em 0.375em;
    font-weight: 400;
  }

  th,
  td {
    border-top: 1px solid ${reportColors.outline};
    border-bottom: 1px solid ${reportColors.outline};

    &:last-child {
      text-align: right;
    }
  }

  tr.subrow {
    font-style: italic;

    td:first-child {
      padding-left: 1em;
    }
  }
`;

interface TallyReportCardCountsProps {
  cardCounts: Tabulation.CardCounts;
}

export function TallyReportCardCounts({
  cardCounts,
}: TallyReportCardCountsProps): JSX.Element | null {
  const manualCount =
    cardCounts.manual !== undefined && cardCounts.manual > 0
      ? cardCounts.manual
      : undefined;
  const showScannedCount = manualCount !== undefined;

  return (
    <CardCountTable>
      <table data-testid="voting-method-table">
        <tbody>
          <tr>
            <TH>Ballot Count</TH>
            <TH data-testid="total-ballot-count">
              {format.count(getBallotCount(cardCounts))}
            </TH>
          </tr>
          {showScannedCount && (
            <tr>
              <TD nowrap>Scanned</TD>
              <TD>{format.count(getScannedBallotCount(cardCounts))}</TD>
            </tr>
          )}
          {cardCounts.hmpb.length > 1 &&
            cardCounts.hmpb.map((count, index) => {
              const sheetNumber = index + 1;
              const sheetCount =
                (count ?? 0) + (sheetNumber === 1 ? cardCounts.bmd : 0);
              return (
                <tr
                  key={sheetNumber}
                  className={showScannedCount ? 'subrow' : undefined}
                >
                  <TD nowrap>Sheet {sheetNumber}</TD>
                  <TD>{format.count(sheetCount)}</TD>
                </tr>
              );
            })}
          {manualCount && (
            <tr>
              <TD>Manually Entered</TD>
              <TD>{format.count(manualCount)}</TD>
            </tr>
          )}
        </tbody>
      </table>
    </CardCountTable>
  );
}
