import {
  Button,
  ContestResultsTable,
  H1,
  H2,
  MainContent,
  Modal,
  P,
  TallyReportColumns,
  Table,
  TD,
  TH,
  Icons,
  Card,
  LabelledText,
  H3,
  Caption,
  LinkButton,
  LabeledValue,
  Breadcrumbs,
  ReportElectionInfo,
  ReportMetadata,
  Callout,
  TestModeCallout,
  TestModeBanner,
  useQueryChangeListener,
  RouterTabBar,
  iconColor,
  IconColor,
} from '@votingworks/ui';
import { useParams, Switch, Route } from 'react-router-dom';
import React, { useState } from 'react';
import { assert, deepEqual, throwIllegalValue } from '@votingworks/basics';
import { formatBallotHash, PrecinctSelection } from '@votingworks/types';
import {
  getContestsForPrecinctAndElection,
  getPrecinctSelectionName,
  format,
  groupContestsByParty,
  getPollsStateName,
} from '@votingworks/utils';
import styled, { useTheme } from 'styled-components';
import type {
  GetExportedElectionError,
  QuickReportedPollStatus,
} from '@votingworks/design-backend';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, routes } from './routes';
import {
  deleteQuickReportingResults,
  getLiveResultsReports,
  getLiveReportsSummary,
  getSystemSettings,
} from './api';
import { useTitle } from './hooks/use_title';
import { Row, Column } from './layout';
import { ALL_PRECINCTS_REPORT_KEY, useSound } from './utils';

const PollsStatusLabel = styled.span`
  font-size: 1rem;
`;

function getScannerStatusText(
  pollsOpenCount: number,
  pollsPausedCount: number,
  pollsClosedCount: number
): JSX.Element | string {
  const totalCount = pollsOpenCount + pollsClosedCount;

  if (totalCount === 0) {
    return <span>No reports sent</span>;
  }
  if (pollsClosedCount === 0) {
    return <span>{pollsOpenCount} open</span>;
  }
  const icon =
    pollsClosedCount === totalCount ? (
      <Icons.Done color="primary" />
    ) : (
      <Icons.Paused color="neutral" />
    );
  return (
    <span>
      {icon} {pollsClosedCount}/{totalCount} closed
    </span>
  );
}

function getErrorMessage(error: GetExportedElectionError): string {
  switch (error) {
    case 'no-election-export-found':
      return 'This election has not yet been exported. Please export the election and configure VxScan to enable live reports.';
    case 'election-out-of-date':
      return 'This election is no longer compatible with Live Reports. Please export a new election package to continue using Live Reports.';
    default:
      throwIllegalValue(error);
  }
}

const ActivityPanel = styled(Card)`
  > div {
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  border: ${(p) =>
    `${p.theme.sizes.bordersRem.thin}rem solid ${p.theme.colors.outline}`};
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const SummaryCard = styled(Card)`
  overflow: hidden;
  > div {
    padding: 0;
  }
`;

const StatusTable = styled(Table)`
  td {
    padding: 0.5rem;
  }
`;

const ActivityHeader = styled.div`
  // color: ${(p) => p.theme.colors.onInverse};
  background-color: ${(p) => p.theme.colors.containerLow};
  top: 0;
  padding: 0.75rem 0.5rem 0.25rem 0.75rem;
  border-bottom: ${(p) =>
    `${p.theme.sizes.bordersRem.thin}rem solid ${p.theme.colors.outline}`};
`;

const ActivityList = styled.div`
  overflow-y: auto;
`;

const ActivityItem = styled.div`
  // background-color: ${(p) => p.theme.colors.containerLow};
  > :first-child {
    font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  }
  > :not(:first-child) {
    color: ${(p) => p.theme.colors.onBackgroundMuted};
  }
  padding: 0.75rem;
  border-bottom: ${(p) =>
    `${p.theme.sizes.bordersRem.hairline}rem solid ${p.theme.colors.outline}`};
`;

function getLastUpdateInformation(
  reports: QuickReportedPollStatus[]
): JSX.Element {
  const lastPollsUpdate = [...reports].sort(
    (a, b) => b.signedTimestamp.getTime() - a.signedTimestamp.getTime()
  )[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div>
        {lastPollsUpdate.machineId}: Polls{' '}
        {getPollsStateName(lastPollsUpdate.pollsState)}
      </div>
      <Caption>
        {format.localeShortDateAndTime(lastPollsUpdate.signedTimestamp)}
      </Caption>
    </div>
  );
}

const BarContainer = styled.div`
  background-color: ${(p) => p.theme.colors.containerLow};
  border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  height: 0.75rem;
  width: 100%;
  overflow: hidden;
  display: flex;
`;

const BarFill = styled.div<{ color: IconColor }>`
  background-color: ${(p) => iconColor(p.theme, p.color)};
  height: 100%;
  transition: width 0.3s ease;
`;

function StackedBarChart({
  segments,
}: {
  segments: Array<{ color: IconColor; value: number }>;
}): JSX.Element {
  const totalValue = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <BarContainer>
      {segments.map((segment, index) => (
        <BarFill
          key={index}
          color={segment.color}
          style={{ width: `${(segment.value / totalValue) * 100}%` }}
        />
      ))}
    </BarContainer>
  );
}

interface LiveReportsSummaryScreenProps {
  electionId: string;
}

function LiveReportsSummaryScreen({
  electionId,
}: LiveReportsSummaryScreenProps): JSX.Element {
  const [isDeleteDataModalOpen, setIsDeleteDataModalOpen] = useState(false);
  const [precinctIdsToAnimate, setPrecinctIdsToAnimate] = useState<string[]>(
    []
  );
  const getLiveReportsSummaryQuery = getLiveReportsSummary.useQuery(electionId);

  const deleteQuickReportingResultsMutation =
    deleteQuickReportingResults.useMutation();

  function setPrecinctsToAnimate(precinctIds: string[]): void {
    setPrecinctIdsToAnimate(precinctIds);
    setTimeout(() => {
      setPrecinctIdsToAnimate((prev) =>
        prev.filter((id) => !precinctIds.includes(id))
      );
    }, 1000);
  }

  // Get data for animations (provide empty defaults if not loaded)
  const pollsStatusData = getLiveReportsSummaryQuery.isSuccess
    ? getLiveReportsSummaryQuery.data.isOk()
      ? getLiveReportsSummaryQuery.data.ok()
      : null
    : null;
  // Memoize precincts so it only recalculates when pollsStatusData changes
  const precinctsWithNonSpecified = React.useMemo(
    () =>
      pollsStatusData
        ? [
            ...pollsStatusData.election.precincts,
            {
              id: ALL_PRECINCTS_REPORT_KEY,
              name: 'Precinct Not Specified',
              splits: [],
            },
          ]
        : [],
    [pollsStatusData]
  );

  const playSound = useSound('happy-ping');
  useQueryChangeListener(getLiveReportsSummaryQuery, {
    // Could also select `isLive` too if that's relevant
    select: (result) => ({
      reportsByPrecinct: result.ok()?.reportsByPrecinct,
      isLive: result.ok()?.isLive,
    }),
    onChange: (newData, oldData) => {
      if (!oldData) return;
      const { reportsByPrecinct: newReportsByPrecinct, isLive: newIsLive } =
        newData;
      const { reportsByPrecinct: oldReportsByPrecinct, isLive: oldIsLive } =
        oldData;
      if (!newReportsByPrecinct) return;
      const switchedLive = newIsLive && !oldIsLive;
      const changedPrecincts = Object.entries(newReportsByPrecinct)
        .filter(([precinctId, newReports]) => {
          const oldReports =
            switchedLive || !oldReportsByPrecinct
              ? []
              : oldReportsByPrecinct[precinctId];
          return !deepEqual(oldReports, newReports);
        })
        .map(([precinctId]) => precinctId);
      // do not ping when data is deleted.
      const hasNewData =
        Object.entries(newReportsByPrecinct).filter(
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          ([_, newReports]) => newReports.length > 0
        ).length > 0;
      setPrecinctsToAnimate(changedPrecincts);
      if (changedPrecincts.length > 0 && hasNewData) {
        // playSound();
      }
    },
  });

  /* // Animation hooks (always called)
  const precinctAnimations = usePrecinctAnimations(
    precinctsWithNonSpecified,
    reportsByPrecinct,
    reportsIsLive,
    playSound
  ); */

  const theme = useTheme();

  async function deleteData(): Promise<void> {
    try {
      await deleteQuickReportingResultsMutation.mutateAsync({
        electionId,
      });
    } catch {
      // Even if there's an error, continue to close modal
    } finally {
      // Always close the modal regardless of success or failure
      setIsDeleteDataModalOpen(false);
    }
  }

  if (!getLiveReportsSummaryQuery.isSuccess) {
    return (
      <div>
        <Header>
          <H1 style={{ paddingRight: '1rem', display: 'inline' }}>
            Live Reports
          </H1>
        </Header>
        <MainContent>
          <Icons.Loading />
        </MainContent>
      </div>
    );
  }

  if (getLiveReportsSummaryQuery.data.isErr()) {
    const errorMessage = getErrorMessage(getLiveReportsSummaryQuery.data.err());
    return (
      <div>
        <Header>
          <H1 style={{ paddingRight: '1rem', display: 'inline' }}>
            Live Reports
          </H1>
        </Header>
        <MainContent>
          <Callout color="warning" icon="Warning">
            {errorMessage}
          </Callout>
        </MainContent>
      </div>
    );
  }

  assert(pollsStatusData !== null);

  const allEntries = Object.values(pollsStatusData.reportsByPrecinct).flat();

  return (
    <Column style={{ height: '100%' }}>
      <Header>
        <Row style={{ alignItems: 'center', gap: '1rem' }}>
          <H1 style={{ paddingRight: '1rem', display: 'inline' }}>
            Live Reports
          </H1>
          {allEntries.length > 0 && !pollsStatusData.isLive && (
            <TestModeCallout viewMode="desktop" />
          )}
        </Row>
      </Header>
      <MainContent>
        <Column style={{ gap: '1rem', height: '100%' }}>
          <RouterTabBar
            tabs={[
              {
                title: 'All Voting Groups',
                path: routes.election(electionId).reports.root.path,
              },
              { title: 'Early Voting', path: '' },
              { title: 'Election Day', path: '' },
              { title: 'Absentee', path: '' },
            ]}
          />
          {allEntries.length > 0 && (
            <Row style={{ minHeight: 0, gap: '1rem' }}>
              <Column
                style={{
                  gap: '1rem',
                  overflow: 'hidden',
                  height: '100%',
                  flex: 2,
                }}
              >
                <SummaryCard>
                  <ActivityHeader>
                    <H3>Polling Place Status</H3>
                  </ActivityHeader>
                  <Column style={{ padding: '1rem', gap: '1rem' }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        flex: 1,
                        gap: '2rem',
                      }}
                    >
                      <LabelledText
                        labelPosition="bottom"
                        label={
                          <PollsStatusLabel>No reports sent</PollsStatusLabel>
                        }
                      >
                        <H1
                          data-testid="no-reports-sent-count"
                          style={{ marginBottom: '0.25rem' }}
                        >
                          <Icons.Warning color="warning" />{' '}
                          {
                            Object.values(
                              pollsStatusData.reportsByPrecinct
                            ).filter((entries) => entries.length === 0).length
                          }
                        </H1>
                      </LabelledText>
                      <LabelledText
                        labelPosition="bottom"
                        label={<PollsStatusLabel>Polls open</PollsStatusLabel>}
                      >
                        <H1
                          data-testid="polls-open-count"
                          style={{ marginBottom: '0.25rem' }}
                        >
                          <Icons.Circle color="success" />{' '}
                          {
                            Object.values(
                              pollsStatusData.reportsByPrecinct
                            ).filter(
                              (entries) =>
                                entries.length > 0 &&
                                entries.every(
                                  (entry) => entry.pollsState === 'polls_open'
                                )
                            ).length
                          }
                        </H1>
                      </LabelledText>
                      <LabelledText
                        labelPosition="bottom"
                        label={
                          <PollsStatusLabel>Polls paused</PollsStatusLabel>
                        }
                      >
                        <H1
                          data-testid="polls-paused-count"
                          style={{ marginBottom: '0.25rem' }}
                        >
                          <Icons.Paused color="neutral" /> 2
                          {/* {
                              Object.values(
                                pollsStatusData.reportsByPrecinct
                              ).filter(
                                (entries) =>
                                  entries.length > 0 &&
                                  entries.every(
                                    (entry) => entry.pollsState === 'polls_open'
                                  )
                              ).length
                            } */}
                        </H1>
                      </LabelledText>
                      {/* <LabelledText
                      labelPosition="bottom"
                      label={<PollsStatusLabel>Polls closing</PollsStatusLabel>}
                    >
                      <H1 data-testid="polls-closing-count">
                        <Icons.CircleDot color="primary" />{' '}
                        {
                          Object.values(
                            pollsStatusData.reportsByPrecinct
                          ).filter(
                            (entries) =>
                              entries.length > 0 &&
                              entries.some(
                                (entry) => entry.pollsState === 'polls_open'
                              ) &&
                              entries.some(
                                (entry) =>
                                  entry.pollsState === 'polls_closed_final'
                              )
                          ).length
                        }
                      </H1>
                    </LabelledText> */}
                      <LabelledText
                        labelPosition="bottom"
                        label={
                          <PollsStatusLabel>Polls closed</PollsStatusLabel>
                        }
                      >
                        <H1
                          data-testid="polls-closed-count"
                          style={{ marginBottom: '0.25rem' }}
                        >
                          <Icons.Done color="primary" />{' '}
                          {
                            Object.values(
                              pollsStatusData.reportsByPrecinct
                            ).filter(
                              (entries) =>
                                entries.length > 0 &&
                                entries.every(
                                  (entry) =>
                                    entry.pollsState === 'polls_closed_final'
                                )
                            ).length
                          }
                        </H1>
                      </LabelledText>
                    </div>
                    <StackedBarChart
                      segments={[
                        {
                          color: 'warning',
                          value: 1,
                        },
                        {
                          color: 'success',
                          value: 1,
                        },
                        {
                          color: 'neutral',
                          value: 2,
                        },
                        {
                          color: 'primary',
                          value: 2,
                        },
                      ]}
                    />
                    {/* <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                      }}
                    >
                      <Button
                    color="danger"
                    icon="Delete"
                    onPress={() => setIsDeleteDataModalOpen(true)}
                  >
                    Delete All Reports
                  </Button> 
                    </div> */}
                  </Column>
                </SummaryCard>
                <div style={{ flex: 2, height: '100%', overflowY: 'auto' }}>
                  <StatusTable>
                    <thead>
                      <tr>
                        <TH style={{ minWidth: '200px' }}>Polling Place</TH>
                        <TH style={{ minWidth: '180px' }}>Status</TH>
                        <TH style={{ minWidth: '180px' }}>Scanners</TH>
                        {/* <TH style={{ minWidth: '250px' }}>Last Report Sent</TH> */}
                        {/* <TH style={{ minWidth: '200px' }} /> */}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <TD>Polling Place 1</TD>
                        <TD>
                          <Icons.Warning color="warning" /> No reports sent
                        </TD>
                        <TD />
                      </tr>
                      <tr>
                        <TD>Polling Place 2</TD>
                        <TD>
                          <Icons.Circle color="success" /> Polls open
                        </TD>
                        <TD>2 open</TD>
                      </tr>
                      {/* {precinctsWithNonSpecified.map((precinct) => {
                        // Only show the "Precinct Not Specified" row if there is data for it
                        const reportsForPrecinct =
                          pollsStatusData.reportsByPrecinct[precinct.id] || [];

                        if (
                          precinct.id === ALL_PRECINCTS_REPORT_KEY &&
                          reportsForPrecinct.length === 0
                        ) {
                          return null;
                        }

                        const pollsOpenCount = reportsForPrecinct.filter(
                          (entry) => entry.pollsState === 'polls_open'
                        ).length;
                        const pollsClosedCount = reportsForPrecinct.filter(
                          (entry) => entry.pollsState === 'polls_closed_final'
                        ).length;

                        const isHighlighted = precinctIdsToAnimate.includes(
                          precinct.id
                        );

                        return (
                          <tr
                            key={precinct.id}
                            data-testid={`precinct-row-${precinct.id}`}
                            data-highlighted={isHighlighted ? 'true' : 'false'}
                            style={{
                              height: '3rem',
                              transition: 'background-color 0.5s ease-in-out',
                              // backgroundColor: isHighlighted
                              //   ? theme.colors.inversePrimary
                              //   : 'transparent',
                            }}
                          >
                            <TD>{precinct.name}</TD>
                            <TD>
                              {getSummaryStatusText(
                                pollsOpenCount,
                                pollsClosedCount
                              )}
                            </TD>
                            <TD>
                              {getScannerStatusText(
                                pollsOpenCount,
                                pollsPausedCount,
                                pollsClosedCount
                              )}
                            </TD>
                            {/* <TD>
                        {reportsForPrecinct.length > 0 &&
                          getLastUpdateInformation(reportsForPrecinct)}
                      </TD>
                      <TD textAlign="right" style={{ paddingRight: '1rem' }}>
                        {pollsClosedCount > 0 && precinct.id && (
                          <LinkButton
                            data-testid={`view-tally-report-${precinct.id}`}
                            to={`${
                              routes
                                .election(electionId)
                                .reports.byPrecinctResults(precinct.id).path
                            }`}
                          >
                            View Tally Report
                          </LinkButton>
                        )}
                      </TD> 
                          </tr>
                        );
                      })} */}
                    </tbody>
                  </StatusTable>
                </div>
              </Column>
              <Column style={{ gap: '1rem', flex: 1 }}>
                <LinkButton
                  variant="primary"
                  disabled={
                    allEntries.filter(
                      (entry) => entry.pollsState === 'polls_closed_final'
                    ).length === 0
                  }
                  to={`${
                    routes.election(electionId).reports.allPrecinctResults.path
                  }`}
                >
                  View Tally Reports
                </LinkButton>
                <ActivityPanel style={{ flex: 1 }}>
                  <ActivityHeader>
                    <H3>Activity</H3>
                  </ActivityHeader>
                  <ActivityList>
                    {allEntries.map((entry) => (
                      <ActivityItem
                        key={entry.machineId + entry.signedTimestamp}
                      >
                        <div>
                          {entry.machineId}: Polls{' '}
                          {getPollsStateName(entry.pollsState)}
                        </div>
                        <div>
                          {(entry.precinctSelection.kind === 'SinglePrecinct' &&
                            precinctsWithNonSpecified.find(
                              (p) =>
                                entry.precinctSelection.kind ===
                                  'SinglePrecinct' &&
                                p.id === entry.precinctSelection.precinctId
                            )?.name) ||
                            'Unknown'}
                        </div>
                        <Caption>
                          {format.localeShortDateAndTime(entry.signedTimestamp)}
                        </Caption>
                      </ActivityItem>
                    ))}
                  </ActivityList>
                </ActivityPanel>
              </Column>
            </Row>
          )}

          {allEntries.length === 0 && (
            <Callout color="neutral" icon="Info">
              No machines have sent reports yet.
            </Callout>
          )}
        </Column>
      </MainContent>
      {isDeleteDataModalOpen && (
        <Modal
          content={
            deleteQuickReportingResultsMutation.isLoading ? (
              <Icons.Loading />
            ) : (
              <React.Fragment>
                <H2 as="h1">Delete All Reports</H2>
                <P>
                  Are you sure you want to delete all reports for this election?
                </P>
              </React.Fragment>
            )
          }
          actions={
            deleteQuickReportingResultsMutation.isLoading ? (
              <Button
                onPress={() => setIsDeleteDataModalOpen(false)}
                variant="secondary"
              >
                Cancel
              </Button>
            ) : (
              <React.Fragment>
                <Button
                  onPress={() => deleteData()}
                  variant="danger"
                  data-testid="confirm-delete-data-button"
                >
                  Delete Reports
                </Button>
                <Button onPress={() => setIsDeleteDataModalOpen(false)}>
                  Cancel
                </Button>
              </React.Fragment>
            )
          }
          onOverlayClick={
            deleteQuickReportingResultsMutation.isLoading
              ? undefined
              : () => setIsDeleteDataModalOpen(false)
          }
        />
      )}
    </Column>
  );
}

interface ResultsTabProps {
  electionId: string;
}

function LiveReportsResultsScreen({
  electionId,
}: ResultsTabProps): JSX.Element {
  const { precinctId } = useParams<{ precinctId: string }>();
  const precinctSelection: PrecinctSelection = precinctId
    ? { kind: 'SinglePrecinct', precinctId }
    : { kind: 'AllPrecincts' };
  const getLiveResultsReportsQuery = getLiveResultsReports.useQuery(
    electionId,
    precinctSelection
  );

  if (!getLiveResultsReportsQuery.isSuccess) {
    // We don't know test/live mode yet or have the election data yet so show a generic title.
    const reportTitle = 'Unofficial Tally Report';
    return (
      <React.Fragment>
        <Header>
          <Breadcrumbs
            currentTitle={reportTitle}
            parentRoutes={[routes.election(electionId).reports.root]}
          />
          <H1>{reportTitle}</H1>
        </Header>
        <MainContent>
          <Icons.Loading />
        </MainContent>
      </React.Fragment>
    );
  }

  if (getLiveResultsReportsQuery.data.isErr()) {
    const errorMessage = getErrorMessage(getLiveResultsReportsQuery.data.err());
    return <P>{errorMessage}</P>;
  }

  const aggregatedResults = getLiveResultsReportsQuery.data.ok();
  const contests = getContestsForPrecinctAndElection(
    aggregatedResults.election,
    precinctSelection
  );
  const contestsByParty = groupContestsByParty(
    aggregatedResults.election,
    contests
  );
  const partyNamesById = aggregatedResults.election.parties.reduce<
    Record<string, string>
  >((acc, party) => ({ ...acc, [party.id]: party.fullName }), {});
  const testLivePrefix = aggregatedResults.isLive ? '' : 'Test ';

  const reportTitle =
    precinctSelection.kind === 'AllPrecincts'
      ? `Unofficial ${testLivePrefix}Tally Report`
      : `Unofficial ${testLivePrefix}${getPrecinctSelectionName(
          aggregatedResults.election.precincts,
          precinctSelection
        )} Tally Report`;

  return (
    <React.Fragment>
      <Header>
        <Breadcrumbs
          currentTitle={reportTitle}
          parentRoutes={[routes.election(electionId).reports.root]}
        />
        <H1>{reportTitle}</H1>
      </Header>
      <MainContent>
        <div>
          {aggregatedResults.machinesReporting.length === 0 && (
            <p>No results reported.</p>
          )}
          {aggregatedResults.machinesReporting.length > 0 &&
            !aggregatedResults.isLive && <TestModeBanner />}
          <ReportElectionInfo election={aggregatedResults.election} />
          <ReportMetadata>
            <LabeledValue
              label="Election ID"
              value={formatBallotHash(aggregatedResults.ballotHash)}
            />
          </ReportMetadata>
          {aggregatedResults.machinesReporting.length > 0 && (
            <div>
              {contestsByParty.map((partyGroup) => (
                <div
                  key={`partyResults-${partyGroup.partyId || 'nonpartisan'}`}
                >
                  {partyGroup.partyId && (
                    <h2>{partyNamesById[partyGroup.partyId]} Contests</h2>
                  )}
                  {!partyGroup.partyId && contestsByParty.length > 1 && (
                    <h2>Nonpartisan Contests</h2>
                  )}
                  <TallyReportColumns>
                    {partyGroup.contests.map((contest) => {
                      const currentContestResults =
                        aggregatedResults.contestResults[contest.id];
                      assert(
                        currentContestResults,
                        `missing scanned results for contest ${contest.id}`
                      );
                      return (
                        <ContestResultsTable
                          key={contest.id}
                          election={aggregatedResults.election}
                          contest={contest}
                          scannedContestResults={currentContestResults}
                        />
                      );
                    })}
                  </TallyReportColumns>
                </div>
              ))}
            </div>
          )}
        </div>
      </MainContent>
    </React.Fragment>
  );
}

export function LiveReportsScreen(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getSystemSettingsQuery = getSystemSettings.useQuery(electionId);

  useTitle(routes.election(electionId).reports.root.title);

  if (!getSystemSettingsQuery.isSuccess) {
    return null;
  }

  const systemSettings = getSystemSettingsQuery.data;
  if (!systemSettings.quickResultsReportingUrl) {
    return (
      <ElectionNavScreen electionId={electionId}>
        <Header>
          <H1>Live Reports</H1>
        </Header>
        <MainContent>
          This election does not have live reports enabled.
        </MainContent>
      </ElectionNavScreen>
    );
  }

  return (
    <ElectionNavScreen electionId={electionId}>
      <Switch>
        <Route
          path={`${
            routes
              .election(':electionId')
              .reports.byPrecinctResults(':precinctId').path
          }`}
        >
          <LiveReportsResultsScreen electionId={electionId} />
        </Route>
        <Route
          path={`${
            routes.election(':electionId').reports.allPrecinctResults.path
          }`}
        >
          <LiveReportsResultsScreen electionId={electionId} />
        </Route>
        <Route path={routes.election(':electionId').reports.root.path}>
          <LiveReportsSummaryScreen electionId={electionId} />
        </Route>
      </Switch>
    </ElectionNavScreen>
  );
}
