import {
  Button,
  ContestResultsTable,
  H1,
  H2,
  MainContent,
  Modal,
  P,
  RouterTabBar,
  TallyReportColumns,
  Table,
  TD,
  TH,
  Icons,
  LabelledText,
  H3,
  Caption,
  LinkButton,
  LabeledValue,
  Breadcrumbs,
  ReportElectionInfo,
  ReportMetadata,
  Callout,
  SearchSelect,
  TestModeBanner,
  TestModeReportBanner,
  useQueryChangeListener,
} from '@votingworks/ui';
import { useParams, Switch, Route, useHistory } from 'react-router-dom';
import React, { useState } from 'react';
import { assert, deepEqual, throwIllegalValue } from '@votingworks/basics';
import {
  formatBallotHash,
  PollingPlace,
  PollingPlaceType,
  pollingPlaceTypeName,
  PollsTransitionType,
  PrecinctSelection,
} from '@votingworks/types';
import {
  format,
  getContestsForPrecinctAndElection,
  groupContestsByParty,
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
  getLiveReportsActivityLog,
  getLiveResultsReports,
  getLiveReportsSummary,
  getStateFeatures,
  getSystemSettings,
} from './api';
import { useTitle } from './hooks/use_title';
import { Row } from './layout';
import { useSound } from './utils';

// --- Status types and helpers ---

type PollingPlaceOverallStatus = 'no_reports' | 'open' | 'paused' | 'closed';

const POLLS_OPEN_TRANSITIONS: readonly PollsTransitionType[] = [
  'open_polls',
  'resume_voting',
];

/* PollingPlaceType's ordered by typical voting timeline, for display in the overview screen. */
const VOTING_GROUPS: readonly PollingPlaceType[] = [
  'early_voting',
  'election_day',
  'absentee',
];

function getPollingPlaceOverallStatus(
  reports: QuickReportedPollStatus[]
): PollingPlaceOverallStatus {
  if (reports.length === 0) return 'no_reports';
  if (reports.every((r) => r.pollsTransitionType === 'close_polls')) {
    return 'closed';
  }
  if (reports.every((r) => r.pollsTransitionType === 'pause_voting')) {
    return 'paused';
  }
  return 'open';
}

function getOverallStatusIcon(
  status: PollingPlaceOverallStatus
): JSX.Element | null {
  switch (status) {
    case 'no_reports':
      return <Icons.Warning color="warning" />;
    case 'open':
      return <Icons.Circle color="success" />;
    case 'paused':
      return <Icons.Paused />;
    case 'closed':
      return <Icons.Done color="primary" />;
    /* istanbul ignore next - @preserve */
    default:
      throwIllegalValue(status);
  }
}

function getOverallStatusLabel(status: PollingPlaceOverallStatus): string {
  switch (status) {
    case 'no_reports':
      return 'No reports sent';
    case 'open':
      return 'Polls open';
    case 'paused':
      return 'Polls paused';
    case 'closed':
      return 'Voting complete';
    /* istanbul ignore next - @preserve */
    default:
      throwIllegalValue(status);
  }
}

function getScannerDetailsText(
  reports: QuickReportedPollStatus[]
): JSX.Element | null {
  if (reports.length === 0) return null;

  const closedCount = reports.filter(
    (r) => r.pollsTransitionType === 'close_polls'
  ).length;
  const pausedCount = reports.filter(
    (r) => r.pollsTransitionType === 'pause_voting'
  ).length;
  const openCount = reports.filter((r) =>
    POLLS_OPEN_TRANSITIONS.includes(r.pollsTransitionType)
  ).length;

  if (closedCount > 0) {
    return (
      <span>
        {closedCount}/{reports.length} complete
      </span>
    );
  }
  if (pausedCount > 0) {
    return (
      <span>
        {pausedCount}/{reports.length} paused
      </span>
    );
  }
  return (
    <span>
      {openCount}/{reports.length} open
    </span>
  );
}

function getLiveReportTransitionName(
  transitionType: PollsTransitionType
): string {
  switch (transitionType) {
    case 'open_polls':
      return 'Open';
    case 'resume_voting':
      return 'Resumed';
    case 'pause_voting':
      return 'Paused';
    case 'close_polls':
      return 'Closed';
    /* istanbul ignore next - @preserve */
    default:
      throwIllegalValue(transitionType);
  }
}

function getErrorMessage(error: GetExportedElectionError): string {
  switch (error) {
    case 'no-election-export-found':
      return 'This election has not yet been exported. Please export the election and configure VxScan to enable live reports.';
    case 'election-out-of-date':
      return 'This election is no longer compatible with Live Reports. Please export a new election package to continue using Live Reports.';
    /* istanbul ignore next - @preserve */
    default:
      throwIllegalValue(error);
  }
}

interface StatusCounts {
  no_reports: number;
  open: number;
  paused: number;
  closed: number;
}

function computeStatusCounts(
  places: readonly PollingPlace[],
  reportsByPollingPlace: Record<string, QuickReportedPollStatus[]>
): StatusCounts {
  const counts: StatusCounts = {
    no_reports: 0,
    open: 0,
    paused: 0,
    closed: 0,
  };
  for (const place of places) {
    const reports = reportsByPollingPlace[place.id] || [];
    const status = getPollingPlaceOverallStatus(reports);
    counts[status] += 1;
  }
  return counts;
}

// --- Styled components ---

const PollsStatusLabel = styled.span`
  font-size: 1rem;
`;

const ContentLayout = styled.div`
  display: flex;
  gap: 1rem;
  min-height: 0;
  flex: 1;
  margin-top: 1rem;
`;

const MainColumn = styled.div`
  flex: 2;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow: hidden;
  height: 100%;
`;

const ScrollableTableContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  min-height: 0;
`;

const StatusTable = styled(Table)`
  td {
    padding: 0.5rem;
  }
`;

const Panel = styled.div`
  border: ${(p) =>
    `${p.theme.sizes.bordersRem.thin}rem solid ${p.theme.colors.outline}`};
  border-radius: 0.5rem;
  overflow: hidden;
`;

const PanelHeader = styled.div`
  background-color: ${(p) => p.theme.colors.containerLow};
  border-bottom: ${(p) =>
    `${p.theme.sizes.bordersRem.thin}rem solid ${p.theme.colors.outline}`};
  padding: 0.75rem 0.5rem 0.5rem 0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
`;

const PanelBody = styled.div`
  background-color: ${(p) => p.theme.colors.background};
`;

const ActivityColumn = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const ActivityScroll = styled(PanelBody)`
  overflow-y: auto;
  flex: 1;
`;

const ActivityEntry = styled.div`
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

const ProgressBar = styled.div`
  display: flex;
  height: 0.5rem;
  border-radius: 0.25rem;
  overflow: hidden;
  margin-top: 1rem;
  margin-bottom: 0.25rem;
  background: ${(p) => p.theme.colors.containerLow};
`;

const ProgressSegment = styled.div<{ color: string; widthPercent: number }>`
  width: ${(p) => p.widthPercent}%;
  background: ${(p) => p.color};
  transition: width 0.3s ease;
`;

interface SummaryStatsGridProps {
  statusCounts: StatusCounts;
  totalPlaces: number;
  isAbsentee: boolean;
  segmentKey: string;
}

function SummaryStatsGrid({
  statusCounts,
  totalPlaces,
  isAbsentee,
  segmentKey,
}: SummaryStatsGridProps): JSX.Element {
  const theme = useTheme();
  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '2rem',
          marginBottom: '0.75rem',
        }}
      >
        <LabelledText
          style={{ marginTop: '-.25rem' }}
          labelPosition="bottom"
          label={<PollsStatusLabel>No reports sent</PollsStatusLabel>}
        >
          <H1 data-testid="no-reports-sent-count">
            <Icons.Warning color="warning" /> {statusCounts.no_reports}
          </H1>
        </LabelledText>
        {!isAbsentee && (
          <LabelledText
            style={{ marginTop: '-.25rem' }}
            labelPosition="bottom"
            label={<PollsStatusLabel>Polls open</PollsStatusLabel>}
          >
            <H1 data-testid="polls-open-count">
              <Icons.Circle color="success" /> {statusCounts.open}
            </H1>
          </LabelledText>
        )}
        {!isAbsentee && (
          <LabelledText
            style={{ marginTop: '-.25rem' }}
            labelPosition="bottom"
            label={<PollsStatusLabel>Polls paused</PollsStatusLabel>}
          >
            <H1 data-testid="polls-paused-count">
              <Icons.Paused /> {statusCounts.paused}
            </H1>
          </LabelledText>
        )}
        <LabelledText
          style={{
            marginTop: '-.25rem',
            gridColumn: isAbsentee ? 2 : undefined,
          }}
          labelPosition="bottom"
          label={<PollsStatusLabel>Voting complete</PollsStatusLabel>}
        >
          <H1 data-testid="polls-closed-count">
            <Icons.Done color="primary" /> {statusCounts.closed}
          </H1>
        </LabelledText>
      </div>
      {totalPlaces > 0 && (
        <ProgressBar key={segmentKey}>
          {!isAbsentee && (
            <ProgressSegment
              color={theme.colors.successAccent}
              widthPercent={(statusCounts.open / totalPlaces) * 100}
            />
          )}
          {!isAbsentee && (
            <ProgressSegment
              color={theme.colors.onBackgroundMuted}
              widthPercent={(statusCounts.paused / totalPlaces) * 100}
            />
          )}
          <ProgressSegment
            color={theme.colors.primary}
            widthPercent={(statusCounts.closed / totalPlaces) * 100}
          />
        </ProgressBar>
      )}
    </div>
  );
}

interface ActivityLogPanelProps {
  electionId: string;
  /** When undefined, the panel shows activity for all groups. */
  votingGroup?: PollingPlaceType;
  pollingPlaces: readonly PollingPlace[];
}

function ActivityLogPanel({
  electionId,
  votingGroup,
  pollingPlaces,
}: ActivityLogPanelProps): JSX.Element {
  const activityLogQuery = getLiveReportsActivityLog.useQuery(
    electionId,
    votingGroup
  );
  const activityLogResult = activityLogQuery.data?.isOk()
    ? activityLogQuery.data.ok()
    : undefined;
  const isLoading =
    !activityLogQuery.isSuccess || !activityLogQuery.data.isOk();
  const activityEntries = (activityLogResult?.activityLog ?? []).map(
    (entry) => {
      const place = pollingPlaces.find((p) => p.id === entry.pollingPlaceId);
      return { ...entry, placeName: place?.name ?? entry.pollingPlaceId };
    }
  );

  return (
    <Panel
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <PanelHeader>
        <Row style={{ alignItems: 'center', gap: '0.5rem' }}>
          <H3 style={{ margin: 0 }}>Activity</H3>
          {isLoading && <Icons.Loading />}
        </Row>
      </PanelHeader>
      <ActivityScroll>
        {!isLoading && activityEntries.length === 0 && (
          <ActivityEntry>
            <div>No activity yet</div>
          </ActivityEntry>
        )}
        {activityEntries.map((entry) => (
          <ActivityEntry
            key={`${entry.machineId}-${entry.signedTimestamp.getTime()}`}
          >
            <div>
              {entry.machineId}: Polls{' '}
              {getLiveReportTransitionName(entry.pollsTransitionType)}
            </div>
            <div>{entry.placeName}</div>
            <Caption>
              {format.localeShortDateAndTime(entry.signedTimestamp)}
            </Caption>
          </ActivityEntry>
        ))}
      </ActivityScroll>
    </Panel>
  );
}

interface DeleteReportsModalProps {
  electionId: string;
  isOpen: boolean;
  onClose: () => void;
}

function DeleteReportsModal({
  electionId,
  isOpen,
  onClose,
}: DeleteReportsModalProps): JSX.Element | null {
  const deleteMutation = deleteQuickReportingResults.useMutation();

  if (!isOpen) return null;

  async function deleteData(): Promise<void> {
    try {
      await deleteMutation.mutateAsync({ electionId });
    } catch {
      // Even if there's an error, continue to close modal
    } finally {
      onClose();
    }
  }

  return (
    <Modal
      content={
        /* istanbul ignore next - @preserve - mutation loading state is transient */
        deleteMutation.isLoading ? (
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
        /* istanbul ignore next - @preserve - mutation loading state is transient */
        deleteMutation.isLoading ? (
          <Button onPress={onClose} variant="secondary">
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
            <Button onPress={onClose}>Cancel</Button>
          </React.Fragment>
        )
      }
      onOverlayClick={
        /* istanbul ignore next - @preserve - mutation loading state is transient */
        deleteMutation.isLoading ? undefined : onClose
      }
    />
  );
}

// --- Animation hook ---

function useDataChangeAnimation(
  query: ReturnType<typeof getLiveReportsSummary.useQuery>
): {
  pollingPlaceIdsToAnimate: string[];
} {
  const [pollingPlaceIdsToAnimate, setPollingPlaceIdsToAnimate] = useState<
    string[]
  >([]);

  function setPlacesToAnimate(placeIds: string[]): void {
    setPollingPlaceIdsToAnimate(placeIds);
    /* istanbul ignore next - @preserve - timer cleanup runs after test completes */
    setTimeout(() => {
      setPollingPlaceIdsToAnimate((prev) =>
        prev.filter((id) => !placeIds.includes(id))
      );
    }, 1000);
  }

  const playSound = useSound('happy-ping');
  useQueryChangeListener(query, {
    select: (result) => ({
      reportsByPollingPlace: result.ok()?.reportsByPollingPlace,
      isLive: result.ok()?.isLive,
    }),
    onChange: (newData, oldData) => {
      if (!oldData) return;
      const { reportsByPollingPlace: newReportsByPlace, isLive: newIsLive } =
        newData;
      const { reportsByPollingPlace: oldReportsByPlace, isLive: oldIsLive } =
        oldData;
      /* istanbul ignore if - @preserve - defensive guard */
      if (!newReportsByPlace) return;
      const switchedLive = newIsLive && !oldIsLive;
      const changedPlaces = Object.entries(newReportsByPlace)
        .filter(([placeId, newReports]) => {
          const oldReports =
            switchedLive || !oldReportsByPlace
              ? []
              : oldReportsByPlace[placeId];
          return !deepEqual(oldReports, newReports);
        })
        .map(([placeId]) => placeId);
      const hasNewData = Object.values(newReportsByPlace).some(
        (reports) => reports.length > 0
      );
      setPlacesToAnimate(changedPlaces);
      if (changedPlaces.length > 0 && hasNewData) {
        playSound();
      }
    },
  });

  return { pollingPlaceIdsToAnimate };
}

function LoadingScreen(): JSX.Element {
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

function ErrorScreen({
  error,
}: {
  error: GetExportedElectionError;
}): JSX.Element {
  return (
    <div>
      <Header>
        <H1 style={{ paddingRight: '1rem', display: 'inline' }}>
          Live Reports
        </H1>
      </Header>
      <MainContent>
        <Callout color="warning" icon="Warning">
          {getErrorMessage(error)}
        </Callout>
      </MainContent>
    </div>
  );
}

/**
 * Tab bar that navigates between the All overview and per-voting-group pages.
 * Only renders tabs for groups that have at least one polling place. Hides
 * itself entirely if only the All tab would be shown.
 */
function LiveReportsTabBar({
  electionId,
  pollingPlaces,
}: {
  electionId: string;
  pollingPlaces: readonly PollingPlace[];
}): JSX.Element | null {
  const groupsWithPlaces = VOTING_GROUPS.filter((group) =>
    pollingPlaces.some((p) => p.type === group)
  );
  if (groupsWithPlaces.length < 2) return null;
  const tabs = [
    {
      title: 'All Voting Groups',
      path: routes.election(electionId).reports.root.path,
    },
    ...groupsWithPlaces.map((group) => ({
      title: pollingPlaceTypeName(group),
      path: routes.election(electionId).reports.votingGroup(group).path,
    })),
  ];
  return <RouterTabBar tabs={tabs} />;
}

interface LiveReportsOverviewScreenProps {
  electionId: string;
}

function LiveReportsOverviewScreen({
  electionId,
}: LiveReportsOverviewScreenProps): JSX.Element {
  const [isDeleteDataModalOpen, setIsDeleteDataModalOpen] = useState(false);
  const summaryQuery = getLiveReportsSummary.useQuery(electionId);
  const stateFeaturesQuery = getStateFeatures.useQuery(electionId);

  const canDeleteReports =
    stateFeaturesQuery.data?.DELETE_LIVE_REPORTS === true;

  useDataChangeAnimation(summaryQuery);

  const pollsStatusData = summaryQuery.isSuccess
    ? summaryQuery.data.isOk()
      ? summaryQuery.data.ok()
      : null
    : null;

  if (!summaryQuery.isSuccess) {
    return <LoadingScreen />;
  }

  if (summaryQuery.data.isErr()) {
    return <ErrorScreen error={summaryQuery.data.err()} />;
  }

  assert(pollsStatusData !== null);

  const pollingPlaces: readonly PollingPlace[] =
    pollsStatusData.election.pollingPlaces ?? [];

  const allEntries = Object.values(
    pollsStatusData.reportsByPollingPlace
  ).flat();

  const groupsWithPlaces = VOTING_GROUPS.filter((group) =>
    pollingPlaces.some((p) => p.type === group)
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      <Header>
        <Row style={{ alignItems: 'center', gap: '1rem' }}>
          <H1 style={{ paddingRight: '1rem', display: 'inline' }}>
            Live Reports
          </H1>
        </Row>
      </Header>
      {allEntries.length > 0 && !pollsStatusData.isLive && <TestModeBanner />}
      <MainContent
        style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {pollingPlaces.length === 0 && (
          <Callout color="warning" icon="Warning">
            Polling places are required to support live reports. Please
            configure polling places for this election.
          </Callout>
        )}
        {pollingPlaces.length > 0 && (
          <React.Fragment>
            <LiveReportsTabBar
              electionId={electionId}
              pollingPlaces={pollingPlaces}
            />
            <ContentLayout>
              <MainColumn style={{ overflowY: 'auto' }}>
                {groupsWithPlaces.map((group) => {
                  const placesInGroup = pollingPlaces.filter(
                    (p) => p.type === group
                  );
                  const counts = computeStatusCounts(
                    placesInGroup,
                    pollsStatusData.reportsByPollingPlace
                  );
                  return (
                    <Panel key={group} data-testid={`overview-card-${group}`}>
                      <PanelHeader>
                        <H3 style={{ margin: 0 }}>
                          {pollingPlaceTypeName(group)} • Polling Place Status
                        </H3>
                      </PanelHeader>
                      <PanelBody style={{ padding: '1rem' }}>
                        <SummaryStatsGrid
                          statusCounts={counts}
                          totalPlaces={placesInGroup.length}
                          isAbsentee={group === 'absentee'}
                          segmentKey={group}
                        />
                      </PanelBody>
                    </Panel>
                  );
                })}
              </MainColumn>

              <ActivityColumn>
                {allEntries.length > 0 && (
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
                        !allEntries.some(
                          (entry) => entry.pollsTransitionType === 'close_polls'
                        )
                      }
                      to={
                        routes.election(electionId).reports.allPrecinctResults
                          .path
                      }
                    >
                      View Tally Reports
                    </LinkButton>
                    {canDeleteReports && (
                      <Button
                        color="danger"
                        icon="Delete"
                        onPress={() => setIsDeleteDataModalOpen(true)}
                      >
                        Delete All Reports
                      </Button>
                    )}
                  </div>
                )}
                <ActivityLogPanel
                  electionId={electionId}
                  pollingPlaces={pollingPlaces}
                />
              </ActivityColumn>
            </ContentLayout>
          </React.Fragment>
        )}
      </MainContent>
      <DeleteReportsModal
        electionId={electionId}
        isOpen={isDeleteDataModalOpen}
        onClose={() => setIsDeleteDataModalOpen(false)}
      />
    </div>
  );
}

interface LiveReportsGroupScreenProps {
  electionId: string;
}

function LiveReportsGroupScreen({
  electionId,
}: LiveReportsGroupScreenProps): JSX.Element {
  const { votingGroup } = useParams<{ votingGroup: PollingPlaceType }>();
  const summaryQuery = getLiveReportsSummary.useQuery(electionId);
  const theme = useTheme();
  const { pollingPlaceIdsToAnimate } = useDataChangeAnimation(summaryQuery);

  const pollsStatusData = summaryQuery.isSuccess
    ? summaryQuery.data.isOk()
      ? summaryQuery.data.ok()
      : null
    : null;

  if (!summaryQuery.isSuccess) {
    return <LoadingScreen />;
  }

  if (summaryQuery.data.isErr()) {
    return <ErrorScreen error={summaryQuery.data.err()} />;
  }

  assert(pollsStatusData !== null);

  const pollingPlaces: readonly PollingPlace[] =
    pollsStatusData.election.pollingPlaces ?? [];
  const filteredPollingPlaces = pollingPlaces.filter(
    (p) => p.type === votingGroup
  );

  const allEntries = Object.values(
    pollsStatusData.reportsByPollingPlace
  ).flat();
  const statusCounts = computeStatusCounts(
    filteredPollingPlaces,
    pollsStatusData.reportsByPollingPlace
  );
  const totalPlaces = filteredPollingPlaces.length;
  const isAbsentee = votingGroup === 'absentee';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      <Header>
        <Row style={{ alignItems: 'center', gap: '1rem' }}>
          <H1 style={{ paddingRight: '1rem', display: 'inline' }}>
            Live Reports
          </H1>
        </Row>
      </Header>
      {allEntries.length > 0 && !pollsStatusData.isLive && <TestModeBanner />}
      <MainContent
        style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        <LiveReportsTabBar
          electionId={electionId}
          pollingPlaces={pollingPlaces}
        />
        <ContentLayout>
          <MainColumn>
            <Panel>
              <PanelHeader>
                <H3 style={{ margin: 0 }}>Polling Place Status</H3>
              </PanelHeader>
              <PanelBody style={{ padding: '1rem' }}>
                <SummaryStatsGrid
                  statusCounts={statusCounts}
                  totalPlaces={totalPlaces}
                  isAbsentee={isAbsentee}
                  segmentKey={votingGroup}
                />
              </PanelBody>
            </Panel>

            <ScrollableTableContainer>
              <StatusTable>
                <thead>
                  <tr>
                    <TH style={{ minWidth: '200px' }}>Polling Place</TH>
                    <TH style={{ minWidth: '120px' }}>Status</TH>
                    <TH style={{ minWidth: '150px' }}>Machines</TH>
                  </tr>
                </thead>
                <tbody>
                  {filteredPollingPlaces.map((place) => {
                    const reportsForPlace =
                      pollsStatusData.reportsByPollingPlace[place.id] || [];
                    const overallStatus =
                      getPollingPlaceOverallStatus(reportsForPlace);
                    const isHighlighted = pollingPlaceIdsToAnimate.includes(
                      place.id
                    );
                    return (
                      <tr
                        key={place.id}
                        data-testid={`polling-place-row-${place.id}`}
                        data-highlighted={isHighlighted ? 'true' : 'false'}
                        style={{
                          height: '3rem',
                          transition: 'background-color 0.5s ease-in-out',
                          backgroundColor: isHighlighted
                            ? theme.colors.inversePrimary
                            : 'transparent',
                        }}
                      >
                        <TD>{place.name}</TD>
                        <TD>
                          <span>
                            {getOverallStatusIcon(overallStatus)}{' '}
                            {getOverallStatusLabel(overallStatus)}
                          </span>
                        </TD>
                        <TD>{getScannerDetailsText(reportsForPlace)}</TD>
                      </tr>
                    );
                  })}
                </tbody>
              </StatusTable>
            </ScrollableTableContainer>
          </MainColumn>

          <ActivityColumn>
            <ActivityLogPanel
              electionId={electionId}
              votingGroup={votingGroup}
              pollingPlaces={pollingPlaces}
            />
          </ActivityColumn>
        </ContentLayout>
      </MainContent>
    </div>
  );
}

interface ResultsTabProps {
  electionId: string;
}

const ALL_PRECINCTS_VALUE = '';

function LiveReportsResultsScreen({
  electionId,
}: ResultsTabProps): JSX.Element {
  const { precinctId } = useParams<{ precinctId: string }>();
  const history = useHistory();
  const precinctSelection: PrecinctSelection = precinctId
    ? { kind: 'SinglePrecinct', precinctId }
    : { kind: 'AllPrecincts' };
  const getLiveResultsReportsQuery = getLiveResultsReports.useQuery(
    electionId,
    precinctSelection
  );

  function handlePrecinctChange(value?: string): void {
    if (!value || value === ALL_PRECINCTS_VALUE) {
      history.push(routes.election(electionId).reports.allPrecinctResults.path);
    } else {
      history.push(
        routes.election(electionId).reports.byPrecinctResults(value).path
      );
    }
  }

  if (!getLiveResultsReportsQuery.isSuccess) {
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

  const reportTitle = `Unofficial ${testLivePrefix}Tally Report`;

  return (
    <React.Fragment>
      <Header>
        <Breadcrumbs
          currentTitle={reportTitle}
          parentRoutes={[routes.election(electionId).reports.root]}
        />
        <Row style={{ alignItems: 'center', gap: '1rem' }}>
          <H1>{reportTitle}</H1>
          <SearchSelect
            id="precinct-select"
            aria-label="Select precinct"
            options={[
              { value: ALL_PRECINCTS_VALUE, label: 'All Precincts' },
              ...aggregatedResults.election.precincts.map((precinct) => ({
                value: precinct.id,
                label: precinct.name,
              })),
            ]}
            value={precinctId ?? ALL_PRECINCTS_VALUE}
            onChange={handlePrecinctChange}
            style={{ minWidth: '14rem' }}
          />
        </Row>
      </Header>
      <MainContent>
        <div>
          {aggregatedResults.machinesReporting.length === 0 && (
            <p>No results reported.</p>
          )}
          {aggregatedResults.machinesReporting.length > 0 &&
            !aggregatedResults.isLive && <TestModeReportBanner />}
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
        <Route
          path={`${
            routes.election(':electionId').reports.votingGroup(':votingGroup')
              .path
          }`}
        >
          <LiveReportsGroupScreen electionId={electionId} />
        </Route>
        <Route path={routes.election(':electionId').reports.root.path}>
          <LiveReportsOverviewScreen electionId={electionId} />
        </Route>
      </Switch>
    </ElectionNavScreen>
  );
}
