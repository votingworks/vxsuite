import React from 'react';
import { Button, H2, Icons, Loading, P, Table, TD, TH } from '@votingworks/ui';
import { MachineStatus } from '../types';
import {
  getIsClientAdjudicationEnabled,
  getNetworkStatus,
  setIsClientAdjudicationEnabled,
} from '../api';

function formatAuthType(authType: string | null): string {
  switch (authType) {
    case 'system_administrator':
      return 'System Administrator';
    case 'election_manager':
      return 'Election Manager';
    case 'poll_worker':
      return 'Poll Worker';
    default:
      return authType ?? '—';
  }
}

export function AdjudicationNetworkTab(): JSX.Element {
  const networkStatusQuery = getNetworkStatus.useQuery();
  const adjudicationEnabledQuery = getIsClientAdjudicationEnabled.useQuery();
  const setAdjudicationEnabledMutation =
    setIsClientAdjudicationEnabled.useMutation();

  if (!networkStatusQuery.isSuccess || !adjudicationEnabledQuery.isSuccess) {
    return <Loading isFullscreen />;
  }

  const { isOnline, connectedClients } = networkStatusQuery.data;
  const isEnabled = adjudicationEnabledQuery.data;

  return (
    <React.Fragment>
      <H2>Multi-Station Adjudication</H2>
      <P>
        {isEnabled ? (
          <React.Fragment>
            <Icons.Done color="success" /> Multi-station adjudication is
            enabled. Connected clients can begin adjudicating.
          </React.Fragment>
        ) : (
          <React.Fragment>
            <Icons.Warning color="warning" /> Multi-station adjudication is
            disabled. Enable it to allow connected clients to adjudicate.
          </React.Fragment>
        )}
      </P>
      <P>
        <Button
          onPress={() =>
            setAdjudicationEnabledMutation.mutate({
              enabled: !isEnabled,
            })
          }
          disabled={setAdjudicationEnabledMutation.isLoading}
        >
          {isEnabled
            ? 'Disable Multi-Station Adjudication'
            : 'Enable Multi-Station Adjudication'}
        </Button>
      </P>

      <H2>Network</H2>
      <P>
        {isOnline ? (
          <React.Fragment>
            <Icons.Done color="success" /> Online
          </React.Fragment>
        ) : (
          <React.Fragment>
            <Icons.Danger color="danger" /> Offline
          </React.Fragment>
        )}
      </P>

      <H2>Clients</H2>
      {connectedClients.length === 0 ? (
        <P>No clients have connected.</P>
      ) : (
        <Table>
          <thead>
            <tr>
              <TH>Machine ID</TH>
              <TH>Status</TH>
              <TH>User</TH>
              <TH>Last Seen</TH>
            </tr>
          </thead>
          <tbody>
            {connectedClients.map((machine) => {
              const isOffline = machine.status === MachineStatus.Offline;
              return (
                <tr key={machine.machineId}>
                  <TD>{machine.machineId}</TD>
                  <TD>
                    {isOffline ? (
                      <React.Fragment>
                        <Icons.Danger color="danger" /> Disconnected
                      </React.Fragment>
                    ) : machine.status === MachineStatus.OnlineLocked ? (
                      <React.Fragment>
                        <Icons.Lock /> Locked
                      </React.Fragment>
                    ) : (
                      <React.Fragment>
                        <Icons.Done color="success" /> Active
                      </React.Fragment>
                    )}
                  </TD>
                  <TD>{isOffline ? '—' : formatAuthType(machine.authType)}</TD>
                  <TD>{new Date(machine.lastSeenAt).toLocaleTimeString()}</TD>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </React.Fragment>
  );
}
