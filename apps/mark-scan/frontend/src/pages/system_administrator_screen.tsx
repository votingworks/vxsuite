import React, { useState } from 'react';

import {
  Button,
  H3,
  Main,
  Screen,
  SystemAdministratorScreenContents,
} from '@votingworks/ui';
import { UsbDriveStatus } from '@votingworks/usb-drive';
import { logOut } from '../api';
import { DiagnosticsScreen } from './diagnostics/diagnostics_screen';

const resetPollsToPausedText =
  'The polls are closed and voting is complete. After resetting the polls to paused, it will be possible to re-open the polls and resume voting. The printed ballots count will be preserved.';

interface Props {
  unconfigureMachine: () => Promise<void>;
  isMachineConfigured: boolean;
  resetPollsToPaused?: () => Promise<void>;
  usbDriveStatus: UsbDriveStatus;
}

/**
 * Screen when a system administrator card is inserted
 */
export function SystemAdministratorScreen({
  unconfigureMachine,
  isMachineConfigured,
  resetPollsToPaused,
  usbDriveStatus,
}: Props): JSX.Element {
  const logOutMutation = logOut.useMutation();
  const [isDiagnosticsScreenOpen, setIsDiagnosticsScreenOpen] = useState(false);

  if (isDiagnosticsScreenOpen) {
    return (
      <DiagnosticsScreen
        onBackButtonPress={() => setIsDiagnosticsScreenOpen(false)}
      />
    );
  }

  return (
    <Screen>
      <Main padded>
        <H3 as="h1">System Administrator</H3>
        <SystemAdministratorScreenContents
          displayRemoveCardToLeavePrompt
          resetPollsToPausedText={resetPollsToPausedText}
          resetPollsToPaused={resetPollsToPaused}
          primaryText={
            <React.Fragment>
              To adjust settings for the current election,
              <br />
              please insert an Election Manager or Poll Worker card.
            </React.Fragment>
          }
          unconfigureMachine={unconfigureMachine}
          isMachineConfigured={isMachineConfigured}
          logOut={() => logOutMutation.mutate()}
          usbDriveStatus={usbDriveStatus}
          additionalButtons={
            <Button onPress={() => setIsDiagnosticsScreenOpen(true)}>
              System Diagnostics
            </Button>
          }
        />
      </Main>
    </Screen>
  );
}
