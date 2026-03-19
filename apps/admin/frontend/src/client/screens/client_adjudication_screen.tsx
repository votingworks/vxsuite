import React, { useContext } from 'react';
import { Button, H2, Icons, P } from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { ClientNavigationScreen } from '../components/client_navigation_screen';
import { getNetworkConnectionStatus } from '../api';
import { AppContext } from '../../contexts/app_context';

export function ClientAdjudicationScreen(): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  const networkStatusQuery = getNetworkConnectionStatus.useQuery();
  const isConnected =
    networkStatusQuery.isSuccess &&
    networkStatusQuery.data.status === 'online-connected-to-host';
  const isConnectedWithElection = isConnected && !!electionDefinition;

  return (
    <ClientNavigationScreen title="Adjudication">
      <H2>Connection</H2>
      <P>
        {networkStatusQuery.isSuccess &&
          networkStatusQuery.data.status === 'online-connected-to-host' && (
            <span>
              <Icons.Done color="success" /> Connected to host{' '}
              {networkStatusQuery.data.hostMachineId}
            </span>
          )}
        {networkStatusQuery.isSuccess &&
          networkStatusQuery.data.status === 'online-waiting-for-host' && (
            <span>
              <Icons.Warning color="warning" /> Searching for host…
            </span>
          )}
        {networkStatusQuery.isSuccess &&
          networkStatusQuery.data.status === 'offline' && (
            <span>
              <Icons.Danger color="danger" /> Offline — no network connection
            </span>
          )}
        {!networkStatusQuery.isSuccess && <span>Checking network status…</span>}
      </P>
      {electionDefinition && (
        <React.Fragment>
          <H2>Election</H2>
          <P>
            {electionDefinition.election.title}
            {' — '}
            {electionDefinition.election.county.name},{' '}
            {electionDefinition.election.state}
            {' — '}
            {format.localeLongDate(
              electionDefinition.election.date.toMidnightDatetimeWithSystemTimezone()
            )}
          </P>
        </React.Fragment>
      )}
      <H2>Write-In Adjudication</H2>
      <P>
        <Button
          disabled={!isConnectedWithElection}
          onPress={
            /* istanbul ignore next - placeholder @preserve */
            () => {}
          }
        >
          Start Adjudication
        </Button>
      </P>
      {!isConnectedWithElection && (
        <P>
          Connect to a host with an election configured to begin adjudication.
        </P>
      )}
    </ClientNavigationScreen>
  );
}
