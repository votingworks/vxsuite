import styled from 'styled-components';
import {
  Button,
  ElectionInfoBar,
  FullScreenMessage,
  H1,
  Icons,
  Main,
  P,
  Screen,
  useSystemCallApi,
} from '@votingworks/ui';
import type {
  MachineConfig,
  NetworkConnectionStatus,
} from '@votingworks/admin-backend';
import { throwIllegalValue } from '@votingworks/basics';
import { getNetworkConnectionStatus, logOut, setMachineMode } from '../api';

const StatusLine = styled(P)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  justify-content: center;
`;

function ConnectionStatusDisplay({
  connectionStatus,
}: {
  connectionStatus: NetworkConnectionStatus;
}): JSX.Element {
  switch (connectionStatus.status) {
    case 'offline':
      return (
        <StatusLine>
          <Icons.Danger color="danger" /> Offline
        </StatusLine>
      );
    case 'online-waiting-for-host':
      return (
        <StatusLine>
          <Icons.Warning color="warning" /> Online — Waiting for host
        </StatusLine>
      );
    case 'online-connected-to-host':
      return (
        <StatusLine>
          <Icons.Done color="success" /> Online — Connected to host machine:{' '}
          {connectionStatus.hostMachineId}
        </StatusLine>
      );
    /* istanbul ignore next @preserve */
    default:
      throwIllegalValue(connectionStatus);
  }
}

export function ClientMainScreen({
  machineConfig,
}: {
  machineConfig: MachineConfig;
}): JSX.Element {
  const logOutMutation = logOut.useMutation();
  const setMachineModeMutation = setMachineMode.useMutation();
  const powerDownMutation = useSystemCallApi().powerDown.useMutation();
  const networkConnectionStatusQuery = getNetworkConnectionStatus.useQuery();

  if (setMachineModeMutation.isSuccess) {
    return (
      <Screen>
        <Main centerChild>
          <FullScreenMessage title="Machine mode changed. Restart is required.">
            <P>
              <Button
                onPress={
                  /* istanbul ignore next - no-op in tests @preserve */
                  () => powerDownMutation.mutate()
                }
              >
                Power Down
              </Button>
            </P>
          </FullScreenMessage>
        </Main>
      </Screen>
    );
  }

  return (
    <Screen>
      <Main centerChild>
        <div style={{ textAlign: 'center' }}>
          <H1>VxAdmin Client</H1>
          {networkConnectionStatusQuery.isSuccess && (
            <ConnectionStatusDisplay
              connectionStatus={networkConnectionStatusQuery.data}
            />
          )}
          <P>
            <Button
              onPress={() => setMachineModeMutation.mutate({ mode: 'host' })}
              disabled={setMachineModeMutation.isLoading}
            >
              Switch to Host Mode
            </Button>
          </P>
          <P>
            <Button onPress={() => logOutMutation.mutate()}>
              Lock Machine
            </Button>
          </P>
        </div>
      </Main>
      <ElectionInfoBar
        mode="admin"
        codeVersion={machineConfig.codeVersion}
        machineId={machineConfig.machineId}
      />
    </Screen>
  );
}
