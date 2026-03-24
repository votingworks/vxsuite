import React, { useContext } from 'react';

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
import { NavigationScreen } from '../components/navigation_screen';
import { AppContext } from '../contexts/app_context';
import {
  getCastVoteRecordFiles,
  getBallotAdjudicationQueueMetadata,
  getIsClientAdjudicationEnabled,
  getNetworkStatus,
  setIsClientAdjudicationEnabled,
} from '../api';
import { routerPaths } from '../router_paths';
import { MachineStatus } from '../types';

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
  const setAdjudicationEnabledMutation =
    setIsClientAdjudicationEnabled.useMutation();

  if (!adjudicationEnabledQuery.isSuccess) {
    return null;
  }

  const isEnabled = adjudicationEnabledQuery.data;

  return (
    <Button
      onPress={() =>
        setAdjudicationEnabledMutation.mutate({
          enabled: !isEnabled,
        })
      }
      disabled={setAdjudicationEnabledMutation.isLoading}
      style={{ height: '3rem', fontSize: '1.25rem' }}
    >
      {isEnabled
        ? 'Disable Multi-Station Adjudication'
        : 'Enable Multi-Station Adjudication'}
    </Button>
  );
}

function NetworkSection(): JSX.Element {
  const networkStatusQuery = getNetworkStatus.useQuery();

  if (!networkStatusQuery.isSuccess) {
    return <Loading />;
  }

  const { isOnline, connectedClients } = networkStatusQuery.data;

  return (
    <React.Fragment>
      <H2 style={{ marginTop: 0 }}>Clients</H2>
      <P>
        {isOnline ? (
          <React.Fragment>
            <Icons.Done color="success" /> Network: Online
          </React.Fragment>
        ) : (
          <React.Fragment>
            <Icons.Danger color="danger" /> Network: Offline
          </React.Fragment>
        )}
      </P>
      {connectedClients.length === 0 ? (
        <P>No clients have connected.</P>
      ) : (
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
            {connectedClients.map((machine) => {
              const status = machine.status as MachineStatus;
              function renderStatus() {
                switch (status) {
                  case MachineStatus.Offline:
                    return (
                      <React.Fragment>
                        <Icons.Danger color="danger" /> Disconnected
                      </React.Fragment>
                    );
                  case MachineStatus.OnlineLocked:
                    return (
                      <React.Fragment>
                        <Icons.Lock /> Locked
                      </React.Fragment>
                    );
                  case MachineStatus.Active:
                    return (
                      <React.Fragment>
                        <Icons.Done color="success" /> Active
                      </React.Fragment>
                    );
                  case MachineStatus.Adjudicating:
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

              const isOffline = machine.status === MachineStatus.Offline;
              return (
                <tr key={machine.machineId}>
                  <TD>{machine.machineId}</TD>
                  <TD>{renderStatus()}</TD>
                  <TD>{isOffline ? '—' : formatAuthType(machine.authType)}</TD>
                  <TD>{format.relativeTime(machine.lastSeenAt)}</TD>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </React.Fragment>
  );
}

export function AdjudicationStartScreen(): JSX.Element {
  const { isOfficialResults } = useContext(AppContext);

  const isMultiStationEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
  );

  const adjudicationQueueMetadataQuery =
    getBallotAdjudicationQueueMetadata.useQuery();

  const castVoteRecordFilesQuery = getCastVoteRecordFiles.useQuery();

  if (
    !adjudicationQueueMetadataQuery.isSuccess ||
    !castVoteRecordFilesQuery.isSuccess
  ) {
    return (
      <NavigationScreen title="Adjudication">
        <Loading isFullscreen />
      </NavigationScreen>
    );
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
      <NavigationScreen title="Adjudication">
        {callout}
        {isMultiStationEnabled && <NetworkSection />}
      </NavigationScreen>
    );
  }

  return (
    <NavigationScreen title="Adjudication">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '1rem',
          paddingBottom: '5%',
        }}
      >
        <div style={{ display: 'flex', gap: '1rem' }}>
          <LinkButton
            variant="primary"
            to={routerPaths.ballotAdjudication}
            style={{ height: '3rem', width: '14rem', fontSize: '1.25rem' }}
          >
            Start Adjudication
          </LinkButton>
          {isMultiStationEnabled && <MultiStationToggleButton />}
        </div>
        <div style={{ textAlign: 'center' }}>
          <Font weight="semiBold" style={{ display: 'block' }}>
            {queryMetadata.pendingTally}{' '}
            {pluralize('Ballot', queryMetadata.pendingTally)} Awaiting Review
          </Font>
          <Caption style={{ display: 'block', marginTop: '0.25rem' }}>
            {queryMetadata.totalTally - queryMetadata.pendingTally}{' '}
            {pluralize(
              'Ballot',
              queryMetadata.totalTally - queryMetadata.pendingTally
            )}{' '}
            Completed
          </Caption>
        </div>
      </div>
      {isMultiStationEnabled && <NetworkSection />}
    </NavigationScreen>
  );
}
