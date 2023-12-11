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
import type { LogsResultType } from '@votingworks/backend';
import { err } from '@votingworks/basics';
import { NavigationScreen } from '../navigation_screen';
import { AppContext } from '../contexts/app_context';
import { exportLogsToUsb, logOut, unconfigure } from '../api';

export function SystemAdministratorScreen(): JSX.Element {
  const { auth, electionDefinition, logger, usbDriveStatus } =
    useContext(AppContext);
  const unconfigureMutation = unconfigure.useMutation();
  const logOutMutation = logOut.useMutation();
  const exportLogsToUsbMutation = exportLogsToUsb.useMutation();

  async function doExportLogs(): Promise<LogsResultType> {
    try {
      return await exportLogsToUsbMutation.mutateAsync();
    } catch (e) {
      /* istanbul ignore next */
      return err('copy-failed');
    }
  }

  return (
    <NavigationScreen title="System Administrator">
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
      <H2>Software Update</H2>
      <RebootToBiosButton logger={logger} />{' '}
      <PowerDownButton logger={logger} userRole="system_administrator" />
      <H2>Logs</H2>
      <ExportLogsButton
        usbDriveStatus={usbDriveStatus}
        auth={auth}
        logger={logger}
        onExportLogs={doExportLogs}
      />
      <H2>Date and Time</H2>
      <P>
        <CurrentDateAndTime />
      </P>
      <SetClockButton logOut={() => logOutMutation.mutate()}>
        Set Date and Time
      </SetClockButton>
    </NavigationScreen>
  );
}
