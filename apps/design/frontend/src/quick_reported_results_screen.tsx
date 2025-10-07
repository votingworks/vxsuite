import {
  Button,
  ContestResultsTable,
  H1,
  H2,
  LoadingAnimation,
  MainContent,
  Modal,
  P,
  Table,
  TD,
  TH,
  TallyReportColumns,
  LabeledValue,
  LinkButton,
  Breadcrumbs,
  ReportTitle,
  ReportSubtitle,
  ReportElectionInfo,
  ReportMetadata,
  TallyReportCardCounts,
  Icons,
} from '@votingworks/ui';
import { useParams, Switch, Route, Redirect } from 'react-router-dom';
import React, { useState } from 'react';
import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  formatBallotHash,
  PollsState,
  PrecinctSelection,
} from '@votingworks/types';
import {
  getContestsForPrecinctAndElection,
  getPollsStateName,
  getPrecinctSelectionName,
  groupContestsByParty,
} from '@votingworks/utils';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, routes } from './routes';
import {
  deleteQuickReportingResults,
  getQuickReportedResults,
  getQuickReportedPollsStatus,
  getSystemSettings,
} from './api';
import { useTitle } from './hooks/use_title';

interface PollsStatusTabProps {
  electionId: string;
  setIsDeleteDataModalOpen: (open: boolean) => void;
}

function getPollsStateColor(pollsState: PollsState) {
  switch (pollsState) {
    case 'polls_open':
      return 'Green';
    case 'polls_closed_final':
    case 'polls_closed_initial':
      return 'Red';
    case 'polls_paused':
      return 'Yellow';
    default:
      throwIllegalValue(pollsState);
  }
}

function getPollsStatusText(
  pollsOpenCount: number,
  pollsPausedCount: number,
  pollsClosedCount: number
): JSX.Element | string {
  const totalCount = pollsOpenCount + pollsPausedCount + pollsClosedCount;
  if (pollsClosedCount > 0) {
    return (
      <span>
        {`${pollsClosedCount} / ${totalCount} Closed `}
        {pollsClosedCount >= totalCount && <Icons.Done color="success" />}
      </span>
    );
  }
  if (pollsPausedCount > 0) {
    return `${pollsPausedCount} / ${totalCount} Paused `;
  }
  if (pollsOpenCount > 0) {
    return `${pollsOpenCount} Open `;
  }
  return '-';
}

function ViewResultsSummaryScreen({
  electionId,
  setIsDeleteDataModalOpen,
}: PollsStatusTabProps): JSX.Element {
  const isLive = false;
  const getQuickReportedPollsStatusQuery = getQuickReportedPollsStatus.useQuery(
    electionId,
    { kind: 'AllPrecincts' }, // For polls status, we show all precincts
    isLive
  );
  console.log('isimmary');

  if (!getQuickReportedPollsStatusQuery.isSuccess) {
    return <LoadingAnimation />;
  }

  if (getQuickReportedPollsStatusQuery.data.isErr()) {
    return <P>Error loading polls status data.</P>;
  }

  const pollsStatusData = getQuickReportedPollsStatusQuery.data.ok();

  // Create machine status data from polls status response
  function getMachineStatusData() {
    const machineStatuses = [];

    // Add existing machines from pollsStatusData with status based on whether they're reporting
    for (const machineInfo of pollsStatusData.machines) {
      // Get precinct name from election data or use default
      const precinctName = getPrecinctSelectionName(
        pollsStatusData.election.precincts,
        machineInfo.precinctSelection
      );

      machineStatuses.push({
        precinctName,
        machineId: machineInfo.machineId,
        pollsStatus: getPollsStateName(machineInfo.pollsState),
        statusColor: getPollsStateColor(machineInfo.pollsState),
        timestamp: machineInfo.signedTimestamp,
      });
    }

    return machineStatuses;
  }
  const precinctPollsStateCounts: Record<
    string,
    Record<PollsState, number>
  > = {};

  for (const machineInfo of pollsStatusData.machines) {
    let precinctId: string;
    if (machineInfo.precinctSelection.kind === 'SinglePrecinct') {
      precinctId = machineInfo.precinctSelection.precinctId;
    } else {
      precinctId = '';
    }
    const { pollsState } = machineInfo;
    if (!precinctPollsStateCounts[precinctId]) {
      // eslint-disable-next-line vx/gts-object-literal-types
      precinctPollsStateCounts[precinctId] = {} as Record<PollsState, number>;
    }
    precinctPollsStateCounts[precinctId][pollsState] =
      (precinctPollsStateCounts[precinctId][pollsState] || 0) + 1;
  }

  const hasAllPrecinctData = pollsStatusData.machines.find(
    (m) => m.precinctSelection.kind === 'AllPrecincts'
  );
  const machineStatusData = getMachineStatusData();

  return (
    <div>
      {machineStatusData.length > 0 && (
        <div>
          <LinkButton
            variant="primary"
            to={routes.election(electionId).results.allPrecinctResults.path}
          >
            View All Results
          </LinkButton>{' '}
          <Button color="danger" onPress={() => setIsDeleteDataModalOpen(true)}>
            Delete All {isLive ? 'Live' : 'Test'} Data
          </Button>
          <H2>Machines Reporting by Precinct</H2>
          <Table>
            <thead>
              <tr>
                <TH>Precinct Name</TH>
                <TH>Scanner Status</TH>
                <TH>Results</TH>
              </tr>
            </thead>
            <tbody>
              {pollsStatusData.election.precincts.map((precinct) => {
                const pollsOpenCount =
                  precinctPollsStateCounts[precinct.id]?.['polls_open'] || 0;
                const pollsPausedCount =
                  precinctPollsStateCounts[precinct.id]?.['polls_paused'] || 0;
                const pollsClosedCount =
                  precinctPollsStateCounts[precinct.id]?.[
                    'polls_closed_final'
                  ] || 0;
                const totalCount =
                  pollsOpenCount + pollsPausedCount + pollsClosedCount;
                const allPollsClosed =
                  totalCount === pollsClosedCount && totalCount > 0;

                return (
                  <tr key={precinct.id} style={{ height: '50px' }}>
                    <TD>{precinct.name}</TD>
                    <TD>
                      {getPollsStatusText(
                        pollsOpenCount,
                        pollsPausedCount,
                        pollsClosedCount
                      )}
                    </TD>
                    <TD>
                      {pollsClosedCount > 0 && (
                        <LinkButton
                          to={
                            routes
                              .election(electionId)
                              .results.byPrecinctResults(precinct.id).path
                          }
                        >
                          View {allPollsClosed ? '' : 'Partial'} Results
                        </LinkButton>
                      )}
                    </TD>
                  </tr>
                );
              })}
              {hasAllPrecinctData && (
                <tr style={{ height: '50px' }} key="all-precincts">
                  <TD>Precinct Not Specified</TD>
                  <TD>
                    {getPollsStatusText(
                      precinctPollsStateCounts[''].polls_open || 0,
                      precinctPollsStateCounts[''].polls_paused || 0,
                      precinctPollsStateCounts[''].polls_closed_final || 0
                    )}
                  </TD>
                  <TD />
                </tr>
              )}
            </tbody>
          </Table>
          <div style={{ padding: '2rem 0' }} />
        </div>
      )}

      {machineStatusData.length === 0 && (
        <p>No machines have reported status yet.</p>
      )}
    </div>
  );
}

interface ResultsTabProps {
  electionId: string;
  isLive: boolean;
}

function ViewPrecinctResultsScreen({
  electionId,
  isLive,
}: ResultsTabProps): JSX.Element {
  const { precinctId } = useParams<{ precinctId: string }>();
  const precinctSelection: PrecinctSelection = precinctId
    ? { kind: 'SinglePrecinct', precinctId }
    : { kind: 'AllPrecincts' };
  const getQuickReportedResultsQuery = getQuickReportedResults.useQuery(
    electionId,
    precinctSelection,
    isLive
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
        configure VxScan to report results.
      </P>
    );
  }

  const aggregatedResults = getQuickReportedResultsQuery.data.ok();
  const contests = getContestsForPrecinctAndElection(
    aggregatedResults.election,
    precinctSelection
  );
  const [contestsByParty, nonPartisanContests] = groupContestsByParty(contests);
  const partiesById = Object.fromEntries(
    aggregatedResults.election.parties.map((p) => [p.id, p])
  );
  const testLivePrefix = isLive ? '' : ' Test ';

  const reportTitle =
    precinctSelection.kind === 'AllPrecincts'
      ? `Unofficial ${testLivePrefix}Tally Report`
      : `Unofficial ${testLivePrefix} ${getPrecinctSelectionName(
          aggregatedResults.election.precincts,
          precinctSelection
        )} Tally Report`;

  return (
    <React.Fragment>
      <Header>
        <Breadcrumbs
          currentTitle={reportTitle}
          parentRoutes={[routes.election(electionId).results.root]}
        />
        <H1>{reportTitle}</H1>
      </Header>
      <MainContent>
        <div style={{ marginTop: '-1rem' }}>
          {aggregatedResults.machinesReporting.length === 0 && (
            <p>No results reported.</p>
          )}
          <ReportElectionInfo election={aggregatedResults.election} />
          <ReportMetadata>
            <LabeledValue
              label="Election ID"
              value={formatBallotHash(aggregatedResults.ballotHash)}
            />
          </ReportMetadata>
          {aggregatedResults.machinesReporting.length > 0 && (
            <div>
              {Object.keys(contestsByParty).map((partyId) => (
                <div key={`partyResults-${partyId}`}>
                  <h2>{partiesById[partyId].fullName}</h2>
                  <TallyReportColumns>
                    <TallyReportCardCounts
                      cardCounts={{
                        bmd: 0,
                        hmpb: [3],
                      }}
                    />
                    {contestsByParty[partyId].map((contest) => {
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
              {Object.keys(contestsByParty).length > 0 &&
                nonPartisanContests.length > 0 && (
                  <h2> Nonpartisan Contests</h2>
                )}
              <TallyReportColumns>
                <TallyReportCardCounts
                  cardCounts={{
                    bmd: 0,
                    hmpb: [3],
                  }}
                />
                {nonPartisanContests.map((contest) => {
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
          )}
        </div>
      </MainContent>
    </React.Fragment>
  );
}

export function QuickReportedResultsScreen(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getSystemSettingsQuery = getSystemSettings.useQuery(electionId);
  const [isDeleteDataModalOpen, setIsDeleteDataModalOpen] = useState(false);
  const isLive = false;
  const deleteQuickReportingResultsMutation =
    deleteQuickReportingResults.useMutation();

  useTitle(routes.election(electionId).systemSettings.title);

  if (!getSystemSettingsQuery.isSuccess) {
    return null;
  }

  async function deleteData(): Promise<void> {
    await deleteQuickReportingResultsMutation.mutateAsync({
      electionId,
      isLive: false,
    });
    setIsDeleteDataModalOpen(false);
  }

  const systemSettings = getSystemSettingsQuery.data;
  if (!systemSettings.quickResultsReportingUrl) {
    return (
      <ElectionNavScreen electionId={electionId}>
        <Header>
          <H1>Results</H1>
        </Header>
        <MainContent>
          This election does not have Quick Results Reporting enabled.
        </MainContent>
      </ElectionNavScreen>
    );
  }

  return (
    <ElectionNavScreen electionId={electionId}>
      <Switch>
        <Route
          path={
            routes
              .election(':electionId')
              .results.byPrecinctResults(':precinctId').path
          }
        >
          <ViewPrecinctResultsScreen electionId={electionId} isLive={isLive} />
        </Route>
        <Route
          path={routes.election(':electionId').results.allPrecinctResults.path}
        >
          <ViewPrecinctResultsScreen electionId={electionId} isLive={isLive} />
        </Route>
        <Route path={routes.election(':electionId').results.root.path}>
          {' '}
          <Header>
            <H1 style={{ paddingRight: '1rem', display: 'inline' }}>Results</H1>
          </Header>
          <MainContent>
            <ViewResultsSummaryScreen
              electionId={electionId}
              setIsDeleteDataModalOpen={setIsDeleteDataModalOpen}
            />{' '}
          </MainContent>
        </Route>
      </Switch>
      {isDeleteDataModalOpen && (
        <Modal
          content={
            deleteQuickReportingResultsMutation.isLoading ? (
              <LoadingAnimation />
            ) : (
              <React.Fragment>
                <H2 as="h1">Delete All {isLive ? 'Live' : 'Test'} Data</H2>
                <P>
                  This will delete all quick reported results data for this
                  election in {isLive ? 'live' : 'test'} mode.
                </P>
              </React.Fragment>
            )
          }
          actions={
            <React.Fragment>
              <Button
                onPress={deleteData}
                variant="danger"
                disabled={deleteQuickReportingResultsMutation.isLoading}
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
          }
          onOverlayClick={() => setIsDeleteDataModalOpen(false)}
        />
      )}
    </ElectionNavScreen>
  );
}
