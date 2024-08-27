import React from 'react';
import {
  Button,
  PowerDownButton,
  SystemAdministratorScreenContents,
} from '@votingworks/ui';
import { ElectionDefinition, PollsState } from '@votingworks/types';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { Screen } from '../components/layout';
import { SignedHashValidationButton } from '../components/signed_hash_validation_button';
import {
  unconfigureElection,
  logOut,
  resetPollsToPaused,
  getPrinterStatus,
} from '../api';
import { usePreviewContext } from '../preview_dashboard';
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
  const resetPollsToPausedMutation = resetPollsToPaused.useMutation();
  const unconfigureMutation = unconfigureElection.useMutation();
  const logOutMutation = logOut.useMutation();
  const printerStatusQuery = getPrinterStatus.useQuery();

  if (isDiagnosticsScreenOpen) {
    return (
      <DiagnosticsScreen onClose={() => setIsDiagnosticsScreenOpen(false)} />
    );
  }

  const additionalButtons = (
    <React.Fragment>
      <SignedHashValidationButton />
      {printerStatusQuery.data?.scheme === 'hardware-v4' && (
        <Button onPress={() => setIsDiagnosticsScreenOpen(true)}>
          System Diagnostics
        </Button>
      )}
      <PowerDownButton />
    </React.Fragment>
  );

  return (
    <Screen
      title="System Administrator"
      voterFacing={false}
      padded
      hideBallotCount
    >
      <SystemAdministratorScreenContents
        displayRemoveCardToLeavePrompt
        primaryText={
          <React.Fragment>
            To adjust settings for the current election, insert an Election
            Manager or Poll Worker card.
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
        additionalButtons={additionalButtons}
      />
    </Screen>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  const { electionDefinition } = usePreviewContext();
  return (
    <SystemAdministratorScreen
      pollsState="polls_open"
      electionDefinition={electionDefinition}
      usbDrive={{ status: 'no_drive' }}
    />
  );
}
