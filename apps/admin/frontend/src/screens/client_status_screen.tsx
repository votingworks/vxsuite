import { useContext } from 'react';
import { Card, FullScreenMessage, H2, Icons, Loading } from '@votingworks/ui';
import { throwIllegalValue } from '@votingworks/basics';
import { NavigationScreen } from '../components/navigation_screen';
import { MachineModeSelector } from '../components/machine_mode_selector';
import { getNetworkStatus } from '../api';
import { AppContext } from '../contexts/app_context';

export function ClientStatusScreen(): JSX.Element {
  const { machineConfig } = useContext(AppContext);
  const networkStatusQuery = getNetworkStatus.useQuery();

  const networkStatus = networkStatusQuery.data;

  return (
    <NavigationScreen title="Election">
      <MachineModeSelector />
      {!networkStatus || networkStatus.mode !== 'client' ? (
        <FullScreenMessage title="Loading..." image={<Loading />} />
      ) : (
        (() => {
          const { connectionStatus } = networkStatus;
          switch (connectionStatus.status) {
            case 'not_connected':
              return (
                <Card>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Loading />
                    Searching for Host VxAdmin...
                  </div>
                </Card>
              );
            case 'connected':
              return (
                <Card color="neutral">
                  <H2>Connected to Host VxAdmin</H2>
                  <p>
                    Host Machine ID: {connectionStatus.hostMachineId}
                  </p>
                  <p>
                    This Machine ID: {machineConfig.machineId}
                  </p>
                </Card>
              );
            case 'too_many_hosts':
              return (
                <Card color="danger">
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Icons.Danger color="danger" />
                    Multiple Host VxAdmin machines detected (
                    {connectionStatus.hostCount}). Only one host should be
                    active on the network.
                  </div>
                </Card>
              );
            default:
              throwIllegalValue(connectionStatus);
          }
        })()
      )}
    </NavigationScreen>
  );
}
