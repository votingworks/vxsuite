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
import { format, getLanguageOptions } from '@votingworks/utils';
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
import { ScreenWrapper } from '../components/screen_wrapper';

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

interface ColumnWidths {
  precinctName: number;
  attribute: number;
  count: number;
  rightPadding: number;
}

type AttributeColumnCount = 0 | 1 | 2;

// Column width percentages for different numbers of attribute columns.
// precinctName -> precinct name column, adjusts based on number of attribute columns
// attribute -> optional attribute columns (Party, Language)
// count -> three count columns (Total, Precinct, Absentee), fixed width
// rightPadding -> extra padding to make space for the scrollbar, fixed width
const COUNT_COLUMN_WIDTH = 10; // Each count column is 10% of the table's width
const RIGHT_PADDING_WIDTH = 2; // Right padding to accommodate scrollbar
const COLUMN_WIDTH_MAP: Record<AttributeColumnCount, ColumnWidths> = {
  0: {
    precinctName: 68, // 100% - COUNT_COLUMN_WIDTH * 3 - RIGHT_PADDING_WIDTH = 68
    attribute: 0,
    count: COUNT_COLUMN_WIDTH,
    rightPadding: RIGHT_PADDING_WIDTH,
  },
  1: {
    precinctName: 38, // 100 - attributeWidth - COUNT_COLUMN_WIDTH * 3 - RIGHT_PADDING_WIDTH = 38
    attribute: 30, // Measured by eye
    count: COUNT_COLUMN_WIDTH,
    rightPadding: RIGHT_PADDING_WIDTH,
  },
  2: {
    precinctName: 30, // 100 - attributeWidth * 2 - COUNT_COLUMN_WIDTH * 3 - RIGHT_PADDING_WIDTH = 38
    attribute: 19, // Measured by eye
    count: COUNT_COLUMN_WIDTH,
    rightPadding: RIGHT_PADDING_WIDTH,
  },
};

export function ReportScreen({
  isElectionManagerAuth,
}: {
  isElectionManagerAuth?: boolean;
}): JSX.Element | null {
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
  const hasParties = election.type === 'primary';
  const showLanguage = getLanguageOptions(election).length > 1;
  const ballotPrintCounts = getBallotPrintCountsQuery.data;
  const { printer } = getDeviceStatusesQuery.data;

  const attributeColumnCount = ((hasParties ? 1 : 0) +
    (showLanguage ? 1 : 0)) as AttributeColumnCount;
  const columnWidths = COLUMN_WIDTH_MAP[attributeColumnCount];

  return (
    <ScreenWrapper
      authType={isElectionManagerAuth ? 'election_manager' : 'poll_worker'}
    >
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
                  <TH style={{ width: `${columnWidths.precinctName}%` }}>
                    {electionHasSplits
                      ? 'Precinct / Split Name'
                      : 'Precinct Name'}
                  </TH>
                  {hasParties && (
                    <TH style={{ width: `${columnWidths.attribute}%` }}>
                      Party
                    </TH>
                  )}
                  {showLanguage && (
                    <TH style={{ width: `${columnWidths.attribute}%` }}>
                      Language
                    </TH>
                  )}
                  <TH style={{ width: `${columnWidths.count}%` }}>Total</TH>
                  <TH style={{ width: `${columnWidths.count}%` }}>Precinct</TH>
                  <TH
                    style={{
                      width: `${
                        columnWidths.count + columnWidths.rightPadding
                      }%`,
                    }}
                  >
                    Absentee
                  </TH>
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
                      <TD style={{ width: `${columnWidths.precinctName}%` }}>
                        {counts.precinctOrSplitName}
                      </TD>
                      {hasParties && (
                        <TD style={{ width: `${columnWidths.attribute}%` }}>
                          {counts.partyName}
                        </TD>
                      )}
                      {showLanguage && (
                        <TD style={{ width: `${columnWidths.attribute}%` }}>
                          {format.languageDisplayName({
                            languageCode: counts.languageCode,
                            displayLanguageCode: 'en',
                          })}
                        </TD>
                      )}
                      <TD style={{ width: `${columnWidths.count}%` }}>
                        {counts.totalCount}
                      </TD>
                      <TD style={{ width: `${columnWidths.count}%` }}>
                        {counts.precinctCount}
                      </TD>
                      <TD
                        style={{
                          width: `${
                            columnWidths.count + columnWidths.rightPadding
                          }%`,
                        }}
                      >
                        {counts.absenteeCount}
                      </TD>
                    </TableRow>
                  ))}
              </tbody>
            </Table>
          </ScrollableTableContainer>
        </Content>
        {isShowingPrintingModal && (
          <Modal
            centerContent
            content={
              <Loading
                animationDurationS={DEFAULT_PROGRESS_MODAL_DELAY_SECONDS}
              >
                Printing
              </Loading>
            }
          />
        )}
      </Container>
    </ScreenWrapper>
  );
}
