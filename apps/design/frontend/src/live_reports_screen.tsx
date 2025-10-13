import {
  Button,
  ContestResultsTable,
  H1,
  H2,
  LoadingAnimation,
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
} from '@votingworks/ui';
import { useParams, Switch, Route } from 'react-router-dom';
import React, { useState, useEffect, useRef } from 'react';
import { assert } from '@votingworks/basics';
import { formatBallotHash, PrecinctSelection } from '@votingworks/types';
import {
  getContestsForPrecinctAndElection,
  getPrecinctSelectionName,
  format,
  groupContestsByParty,
  getPollsStateName,
} from '@votingworks/utils';
import { useTheme } from 'styled-components';
import type { QuickReportedPollStatus } from '@votingworks/design-backend';
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

// Animation utilities
interface AnimationState {
  [key: string]: {
    hasChanged: boolean;
    timestamp: number;
  };
}

function usePrecinctAnimations(
  precincts: ReadonlyArray<{ id: string; name: string }>,
  reportsByPrecinct: Record<string, QuickReportedPollStatus[]>,
  isLive?: boolean
) {
  const [animationStates, setAnimationStates] = useState<AnimationState>({});
  const prevDataRef = useRef<Record<string, QuickReportedPollStatus[]>>({});
  const prevIsLiveRef = useRef<boolean | undefined>(isLive);

  useEffect(() => {
    const newAnimationStates: AnimationState = {};
    // If we changed between live and test mode, treat all data as new.
    const changedLiveTestMode =
      prevIsLiveRef.current !== undefined &&
      isLive !== undefined &&
      prevIsLiveRef.current !== isLive;

    const isFirstDataLoad = prevIsLiveRef.current === undefined;

    // Reset animations if switching between live and test mode
    if (changedLiveTestMode) {
      setAnimationStates({});
      prevDataRef.current = {};
    }
    prevIsLiveRef.current = isLive;

    for (const precinct of precincts) {
      const currentReports = reportsByPrecinct[precinct.id] || [];
      const prevReports = prevDataRef.current[precinct.id] || [];

      // Check if data has changed
      const hasChanged =
        !isFirstDataLoad &&
        ((changedLiveTestMode && currentReports.length > 0) ||
          currentReports.length !== prevReports.length ||
          currentReports.some((currentReport, index) => {
            const prevReport = prevReports[index];
            return (
              !prevReport ||
              currentReport.machineId !== prevReport.machineId ||
              currentReport.pollsState !== prevReport.pollsState ||
              currentReport.signedTimestamp.getTime() !==
                prevReport.signedTimestamp.getTime()
            );
          }));

      newAnimationStates[precinct.id] = {
        hasChanged,
        timestamp: Date.now(),
      };
    }

    setAnimationStates(newAnimationStates);
    prevDataRef.current = reportsByPrecinct;

    // Clear animation flags after animation completes
    const timeout = setTimeout(() => {
      setAnimationStates((prev): AnimationState => {
        const updated: AnimationState = { ...prev };
        for (const key of Object.keys(updated)) {
          updated[key] = { ...updated[key], hasChanged: false };
        }
        return updated;
      });
    }, 1000); // Match CSS animation duration

    return () => clearTimeout(timeout);
  }, [precincts, reportsByPrecinct, isLive]);

  return animationStates;
}

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
  const getReportedPollsStatusQuery =
    getReportedPollsStatus.useQuery(electionId);

  const deleteQuickReportingResultsMutation =
    deleteQuickReportingResults.useMutation();

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
            { id: '', name: 'Precinct Not Specified', splits: [] },
          ]
        : [],
    [pollsStatusData]
  );

  const reportsByPrecinct = pollsStatusData
    ? pollsStatusData.reportsByPrecinct
    : {};
  const reportsIsLive = pollsStatusData ? pollsStatusData.isLive : undefined;

  // Animation hooks (always called)
  const precinctAnimations = usePrecinctAnimations(
    precinctsWithNonSpecified,
    reportsByPrecinct,
    reportsIsLive
  );
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
          <LoadingAnimation />
        </MainContent>
      </div>
    );
  }

  if (getReportedPollsStatusQuery.data.isErr()) {
    const err = getReportedPollsStatusQuery.data.err();
    assert(err === 'election-not-exported');
    return (
      <div>
        <Header>
          <H1 style={{ paddingRight: '1rem', display: 'inline' }}>
            Live Reports
          </H1>
        </Header>
        <MainContent>
          <Callout color="warning" icon="Warning">
            This election has not yet been exported. Please export the election
            and configure VxScan to enable live reports.
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
                      labelPosition="bottom"
                      label={
                        <span style={{ fontSize: '1rem' }}>
                          No reports sent
                        </span>
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
                      labelPosition="bottom"
                      label={
                        <span style={{ fontSize: '1rem' }}>Polls open</span>
                      }
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
                      labelPosition="bottom"
                      label={
                        <span style={{ fontSize: '1rem' }}>Polls closing</span>
                      }
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
                      labelPosition="bottom"
                      label={
                        <span style={{ fontSize: '1rem' }}>Polls closed</span>
                      }
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
                    Delete All Data
                  </Button>
                </div>
              </div>
            </Card>
            <Table>
              <thead>
                <tr>
                  <TH style={{ minWidth: '200px' }}>Precinct</TH>
                  <TH style={{ width: '180px' }}>Scanner Status</TH>
                  <TH style={{ minWidth: '400px' }}>Last Report Sent</TH>
                  <TH style={{ width: '200px' }} />
                </tr>
              </thead>
              <tbody>
                {precinctsWithNonSpecified.map((precinct) => {
                  // Only show the "Precinct Not Specified" row if there is data for it
                  const reportsForPrecinct =
                    pollsStatusData.reportsByPrecinct[precinct.id] || [];

                  if (precinct.id === '' && reportsForPrecinct.length === 0) {
                    return null;
                  }

                  const pollsOpenCount = reportsForPrecinct.filter(
                    (entry) => entry.pollsState === 'polls_open'
                  ).length;
                  const pollsClosedCount = reportsForPrecinct.filter(
                    (entry) => entry.pollsState === 'polls_closed_final'
                  ).length;

                  const animation = precinctAnimations[precinct.id];

                  const isHighlighted = animation && animation.hasChanged;

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
          <Callout color="warning" icon="Warning">
            No machines have reported status yet.
          </Callout>
        )}
      </MainContent>
      {isDeleteDataModalOpen && (
        <Modal
          content={
            deleteQuickReportingResultsMutation.isLoading ? (
              <LoadingAnimation />
            ) : (
              <React.Fragment>
                <H2 as="h1">Delete All Data</H2>
                <P>
                  This will delete all quick reported results data for this
                  election in both test and live mode.
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
                  Delete Data
                </Button>
                <Button
                  onPress={() => setIsDeleteDataModalOpen(false)}
                  variant="secondary"
                >
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
    return <LoadingAnimation />;
  }

  if (getQuickReportedResultsQuery.data.isErr()) {
    const err = getQuickReportedResultsQuery.data.err();
    assert(err === 'election-not-exported');
    return (
      <P>
        This election has not yet been exported. Please export the election and
        configure VxScan to enable live reports.
      </P>
    );
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

  useTitle(routes.election(electionId).systemSettings.title);

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
