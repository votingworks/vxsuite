import React from 'react';
import styled from 'styled-components';

import { Tabulation } from '@votingworks/types';

import { format, getBallotCount } from '@votingworks/utils';
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

  th,
  td {
    border-top: 1px solid ${reportColors.outline};
    border-bottom: 1px solid ${reportColors.outline};
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
`;

const SheetCount = styled.span`
  margin-left: 2.5em;
`;

function getHmpbRows({
  hmpbCounts,
}: {
  hmpbCounts: Tabulation.CardCounts['hmpb'];
}): JSX.Element {
  const rows: JSX.Element[] = [
    <tr key="hmpb" data-testid="hmpb">
      <TD nowrap>Hand Marked</TD>
      <TD textAlign="right">{format.count(hmpbCounts[0] ?? 0)}</TD>
    </tr>,
  ];

  if (hmpbCounts.length <= 1) {
    return <React.Fragment>{rows}</React.Fragment>;
  }

  for (
    let sheetNumber = 1;
    sheetNumber <= hmpbCounts.length;
    sheetNumber += 1
  ) {
    const key = `hmpb-${sheetNumber}`;
    rows.push(
      <tr key={key} data-testid={key}>
        <TD nowrap>
          <SheetCount>Sheet {sheetNumber}</SheetCount>
        </TD>
        <TD textAlign="right">
          {format.count(hmpbCounts[sheetNumber - 1] ?? 0)}
        </TD>
      </tr>
    );
  }
  return <React.Fragment>{rows}</React.Fragment>;
}

interface TallyReportCardCountsProps {
  cardCounts: Tabulation.CardCounts;
}

export function TallyReportCardCounts({
  cardCounts,
}: TallyReportCardCountsProps): JSX.Element | null {
  return (
    <CardCountTable>
      <table data-testid="voting-method-table">
        <tbody>
          <tr>
            <TH>Ballot Counts</TH>
            <TH />
          </tr>
          {getHmpbRows({ hmpbCounts: cardCounts.hmpb })}
          <tr data-testid="bmd">
            <TD>Machine Marked</TD>
            <TD textAlign="right">{format.count(cardCounts.bmd)}</TD>
          </tr>
          {cardCounts.manual !== undefined && cardCounts.manual > 0 && (
            <tr data-testid="manual">
              <TD>Manually Entered</TD>
              <TD textAlign="right">{format.count(cardCounts.manual)}</TD>
            </tr>
          )}
          <tr data-testid="total-ballots">
            <TD>
              <strong>Total</strong>
            </TD>
            <TD textAlign="right" data-testid="total-ballot-count">
              <strong>{format.count(getBallotCount(cardCounts))}</strong>
            </TD>
          </tr>
        </tbody>
      </table>
    </CardCountTable>
  );
}
