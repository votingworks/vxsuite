import {
  H2,
  P,
  Icons,
  UnconfigureMachineButton,
  PowerDownButton,
  RebootToBiosButton,
  CurrentDateAndTime,
  SetClockButton,
  ExportLogsButton,
} from '@votingworks/ui';
import { useContext } from 'react';
import { NavigationScreen } from '../navigation_screen';
import { AppContext } from '../contexts/app_context';
import { logOut, unconfigure } from '../api';

export function SystemAdministratorSettingsScreen(): JSX.Element {
  const { auth, electionDefinition, logger, usbDriveStatus } =
    useContext(AppContext);
  const unconfigureMutation = unconfigure.useMutation();
  const logOutMutation = logOut.useMutation();

  return (
    <NavigationScreen title="Settings">
      <H2>Election</H2>
      <P>
        <Icons.Info /> To adjust settings for the current election, please
        insert an Election Manager card.
      </P>
      <UnconfigureMachineButton
        unconfigureMachine={async () => {
          try {
            await unconfigureMutation.mutateAsync({
              ignoreBackupRequirement: true,
            });
          } catch (e) {
            // Handled by default query client error handling
          }
        }}
        isMachineConfigured={Boolean(electionDefinition)}
      />
      <H2>Logs</H2>
      <ExportLogsButton
        usbDriveStatus={usbDriveStatus}
        auth={auth}
        logger={logger}
      />
      <H2>Date and Time</H2>
      <P>
        <CurrentDateAndTime />
      </P>
      <SetClockButton logOut={() => logOutMutation.mutate()}>
        Set Date and Time
      </SetClockButton>
      <H2>Software Update</H2>
      <RebootToBiosButton logger={logger} />{' '}
      <PowerDownButton logger={logger} userRole="system_administrator" />
    </NavigationScreen>
  );
}
