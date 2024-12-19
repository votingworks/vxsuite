import React from 'react';
import {
  Button,
  P,
  PowerDownButton,
  SignedHashValidationButton,
  SystemAdministratorScreenContents,
} from '@votingworks/ui';
import { ElectionDefinition, PollsState } from '@votingworks/types';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { Screen } from '../components/layout';
import {
  unconfigureElection,
  logOut,
  resetPollsToPaused,
  getPrinterStatus,
  useApiClient,
  getConfig,
} from '../api';
import { DiagnosticsScreen } from './diagnostics_screen';

interface SystemAdministratorScreenProps {
  electionDefinition?: ElectionDefinition;
  pollsState: PollsState;
  usbDrive: UsbDriveStatus;
}

export function SystemAdministratorScreen({
  electionDefinition,
  pollsState,
  usbDrive,
}: SystemAdministratorScreenProps): JSX.Element {
  const [isDiagnosticsScreenOpen, setIsDiagnosticsScreenOpen] =
    React.useState(false);
  const apiClient = useApiClient();
  const resetPollsToPausedMutation = resetPollsToPaused.useMutation();
  const unconfigureMutation = unconfigureElection.useMutation();
  const logOutMutation = logOut.useMutation();
  const printerStatusQuery = getPrinterStatus.useQuery();

  if (isDiagnosticsScreenOpen) {
    return (
      <DiagnosticsScreen onClose={() => setIsDiagnosticsScreenOpen(false)} />
    );
  }

  return (
    <Screen
      title="System Administrator Menu"
      voterFacing={false}
      infoBarMode="admin"
      padded
      hideBallotCount
    >
      <SystemAdministratorScreenContents
        displayRemoveCardToLeavePrompt
        primaryText={
          <React.Fragment>
            To adjust settings for the current election, insert an election
            manager or poll worker card.
          </React.Fragment>
        }
        unconfigureMachine={() => unconfigureMutation.mutateAsync()}
        resetPollsToPausedText="The polls are closed and voting is complete. After resetting the polls to paused, it will be possible to re-open the polls and resume voting. All current cast vote records will be preserved."
        resetPollsToPaused={
          pollsState === 'polls_closed_final'
            ? () => resetPollsToPausedMutation.mutateAsync()
            : undefined
        }
        isMachineConfigured={Boolean(electionDefinition)}
        logOut={() => logOutMutation.mutate()}
        usbDriveStatus={usbDrive}
        additionalButtons={
          <React.Fragment>
            {printerStatusQuery.data?.scheme === 'hardware-v4' && (
              <Button onPress={() => setIsDiagnosticsScreenOpen(true)}>
                Diagnostics
              </Button>
            )}
            <SignedHashValidationButton apiClient={apiClient} />
            <PowerDownButton />
          </React.Fragment>
        }
      />
    </Screen>
  );
}

/* istanbul ignore next - @preserve */
export function DefaultPreview(): JSX.Element {
  const configQuery = getConfig.useQuery();
  const electionDefinition = configQuery.data?.electionDefinition;

  if (!electionDefinition) {
    return <P>Loading…</P>;
  }

  return (
    <SystemAdministratorScreen
      pollsState="polls_open"
      electionDefinition={electionDefinition}
      usbDrive={{ status: 'no_drive' }}
    />
  );
}
