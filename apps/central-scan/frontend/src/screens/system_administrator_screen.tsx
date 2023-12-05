import {
  H2,
  P,
  Icons,
  UnconfigureMachineButton,
  PowerDownButton,
  RebootFromUsbButton,
  RebootToBiosButton,
  CurrentDateAndTime,
  SetClockButton,
} from '@votingworks/ui';
import { useContext } from 'react';
import { NavigationScreen } from '../navigation_screen';
import { AppContext } from '../contexts/app_context';
import { logOut, unconfigure } from '../api';

export function SystemAdministratorScreen(): JSX.Element {
  const { electionDefinition, logger, usbDriveStatus } = useContext(AppContext);
  const unconfigureMutation = unconfigure.useMutation();
  const logOutMutation = logOut.useMutation();

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
      <H2>Machine</H2>
      <PowerDownButton logger={logger} userRole="system_administrator" />
      <H2>Software Update</H2>
      <RebootFromUsbButton
        usbDriveStatus={usbDriveStatus}
        logger={logger}
      />{' '}
      <RebootToBiosButton logger={logger} />
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
