import React, { useState, useMemo } from 'react';
import styled from 'styled-components';

import {
  Table,
  TH,
  Button,
  MainContent,
  Font,
  TD,
  Callout,
  P,
} from '@votingworks/ui';
import { hasSplits } from '@votingworks/types';
import { format } from '@votingworks/utils';
import { assertDefined } from '@votingworks/basics';

import { getElectionRecord, getBallotPrintCounts } from '../api';
import { Row } from '../layout';
import { TitleBar } from '../components/title_bar';
import { sortBallotPrintCounts } from '../utils';
import { Filter } from '../components/filter';

const Container = styled.div`
  height: calc(100vh - 2.2rem);
  display: flex;
  flex-direction: column;
`;

const Content = styled(MainContent)`
  display: flex;
  flex-direction: column;
  padding-bottom: 0.5rem;
`;

const PrintCountCallout = styled(Callout)`
  div {
    padding: 0.25rem 1rem;
    gap: 1rem;
  }

  p {
    display: flex;
    align-items: center;
    margin-bottom: 0;
    font-size: 0.9rem;
    gap: 0.5rem;
  }
`;

const ScrollableTableContainer = styled.div`
  flex: 1;
  overflow-y: scroll;
`;

const FixedTableHeader = styled.div`
  border-bottom: 1px solid #ddd;
  margin-top: 1rem;

  /* Reserve space for scrollbar to maintain alignment */
  padding-right: 0.5rem;
`;

const TableRow = styled.tr`
  & td {
    padding: 0.375rem 0.5rem;
  }

  & th {
    padding: 0.375rem 0.5rem;
  }
`;

export function ReportScreen(): JSX.Element | null {
  const getBallotPrintCountsQuery = getBallotPrintCounts.useQuery();
  const getElectionRecordQuery = getElectionRecord.useQuery();
  const [filterText, setFilterText] = useState('');
  const electionRecord = getElectionRecordQuery.data;
  const { precincts } = electionRecord?.electionDefinition.election || {};
  const electionHasSplits = useMemo(
    () => precincts?.some((precinct) => hasSplits(precinct)),
    [precincts]
  );

  if (
    !getBallotPrintCountsQuery.isSuccess ||
    !getElectionRecordQuery.isSuccess
  ) {
    return null;
  }

  const ballotPrintCounts = getBallotPrintCountsQuery.data;
  const { election } = assertDefined(electionRecord).electionDefinition;
  const hasParties = election.type === 'primary';

  return (
    <Container>
      <TitleBar
        title="Report"
        actions={
          <React.Fragment>
            <Button onPress={() => console.log('Saving report')}>
              Save PDF Report
            </Button>
            <Button onPress={() => console.log('Printing report')}>
              Print Report
            </Button>
          </React.Fragment>
        }
      />
      <Content>
        <Row style={{ gap: '1rem' }}>
          <Filter filterText={filterText} setFilterText={setFilterText} />
          <PrintCountCallout color="neutral">
            <P>
              Total Prints:
              <Font weight="bold" style={{ fontSize: '1.5rem' }}>
                {' '}
                {format.count(
                  ballotPrintCounts.reduce(
                    (acc, count) => acc + count.totalCount,
                    0
                  )
                )}
              </Font>
            </P>
            <P>
              Precinct:
              <Font weight="bold" style={{ fontSize: '1.5rem' }}>
                {' '}
                {format.count(
                  ballotPrintCounts.reduce(
                    (acc, count) => acc + count.precinctCount,
                    0
                  )
                )}
              </Font>
            </P>
            <P>
              Absentee:
              <Font weight="bold" style={{ fontSize: '1.5rem' }}>
                {' '}
                {format.count(
                  ballotPrintCounts.reduce(
                    (acc, count) => acc + count.absenteeCount,
                    0
                  )
                )}
              </Font>
            </P>
          </PrintCountCallout>
        </Row>
        <FixedTableHeader>
          <Table style={{ tableLayout: 'fixed', width: '100%' }}>
            <thead>
              <TableRow>
                <TH style={{ width: hasParties ? '25%' : '35%' }}>
                  {electionHasSplits ? 'Precinct/Split Name' : 'Precinct Name'}
                </TH>
                {hasParties && <TH style={{ width: '19%' }}>Party</TH>}
                <TH style={{ width: hasParties ? '20%' : '25%' }}>Language</TH>
                <TH style={{ width: '12%' }}>Total</TH>
                <TH style={{ width: '12%' }}>Precinct</TH>
                <TH style={{ width: '12%' }}>Absentee</TH>
              </TableRow>
            </thead>
          </Table>
        </FixedTableHeader>
        <ScrollableTableContainer>
          <Table style={{ tableLayout: 'fixed', width: '100%' }}>
            <tbody>
              {ballotPrintCounts
                .filter(
                  (count) =>
                    filterText === '' ||
                    count.precinctOrSplitName
                      .toLowerCase()
                      .includes(filterText.toLowerCase())
                )
                .sort(sortBallotPrintCounts)
                .map((counts) => (
                  <TableRow
                    key={`${counts.ballotStyleId}-${counts.precinctOrSplitName}`}
                  >
                    <TD style={{ width: hasParties ? '25%' : '35%' }}>
                      {counts.precinctOrSplitName}
                    </TD>
                    {hasParties && (
                      <TD style={{ width: '19%' }}>{counts.partyName}</TD>
                    )}
                    <TD style={{ width: hasParties ? '20%' : '25%' }}>
                      {format.languageDisplayName({
                        languageCode: counts.languageCode,
                        displayLanguageCode: 'en',
                      })}
                    </TD>
                    <TD style={{ width: '12%' }}>{counts.totalCount}</TD>
                    <TD style={{ width: '12%' }}>{counts.precinctCount}</TD>
                    <TD style={{ width: '12%' }}>{counts.absenteeCount}</TD>
                  </TableRow>
                ))}
            </tbody>
          </Table>
        </ScrollableTableContainer>
      </Content>
    </Container>
  );
}
