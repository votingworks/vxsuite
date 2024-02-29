import React from 'react';
import {
  ExportLogsButton,
  SystemAdministratorScreenContents,
} from '@votingworks/ui';
import {
  isFeatureFlagEnabled,
  BooleanEnvironmentVariableName,
} from '@votingworks/utils';
import { ElectionDefinition, PollsState } from '@votingworks/types';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { Screen } from '../components/layout';
import { LiveCheckButton } from '../components/live_check_button';
import { transitionPolls, unconfigureElection, logOut } from '../api';
import { getCurrentTime } from '../utils/get_current_time';
import { usePreviewContext } from '../preview_dashboard';

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
  const transitionPollsMutation = transitionPolls.useMutation();
  const unconfigureMutation = unconfigureElection.useMutation();
  const logOutMutation = logOut.useMutation();

  const additionalButtons = (
    <React.Fragment>
      {isFeatureFlagEnabled(BooleanEnvironmentVariableName.LIVECHECK) ? (
        <LiveCheckButton />
      ) : undefined}
      <ExportLogsButton usbDriveStatus={usbDrive} />
    </React.Fragment>
  );

  return (
    <Screen title="System Administrator" voterFacing={false} padded>
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
            ? () =>
                transitionPollsMutation.mutateAsync({
                  type: 'pause_voting',
                  time: getCurrentTime(),
                })
            : undefined
        }
        isMachineConfigured={Boolean(electionDefinition)}
        logOut={() => logOutMutation.mutate()}
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
