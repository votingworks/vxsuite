import React, { useContext } from 'react';
import styled from 'styled-components';
import { Route, Switch } from 'react-router-dom';

import {
  Button,
  Callout,
  Caption,
  Font,
  H2,
  Icons,
  LinkButton,
  Loading,
  P,
  RouterTabBar,
  TabPanel,
  Table,
  TD,
  TH,
} from '@votingworks/ui';
import pluralize from 'pluralize';
import { throwIllegalValue } from '@votingworks/basics';
import {
  BooleanEnvironmentVariableName,
  format,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { Admin } from '@votingworks/types';
import { NavigationScreen } from '../components/navigation_screen';
import { AppContext } from '../contexts/app_context';
import {
  getCastVoteRecordFiles,
  getBallotAdjudicationQueueMetadata,
  getIsClientAdjudicationEnabled,
  getNetworkStatus,
  getSystemSettings,
  setIsClientAdjudicationEnabled,
} from '../api';
import { routerPaths } from '../router_paths';
import { WriteInCandidatesTab } from './write_in_candidates_tab';

const Column = styled.div`
  display: flex;
  gap: 1rem;
  flex-direction: column;
`;

const Row = styled.div`
  display: flex;
  gap: 1rem;
  align-items: center;
`;

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const InlineColumn = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
`;

const TabbedContent = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1rem 1rem 0;
`;

const CenteredContent = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
  height: 100%;
  padding-bottom: 2rem;
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

function MultiStationToggleButton(): JSX.Element | null {
  const adjudicationEnabledQuery = getIsClientAdjudicationEnabled.useQuery();
  const networkStatusQuery = getNetworkStatus.useQuery();
  const setAdjudicationEnabledMutation =
    setIsClientAdjudicationEnabled.useMutation();

  if (!adjudicationEnabledQuery.isSuccess || !networkStatusQuery.isSuccess) {
    return null;
  }

  const isEnabled = adjudicationEnabledQuery.data;
  const { multipleHostsDetected } = networkStatusQuery.data;

  return (
    <Button
      onPress={() =>
        setAdjudicationEnabledMutation.mutate({
          enabled: !isEnabled,
        })
      }
      disabled={
        setAdjudicationEnabledMutation.isLoading || multipleHostsDetected
      }
      style={{ height: '3rem', fontSize: '1.25rem' }}
    >
      {isEnabled ? 'Disable Multi-Station' : 'Enable Multi-Station'}
    </Button>
  );
}

function NetworkSection(): JSX.Element {
  const networkStatusQuery = getNetworkStatus.useQuery();
  const adjudicationEnabledQuery = getIsClientAdjudicationEnabled.useQuery();

  if (!networkStatusQuery.isSuccess || !adjudicationEnabledQuery.isSuccess) {
    return <Loading />;
  }

  const isEnabled = adjudicationEnabledQuery.data;
  const { connectedClients, multipleHostsDetected } = networkStatusQuery.data;

  return (
    <Section>
      <H2 style={{ margin: 0 }}>Multi-Station Adjudication</H2>
      <Row>
        <MultiStationToggleButton />
        <InlineColumn>
          <Font weight="semiBold">Status: {isEnabled ? 'On' : 'Off'}</Font>
          <Caption>
            {isEnabled
              ? 'Clients can adjudicate ballots'
              : 'Clients cannot adjudicate ballots'}
          </Caption>
        </InlineColumn>
      </Row>
      {multipleHostsDetected && (
        <P>
          <Icons.Danger color="danger" /> Multiple hosts detected on the
          network. Only one host machine should be active at a time.
        </P>
      )}
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
          {connectedClients.length === 0 ? (
            <tr>
              <TD colSpan={4}>No clients have connected.</TD>
            </tr>
          ) : (
            connectedClients.map((machine) => {
              function renderStatus() {
                switch (machine.status) {
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
                    throwIllegalValue(machine.status);
                }
              }

              const isOffline =
                machine.status === Admin.ClientMachineStatus.Offline;
              return (
                <tr key={machine.machineId}>
                  <TD>{machine.machineId}</TD>
                  <TD>{renderStatus()}</TD>
                  <TD>{isOffline ? '—' : formatAuthType(machine.authType)}</TD>
                  <TD>{format.relativeTime(machine.lastSeenAt)}</TD>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
    </Section>
  );
}

function AdjudicateBallotsButton(): JSX.Element {
  return (
    <LinkButton
      variant="primary"
      to={routerPaths.ballotAdjudication}
      style={{ height: '3rem', width: '14rem', fontSize: '1.25rem' }}
    >
      Start Adjudicating
    </LinkButton>
  );
}

function PendingBallotCount({ count }: { count: number }): JSX.Element {
  return (
    <Font weight="semiBold">
      {count} {pluralize('Ballot', count)} Awaiting Review
    </Font>
  );
}

function CompletedBallotCount({ count }: { count: number }): JSX.Element {
  return (
    <Caption>
      {count} {pluralize('Ballot', count)} Completed
    </Caption>
  );
}

function BallotAdjudicationContent(): JSX.Element {
  const { isOfficialResults } = useContext(AppContext);

  const isMultiStationEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
  );
  const systemSettingsQuery = getSystemSettings.useQuery();

  const adjudicationQueueMetadataQuery =
    getBallotAdjudicationQueueMetadata.useQuery();

  const castVoteRecordFilesQuery = getCastVoteRecordFiles.useQuery();

  if (
    !adjudicationQueueMetadataQuery.isSuccess ||
    !castVoteRecordFilesQuery.isSuccess ||
    !systemSettingsQuery.isSuccess
  ) {
    return <Loading isFullscreen />;
  }

  const queryMetadata = adjudicationQueueMetadataQuery.data;
  function renderCallout() {
    if (isOfficialResults) {
      return (
        <Callout icon="Info" color="neutral">
          Adjudication is disabled because results were marked as official.
        </Callout>
      );
    }

    if (
      castVoteRecordFilesQuery.isSuccess &&
      castVoteRecordFilesQuery.data.length === 0
    ) {
      return (
        <Callout icon="Info" color="neutral">
          Load CVRs to begin adjudication.
        </Callout>
      );
    }

    if (queryMetadata.totalTally === 0) {
      return (
        <Callout icon="Info" color="neutral">
          No ballots flagged for adjudication.
        </Callout>
      );
    }
    return null;
  }

  const callout = renderCallout();
  if (callout) {
    return (
      <Column style={{ gap: '1rem' }}>
        {callout}
        {isMultiStationEnabled && <NetworkSection />}
      </Column>
    );
  }

  const inQualifiedWriteInMode =
    systemSettingsQuery.data.areWriteInCandidatesQualified ?? false;
  const completedCount = queryMetadata.totalTally - queryMetadata.pendingTally;

  if (isMultiStationEnabled) {
    return (
      <Column>
        <Section>
          {!inQualifiedWriteInMode && (
            <H2 style={{ margin: 0 }}>Ballot Adjudication</H2>
          )}
          <Row>
            <AdjudicateBallotsButton />
            <InlineColumn>
              <PendingBallotCount count={queryMetadata.pendingTally} />
              <CompletedBallotCount count={completedCount} />
            </InlineColumn>
          </Row>
        </Section>
        <NetworkSection />
      </Column>
    );
  }

  return (
    <CenteredContent>
      <AdjudicateBallotsButton />
      <PendingBallotCount count={queryMetadata.pendingTally} />
      <CompletedBallotCount count={completedCount} />
    </CenteredContent>
  );
}

export function AdjudicationStartScreen(): JSX.Element {
  const systemSettingsQuery = getSystemSettings.useQuery();
  const areWriteInCandidatesQualified =
    systemSettingsQuery.data?.areWriteInCandidatesQualified ?? false;

  if (areWriteInCandidatesQualified) {
    return (
      <NavigationScreen
        title="Adjudication"
        noPadding
        style={{ overflow: 'hidden' }}
      >
        <TabbedContent>
          <RouterTabBar
            tabs={[
              {
                title: 'Ballot Adjudication',
                path: routerPaths.adjudication,
              },
              {
                title: 'Write-In Candidates',
                path: routerPaths.adjudicationCandidates,
              },
            ]}
          />
          <Switch>
            <Route
              exact
              path={routerPaths.adjudicationCandidates}
              component={WriteInCandidatesTab}
            />
            <Route path={routerPaths.adjudication}>
              <TabPanel style={{ paddingTop: '1rem' }}>
                <BallotAdjudicationContent />
              </TabPanel>
            </Route>
          </Switch>
        </TabbedContent>
      </NavigationScreen>
    );
  }

  return (
    <NavigationScreen title="Adjudication">
      <BallotAdjudicationContent />
    </NavigationScreen>
  );
}
