import React from 'react';
import styled from 'styled-components';

import { Tabulation } from '@votingworks/types';

import { format, getBallotCount } from '@votingworks/utils';
import { Table, TD, TH } from '../table';

const CardCountTable = styled.div`
  margin-bottom: 1em;
  border: 1px solid rgb(194, 200, 203);
  border-width: 0 1px;
  break-inside: avoid;
  th {
    background: #e8e8e8;
    font-size: 0.9rem;
  }
`;

const SheetCount = styled.span`
  margin-left: 1rem;
`;

function getHmpbRows({
  hmpbCounts,
}: {
  hmpbCounts: Tabulation.CardCounts['hmpb'];
}): JSX.Element {
  const rows: JSX.Element[] = [
    <tr key="hmpb" data-testid="hmpb">
      <TD colSpan={2}>Hand Marked</TD>
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
        <TD narrow nowrap>
          <SheetCount>Sheet {sheetNumber}</SheetCount>
        </TD>
        <TD textAlign="left">
          {format.count(hmpbCounts[sheetNumber - 1] ?? 0)}
        </TD>
        <TD />
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
      <Table data-testid="voting-method-table">
        <tbody>
          <tr>
            <TH colSpan={3}>Ballot Counts</TH>
          </tr>
          {getHmpbRows({ hmpbCounts: cardCounts.hmpb })}
          <tr data-testid="bmd">
            <TD colSpan={2}>Machine Marked</TD>
            <TD textAlign="right">{format.count(cardCounts.bmd)}</TD>
          </tr>
          {cardCounts.manual && (
            <tr data-testid="manual">
              <TD colSpan={2}>Manually Entered</TD>
              <TD textAlign="right">{format.count(cardCounts.manual)}</TD>
            </tr>
          )}
          <tr data-testid="total-ballots">
            <TD colSpan={2}>
              <strong>Total</strong>
            </TD>
            <TD textAlign="right">
              <strong>{format.count(getBallotCount(cardCounts))}</strong>
            </TD>
          </tr>
        </tbody>
      </Table>
    </CardCountTable>
  );
}
