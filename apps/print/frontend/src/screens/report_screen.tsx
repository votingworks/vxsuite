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
  Modal,
  Loading,
} from '@votingworks/ui';
import { hasSplits } from '@votingworks/types';
import { format } from '@votingworks/utils';
import { assert } from '@votingworks/basics';

import {
  getElectionRecord,
  getBallotPrintCounts,
  printBallotsPrintedReport,
  getDeviceStatuses,
} from '../api';
import { Row } from '../layout';
import { TitleBar } from '../components/title_bar';
import { Filter } from '../components/filter';
import { ExportReportButton } from '../components/export_report_button';

const DEFAULT_PROGRESS_MODAL_DELAY_SECONDS = 3;

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
  const printReportMutation = printBallotsPrintedReport.useMutation();
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();
  const [filterText, setFilterText] = useState('');
  const electionRecord = getElectionRecordQuery.data;
  const election = electionRecord?.electionDefinition.election;
  const electionHasSplits = useMemo(
    () => election?.precincts.some((precinct) => hasSplits(precinct)),
    [election]
  );

  const [isShowingPrintingModal, setIsShowingPrintingModal] = useState(false);

  function handlePrint() {
    setIsShowingPrintingModal(true);
    setTimeout(() => {
      setIsShowingPrintingModal(false);
    }, DEFAULT_PROGRESS_MODAL_DELAY_SECONDS * 1000);
    printReportMutation.mutate();
  }

  if (
    !getBallotPrintCountsQuery.isSuccess ||
    !getElectionRecordQuery.isSuccess ||
    !getDeviceStatusesQuery.isSuccess
  ) {
    return null;
  }

  assert(election !== undefined);
  const ballotPrintCounts = getBallotPrintCountsQuery.data;
  const hasParties = election.type === 'primary';
  const { printer } = getDeviceStatusesQuery.data;

  return (
    <Container>
      <TitleBar
        title="Report"
        actions={
          <React.Fragment>
            <Button disabled={!printer.connected} onPress={handlePrint}>
              Print Report
            </Button>
            <ExportReportButton />
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
                  {electionHasSplits
                    ? 'Precinct / Split Name'
                    : 'Precinct Name'}
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
      {isShowingPrintingModal && (
        <Modal centerContent content={<Loading>Printing</Loading>} />
      )}
    </Container>
  );
}
