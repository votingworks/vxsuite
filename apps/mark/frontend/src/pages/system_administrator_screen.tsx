import React from 'react';

import { Logger } from '@votingworks/logging';
import {
  Screen,
  SystemAdministratorScreenContents,
  UsbDriveStatus,
} from '@votingworks/ui';

const resetPollsToPausedText =
  'The polls are closed and voting is complete. After resetting the polls to paused, it will be possible to re-open the polls and resume voting. The printed ballots count will be preserved.';

interface Props {
  logger: Logger;
  unconfigureMachine: () => Promise<void>;
  isMachineConfigured: boolean;
  resetPollsToPaused?: () => Promise<void>;
  usbDriveStatus: UsbDriveStatus;
}

/**
 * Screen when a system administrator card is inserted
 */
export function SystemAdministratorScreen({
  logger,
  unconfigureMachine,
  isMachineConfigured,
  resetPollsToPaused,
  usbDriveStatus,
}: Props): JSX.Element {
  return (
    <Screen white>
      <SystemAdministratorScreenContents
        displayRemoveCardToLeavePrompt
        logger={logger}
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
        usbDriveStatus={usbDriveStatus}
      />
    </Screen>
  );
}
