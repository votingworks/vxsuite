import {
  Button,
  ElectionInfoBar,
  FullScreenMessage,
  H1,
  Main,
  P,
  Screen,
  useSystemCallApi,
} from '@votingworks/ui';
import type { MachineConfig } from '@votingworks/admin-backend';
import { logOut, setMachineMode } from '../api';

export function ClientMainScreen({
  machineConfig,
}: {
  machineConfig: MachineConfig;
}): JSX.Element {
  const logOutMutation = logOut.useMutation();
  const setMachineModeMutation = setMachineMode.useMutation();
  const powerDownMutation = useSystemCallApi().powerDown.useMutation();

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
          <P>
            This machine is configured as a client for multi-station
            adjudication. Networking is not yet set up.
          </P>
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
