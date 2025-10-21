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
  GetLiveReportError,
  QuickReportedPollStatus,
} from '@votingworks/design-backend';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, routes } from './routes';
import {
  deleteQuickReportingResults,
  getQuickReportedResults,
  getReportedPollsStatus,
  getSystemSettings,
} from './api';
import { useTitle } from './hooks/use_title';
import { Row } from './layout';
import { ALL_PRECINCTS_REPORT_KEY, useSound } from './utils';

const PollsStatusLabel = styled.span`
  font-size: 1rem;
`;

function getPollsStatusText(
  pollsOpenCount: number,
  pollsClosedCount: number
): JSX.Element | string {
  const totalCount = pollsOpenCount + pollsClosedCount;

  if (totalCount === 0) {
    return (
      <span>
        <Icons.Warning color="warning" /> No reports sent
      </span>
    );
  }
  if (pollsClosedCount === 0) {
    return (
      <span>
        <Icons.Circle color="success" /> {pollsOpenCount} open
      </span>
    );
  }
  const icon =
    pollsClosedCount === totalCount ? (
      <Icons.Done color="primary" />
    ) : (
      <Icons.CircleDot color="primary" />
    );
  return (
    <span>
      {icon} {pollsClosedCount}/{totalCount} closed
    </span>
  );
}

function getErrorMessage(error: GetLiveReportError): string {
  switch (error) {
    case 'election-not-exported':
    case 'no-election-found':
      return 'This election has not yet been exported. Please export the election and configure VxScan to enable live reports.';
    case 'election-out-of-date':
      return 'This election is no longer compatible with Live Reports. Please export a new election package to continue using Live Reports.';
    default:
      throwIllegalValue(error);
  }
}

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
  const getReportedPollsStatusQuery =
    getReportedPollsStatus.useQuery(electionId);

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
  const pollsStatusData = getReportedPollsStatusQuery.isSuccess
    ? getReportedPollsStatusQuery.data.isOk()
      ? getReportedPollsStatusQuery.data.ok()
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
  useQueryChangeListener(getReportedPollsStatusQuery, {
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
        playSound();
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

  if (!getReportedPollsStatusQuery.isSuccess) {
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

  if (getReportedPollsStatusQuery.data.isErr()) {
    const errorMessage = getErrorMessage(
      getReportedPollsStatusQuery.data.err()
    );
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
    <div>
      <Header>
        <Row style={{ alignItems: 'center', gap: '1rem' }}>
          <H1 style={{ paddingRight: '1rem', display: 'inline' }}>
            Live Reports
          </H1>
          {allEntries.length > 0 && !pollsStatusData.isLive && (
            <TestModeCallout themeOverride={theme} />
          )}
        </Row>
      </Header>
      <MainContent>
        {allEntries.length > 0 && (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <Card color="neutral">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <H3>Precinct Status</H3>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      flex: 1,
                      gap: '2rem',
                    }}
                  >
                    <LabelledText
                      style={{ marginTop: '-.25rem' }}
                      labelPosition="bottom"
                      label={
                        <PollsStatusLabel>No reports sent</PollsStatusLabel>
                      }
                    >
                      <H1 data-testid="no-reports-sent-count">
                        <Icons.Warning color="warning" />{' '}
                        {
                          Object.values(
                            pollsStatusData.reportsByPrecinct
                          ).filter((entries) => entries.length === 0).length
                        }
                      </H1>
                    </LabelledText>
                    <LabelledText
                      style={{ marginTop: '-.25rem' }}
                      labelPosition="bottom"
                      label={<PollsStatusLabel>Polls open</PollsStatusLabel>}
                    >
                      <H1 data-testid="polls-open-count">
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
                      style={{ marginTop: '-.25rem' }}
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
                    </LabelledText>
                    <LabelledText
                      style={{ marginTop: '-.25rem' }}
                      labelPosition="bottom"
                      label={<PollsStatusLabel>Polls closed</PollsStatusLabel>}
                    >
                      <H1 data-testid="polls-closed-count">
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
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  <LinkButton
                    variant="primary"
                    disabled={
                      allEntries.filter(
                        (entry) => entry.pollsState === 'polls_closed_final'
                      ).length === 0
                    }
                    to={`${
                      routes.election(electionId).reports.allPrecinctResults
                        .path
                    }`}
                  >
                    View Full Election Tally Report
                  </LinkButton>
                  <Button
                    color="danger"
                    icon="Delete"
                    onPress={() => setIsDeleteDataModalOpen(true)}
                  >
                    Delete All Reports
                  </Button>
                </div>
              </div>
            </Card>
            <Table>
              <thead>
                <tr>
                  <TH style={{ minWidth: '200px' }}>Precinct</TH>
                  <TH style={{ minWidth: '180px' }}>Scanner Status</TH>
                  <TH style={{ minWidth: '250px' }}>Last Report Sent</TH>
                  <TH style={{ minWidth: '200px' }} />
                </tr>
              </thead>
              <tbody>
                {precinctsWithNonSpecified.map((precinct) => {
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
                        backgroundColor: isHighlighted
                          ? theme.colors.inversePrimary
                          : 'transparent',
                      }}
                    >
                      <TD>{precinct.name}</TD>
                      <TD>
                        {getPollsStatusText(pollsOpenCount, pollsClosedCount)}
                      </TD>
                      <TD>
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
                })}
              </tbody>
            </Table>
            <div style={{ padding: '2rem 0' }} />
          </div>
        )}

        {allEntries.length === 0 && (
          <Callout color="neutral" icon="Info">
            No machines have sent reports yet.
          </Callout>
        )}
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
    </div>
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
  const getQuickReportedResultsQuery = getQuickReportedResults.useQuery(
    electionId,
    precinctSelection
  );

  if (!getQuickReportedResultsQuery.isSuccess) {
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

  if (getQuickReportedResultsQuery.data.isErr()) {
    const errorMessage = getErrorMessage(
      getQuickReportedResultsQuery.data.err()
    );
    return <P>{errorMessage}</P>;
  }

  const aggregatedResults = getQuickReportedResultsQuery.data.ok();
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
