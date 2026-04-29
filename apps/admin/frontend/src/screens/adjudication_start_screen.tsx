import React, { useContext } from 'react';
import styled from 'styled-components';

import {
  Button,
  Card as UiCard,
  H3,
  Icons,
  LinkButton,
  Loading,
  P,
  ProgressBar,
  Table,
  TD,
  TH,
} from '@votingworks/ui';
import pluralize from 'pluralize';
import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import {
  BooleanEnvironmentVariableName,
  format,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { Admin, CandidateContest } from '@votingworks/types';
import type { MachineRecord } from '@votingworks/admin-backend';
import { NavigationScreen } from '../components/navigation_screen';
import { AppContext } from '../contexts/app_context';
import {
  getCastVoteRecordFiles,
  getBallotAdjudicationQueueMetadata,
  getIsClientAdjudicationEnabled,
  getNetworkStatus,
  getQualifiedWriteInCandidates,
  getSystemSettings,
  setIsClientAdjudicationEnabled,
} from '../api';
import { routerPaths } from '../router_paths';

const CardStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Card = styled(UiCard)`
  overflow: hidden;
`;

const CardRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
`;

const CardColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1em;
  flex: 1;
  min-width: 0;
`;

const CardHeader = styled(H3)`
  margin: -1rem -1rem 1rem;
  background-color: ${(p) => p.theme.colors.containerLow};
  border-bottom: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  padding: 0.75rem 1rem;
`;

const LargeText = styled.div`
  font-weight: 700;
  font-size: 1.5rem;
  line-height: 1;
`;

const SuccessProgressBar = styled.div`
  height: 0.75rem;
  width: 100%;
  background-color: ${(p) => p.theme.colors.primary};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
`;

const EmptyTableMessage = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
  color: ${(p) => p.theme.colors.onBackgroundMuted};
`;

const InlineStatus = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
`;

const SuccessInlineStatus = styled(InlineStatus)`
  color: ${(p) => p.theme.colors.successAccent};
`;

const StatusDot = styled(Icons.Circle).attrs({ filled: true })`
  font-size: 0.625em;
`;

const FullWidthTableWrapper = styled.div`
  & th,
  & td {
    padding: 0.625rem 1rem;
  }

  & tbody tr:last-child td {
    border-bottom: none;
  }
`;

function formatAuthType(authType: string | null): string {
  switch (authType) {
    case 'system_administrator':
      return 'System Administrator';
    case 'election_manager':
      return 'Election Manager';
    case 'poll_worker':
      return 'Poll Worker';
    default:
      return '—';
  }
}

function renderClientStatus(status: Admin.ClientMachineStatus): JSX.Element {
  switch (status) {
    case Admin.ClientMachineStatus.Offline:
      return (
        <React.Fragment>
          <Icons.Danger color="danger" /> Disconnected
        </React.Fragment>
      );
    case Admin.ClientMachineStatus.OnlineLocked:
      return (
        <React.Fragment>
          <Icons.Lock /> Locked
        </React.Fragment>
      );
    case Admin.ClientMachineStatus.Active:
      return (
        <React.Fragment>
          <Icons.Done color="success" /> Active
        </React.Fragment>
      );
    case Admin.ClientMachineStatus.Adjudicating:
      return (
        <React.Fragment>
          <Icons.Done color="success" /> Adjudicating
        </React.Fragment>
      );
    /* istanbul ignore next  - @preserve */
    default:
      throwIllegalValue(status);
  }
}

function WriteInCandidatesCard(): JSX.Element | null {
  const { electionDefinition, isOfficialResults } = useContext(AppContext);
  const { election } = assertDefined(electionDefinition);
  const candidatesQuery = getQualifiedWriteInCandidates.useQuery();

  const writeInContests = election.contests.filter(
    (c): c is CandidateContest => c.type === 'candidate' && c.allowWriteIns
  );

  const header = <CardHeader>Qualified Write-In Candidates</CardHeader>;

  if (writeInContests.length === 0) {
    return null;
  }

  if (!candidatesQuery.isSuccess) {
    return (
      <Card>
        {header}
        <Loading />
      </Card>
    );
  }

  const candidates = candidatesQuery.data;
  const contestsNeedingCandidates = writeInContests.filter(
    (c) => !candidates.some((qc) => qc.contestId === c.id)
  );

  if (candidates.length === 0) {
    return (
      <Card>
        {header}
        <CardRow>
          <P style={{ margin: 0 }}>
            Add qualified write-in candidates so they can be selected during
            ballot adjudication.
          </P>
          <LinkButton
            variant="primary"
            icon="Add"
            to={routerPaths.adjudicationCandidates}
            disabled={isOfficialResults}
          >
            Add Candidates
          </LinkButton>
        </CardRow>
      </Card>
    );
  }

  const contestsWithCandidates =
    writeInContests.length - contestsNeedingCandidates.length;
  const allHaveCandidates = contestsNeedingCandidates.length === 0;
  return (
    <Card>
      {header}
      <CardRow>
        <InlineStatus>
          {allHaveCandidates && <Icons.Done color="success" />}
          {contestsWithCandidates} of {writeInContests.length} write-in contests
          have qualified candidates
        </InlineStatus>
        <LinkButton
          icon="Edit"
          to={routerPaths.adjudicationCandidates}
          disabled={isOfficialResults}
        >
          Edit Candidates
        </LinkButton>
      </CardRow>
    </Card>
  );
}

function BallotAdjudicationCard({
  showHeader,
}: {
  showHeader: boolean;
}): JSX.Element {
  const { isOfficialResults } = useContext(AppContext);
  const queueMetadataQuery = getBallotAdjudicationQueueMetadata.useQuery();
  const cvrFilesQuery = getCastVoteRecordFiles.useQuery();
  const systemSettingsQuery = getSystemSettings.useQuery();
  const candidatesQuery = getQualifiedWriteInCandidates.useQuery();

  const header = showHeader && <CardHeader>Ballot Adjudication</CardHeader>;

  if (
    !queueMetadataQuery.isSuccess ||
    !cvrFilesQuery.isSuccess ||
    !systemSettingsQuery.isSuccess ||
    !candidatesQuery.isSuccess
  ) {
    return (
      <Card>
        {header}
        <Loading />
      </Card>
    );
  }

  const { totalTally, pendingTally } = queueMetadataQuery.data;

  function renderInfoMessage(message: string) {
    return (
      <Card>
        {header}
        <InlineStatus>
          <Icons.Info /> {message}
        </InlineStatus>
      </Card>
    );
  }

  if (cvrFilesQuery.data.length === 0) {
    return renderInfoMessage('Load CVRs to begin adjudication.');
  }
  if (totalTally === 0) {
    return renderInfoMessage('No ballots flagged for adjudication.');
  }

  const completedCount = totalTally - pendingTally;
  const percentComplete = Math.round((completedCount / totalTally) * 100);
  const { areWriteInCandidatesQualified } = systemSettingsQuery.data;
  const adjudicateButtonVariant =
    !areWriteInCandidatesQualified || candidatesQuery.data.length > 0
      ? 'primary'
      : 'neutral';

  if (pendingTally === 0) {
    return (
      <Card>
        {header}
        <CardColumn>
          <CardRow>
            <LargeText>
              <Icons.Done color="success" /> All ballots adjudicated
            </LargeText>
            <LinkButton
              variant="primary"
              icon="RotateRight"
              to={routerPaths.ballotAdjudication}
              disabled={isOfficialResults}
            >
              Review
            </LinkButton>
          </CardRow>
          <InlineStatus>
            {completedCount} of {totalTally} adjudicated · {percentComplete}%
          </InlineStatus>
          <SuccessProgressBar />
        </CardColumn>
      </Card>
    );
  }

  return (
    <Card>
      {header}
      <CardColumn>
        <CardRow>
          <LargeText>
            {pendingTally} {pluralize('ballot', pendingTally)} remaining
          </LargeText>
          <LinkButton
            variant={adjudicateButtonVariant}
            icon="PenToSquare"
            to={routerPaths.ballotAdjudication}
            disabled={isOfficialResults}
          >
            Adjudicate
          </LinkButton>
        </CardRow>
        <InlineStatus>
          {completedCount} of {totalTally} adjudicated · {percentComplete}%
        </InlineStatus>
        <ProgressBar progress={completedCount / totalTally} />
      </CardColumn>
    </Card>
  );
}

function MultiStationClientsTable({
  clients,
  isEnabled,
}: {
  clients: MachineRecord[];
  isEnabled: boolean;
}): JSX.Element {
  return (
    <FullWidthTableWrapper>
      <Table>
        <thead>
          <tr>
            <TH>Machine ID</TH>
            <TH>Status</TH>
            <TH>User Role</TH>
            <TH>Last Seen</TH>
          </tr>
        </thead>
        <tbody>
          {clients.length === 0 ? (
            <tr>
              <TD colSpan={4}>
                <EmptyTableMessage>
                  {isEnabled ? (
                    <React.Fragment>
                      <Icons.Loading /> Waiting for clients to connect…
                    </React.Fragment>
                  ) : (
                    'No clients have connected.'
                  )}
                </EmptyTableMessage>
              </TD>
            </tr>
          ) : (
            clients.map((machine) => {
              const isOffline =
                machine.status === Admin.ClientMachineStatus.Offline;
              return (
                <tr key={machine.machineId}>
                  <TD>{machine.machineId}</TD>
                  <TD>{renderClientStatus(machine.status)}</TD>
                  <TD>{isOffline ? '—' : formatAuthType(machine.authType)}</TD>
                  <TD>{format.relativeTime(machine.lastSeenAt)}</TD>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
    </FullWidthTableWrapper>
  );
}

function MultiStationCard(): JSX.Element {
  const networkStatusQuery = getNetworkStatus.useQuery();
  const adjudicationEnabledQuery = getIsClientAdjudicationEnabled.useQuery();
  const setAdjudicationEnabledMutation =
    setIsClientAdjudicationEnabled.useMutation();

  const header = <CardHeader>Multi-Station Adjudication</CardHeader>;

  if (!networkStatusQuery.isSuccess || !adjudicationEnabledQuery.isSuccess) {
    return (
      <Card>
        {header}
        <Loading />
      </Card>
    );
  }

  const isEnabled = adjudicationEnabledQuery.data;
  const { connectedClients, isOnline, multipleHostsDetected } =
    networkStatusQuery.data;

  return (
    <Card>
      {header}
      <CardColumn>
        <CardRow>
          {!isOnline ? (
            <InlineStatus>
              <Icons.Warning color="warning" /> Network Offline
            </InlineStatus>
          ) : isEnabled ? (
            <SuccessInlineStatus>
              <StatusDot color="success" /> Online · Clients Can Adjudicate
              Ballots
            </SuccessInlineStatus>
          ) : (
            <InlineStatus>
              <StatusDot /> Off · Clients Cannot Adjudicate Ballots
            </InlineStatus>
          )}
          {isOnline && (
            <Button
              icon={isEnabled ? <Icons.Square filled /> : 'Play'}
              onPress={() =>
                setAdjudicationEnabledMutation.mutate({ enabled: !isEnabled })
              }
              disabled={
                setAdjudicationEnabledMutation.isLoading ||
                multipleHostsDetected
              }
              variant={isEnabled ? 'neutral' : 'secondary'}
            >
              {isEnabled ? 'Disable' : 'Enable Multi-Station'}
            </Button>
          )}
        </CardRow>
        {multipleHostsDetected && (
          <P style={{ margin: 0 }}>
            <Icons.Danger color="danger" /> Multiple hosts detected on the
            network. Only one host machine should be active at a time.
          </P>
        )}
        {isOnline && (
          <MultiStationClientsTable
            clients={connectedClients}
            isEnabled={isEnabled}
          />
        )}
      </CardColumn>
    </Card>
  );
}

export function AdjudicationStartScreen(): JSX.Element {
  const { isOfficialResults } = useContext(AppContext);
  const systemSettingsQuery = getSystemSettings.useQuery();
  const isMultiStationEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
  );

  if (!systemSettingsQuery.isSuccess) {
    return (
      <NavigationScreen title="Adjudication">
        <Loading isFullscreen />
      </NavigationScreen>
    );
  }

  const { areWriteInCandidatesQualified } = systemSettingsQuery.data;
  const showMultiStationCard = isMultiStationEnabled && !isOfficialResults;
  const hasOtherCards = areWriteInCandidatesQualified || showMultiStationCard;

  return (
    <NavigationScreen title="Adjudication">
      <CardStack>
        {areWriteInCandidatesQualified && <WriteInCandidatesCard />}
        <BallotAdjudicationCard showHeader={hasOtherCards} />
        {showMultiStationCard && <MultiStationCard />}
      </CardStack>
    </NavigationScreen>
  );
}
