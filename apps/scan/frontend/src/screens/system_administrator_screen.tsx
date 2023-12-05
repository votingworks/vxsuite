import React from 'react';
import {
  ExportLogsButtonGroup,
  Main,
  SystemAdministratorScreenContents,
} from '@votingworks/ui';
import {
  isFeatureFlagEnabled,
  BooleanEnvironmentVariableName,
} from '@votingworks/utils';
import { AuthStatus } from '@votingworks/types/src/auth/inserted_smart_card_auth';
import { ElectionDefinition, PollsState } from '@votingworks/types';
import { Logger } from '@votingworks/logging';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import type { LogsResultType } from '@votingworks/backend';
import { Screen } from '../components/layout';
import { LiveCheckButton } from '../components/live_check_button';
import { transitionPolls, unconfigureElection, logOut } from '../api';

interface SystemAdministratorScreenProps {
  authStatus: AuthStatus;
  doExportLogs: () => Promise<LogsResultType>;
  electionDefinition?: ElectionDefinition;
  pollsState: PollsState;
  logger: Logger;
  usbDrive: UsbDriveStatus;
}

export function SystemAdministratorScreen({
  authStatus,
  doExportLogs,
  electionDefinition,
  pollsState,
  logger,
  usbDrive,
}: SystemAdministratorScreenProps): JSX.Element {
  const transitionPollsMutation = transitionPolls.useMutation();
  const unconfigureMutation = unconfigureElection.useMutation();
  const logOutMutation = logOut.useMutation();

  const additionalButtons = (
    <React.Fragment>
      {isFeatureFlagEnabled(BooleanEnvironmentVariableName.LIVECHECK) ? (
        <LiveCheckButton />
      ) : undefined}
      <ExportLogsButtonGroup
        usbDriveStatus={usbDrive}
        auth={authStatus}
        logger={logger}
        onExportLogs={doExportLogs}
      />
    </React.Fragment>
  );

  return (
    <Screen title="System Administrator">
      <Main padded>
        <SystemAdministratorScreenContents
          displayRemoveCardToLeavePrompt
          logger={logger}
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
              ? () =>
                  transitionPollsMutation.mutateAsync({
                    type: 'pause_voting',
                    time: Date.now(),
                  })
              : undefined
          }
          isMachineConfigured={Boolean(electionDefinition)}
          logOut={() => logOutMutation.mutate()}
          usbDriveStatus={usbDrive}
          additionalButtons={additionalButtons}
        />
      </Main>
    </Screen>
  );
}
