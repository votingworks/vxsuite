import React, { useState } from 'react';

import {
  Button,
  ElectionInfoBar,
  H3,
  Main,
  Screen,
  SignedHashValidationButton,
  SystemAdministratorScreenContents,
} from '@votingworks/ui';
import { UsbDriveStatus } from '@votingworks/usb-drive';
import type { MachineConfig } from '@votingworks/mark-backend';
import { ElectionDefinition, PrecinctSelection } from '@votingworks/types';
import { logOut, useApiClient } from '../api';
import { DiagnosticsScreen } from './diagnostics_screen';

const resetPollsToPausedText =
  'The polls are closed and voting is complete. After resetting the polls to paused, it will be possible to re-open the polls and resume voting. The printed ballots count will be preserved.';

interface Props {
  unconfigureMachine: () => Promise<void>;
  isMachineConfigured: boolean;
  resetPollsToPaused?: () => Promise<void>;
  usbDriveStatus: UsbDriveStatus;
  electionDefinition?: ElectionDefinition;
  electionPackageHash?: string;
  machineConfig: MachineConfig;
  precinctSelection?: PrecinctSelection;
}

/**
 * Screen when a system administrator card is inserted
 */
export function SystemAdministratorScreen({
  unconfigureMachine,
  isMachineConfigured,
  resetPollsToPaused,
  usbDriveStatus,
  electionDefinition,
  electionPackageHash,
  machineConfig,
  precinctSelection,
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
        <H3 as="h1">System Administrator Menu</H3>
        <SystemAdministratorScreenContents
          additionalButtons={
            <React.Fragment>
              <Button onPress={() => setIsDiagnosticsScreenOpen(true)}>
                Diagnostics
              </Button>
              <SignedHashValidationButton apiClient={apiClient} />
            </React.Fragment>
          }
          displayRemoveCardToLeavePrompt
          resetPollsToPausedText={resetPollsToPausedText}
          resetPollsToPaused={resetPollsToPaused}
          primaryText={
            <React.Fragment>
              To adjust settings for the current election, please insert an
              election manager or poll worker card.
            </React.Fragment>
          }
          unconfigureMachine={unconfigureMachine}
          isMachineConfigured={isMachineConfigured}
          usbDriveStatus={usbDriveStatus}
          logOut={() => logOutMutation.mutate()}
        />
      </Main>
      <ElectionInfoBar
        mode="admin"
        electionDefinition={electionDefinition}
        electionPackageHash={electionPackageHash}
        codeVersion={machineConfig.codeVersion}
        machineId={machineConfig.machineId}
        precinctSelection={precinctSelection}
      />
    </Screen>
  );
}
