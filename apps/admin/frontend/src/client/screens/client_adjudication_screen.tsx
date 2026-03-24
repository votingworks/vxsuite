import React, { useContext } from 'react';
import { Button, H2, Icons, P } from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { NavigationScreen } from '../../components/navigation_screen';
import {
  getAdjudicationSessionStatus,
  getNetworkConnectionStatus,
} from '../api';
import { AppContext } from '../../contexts/app_context';

export function ClientAdjudicationScreen(): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  const networkStatusQuery = getNetworkConnectionStatus.useQuery();
  const adjudicationStatusQuery = getAdjudicationSessionStatus.useQuery();
  const isConnected =
    networkStatusQuery.isSuccess &&
    networkStatusQuery.data.status === 'online-connected-to-host';
  const isAdjudicationEnabled =
    adjudicationStatusQuery.isSuccess &&
    adjudicationStatusQuery.data.isClientAdjudicationEnabled;
  const canStartAdjudication =
    isConnected && !!electionDefinition && isAdjudicationEnabled;

  return (
    <NavigationScreen title="Adjudication">
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
          disabled={!canStartAdjudication}
          onPress={
            /* istanbul ignore next - placeholder @preserve */
            () => {}
          }
        >
          Start Adjudication
        </Button>
      </P>
      {!canStartAdjudication && (
        <P>
          {isConnected && electionDefinition && !isAdjudicationEnabled
            ? 'Waiting for host to initiate adjudication.'
            : 'Connect to a host with an election configured to begin adjudication.'}
        </P>
      )}
    </NavigationScreen>
  );
}
