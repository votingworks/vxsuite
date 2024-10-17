import React, { useState } from 'react';

import {
  Button,
  H2,
  Main,
  Screen,
  SignedHashValidationButton,
  SystemAdministratorScreenContents,
} from '@votingworks/ui';
import { UsbDriveStatus } from '@votingworks/usb-drive';
import { logOut, useApiClient } from '../api';
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
  const apiClient = useApiClient();
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
        <H2 as="h1">System Administrator Menu</H2>
        <SystemAdministratorScreenContents
          displayRemoveCardToLeavePrompt
          resetPollsToPausedText={resetPollsToPausedText}
          resetPollsToPaused={resetPollsToPaused}
          primaryText={
            <React.Fragment>
              To adjust settings for the current election, insert an election
              manager or poll worker card.
            </React.Fragment>
          }
          unconfigureMachine={unconfigureMachine}
          isMachineConfigured={isMachineConfigured}
          logOut={() => logOutMutation.mutate()}
          usbDriveStatus={usbDriveStatus}
          additionalButtons={
            <React.Fragment>
              <Button onPress={() => setIsDiagnosticsScreenOpen(true)}>
                Diagnostics
              </Button>
              <SignedHashValidationButton apiClient={apiClient} />
            </React.Fragment>
          }
        />
      </Main>
    </Screen>
  );
}
