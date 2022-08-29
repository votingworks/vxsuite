import React from 'react';

import { Logger } from '@votingworks/logging';
import { Screen, SystemAdministratorScreenContents } from '@votingworks/ui';
import { usbstick } from '@votingworks/utils';

interface Props {
  logger: Logger;
  unconfigureMachine: () => Promise<void>;
  isMachineConfigured: boolean;
  usbDriveStatus: usbstick.UsbDriveStatus;
}

/**
 * Screen when a system administrator card is inserted
 */
export function SystemAdministratorScreen({
  logger,
  unconfigureMachine,
  isMachineConfigured,
  usbDriveStatus,
}: Props): JSX.Element {
  return (
    <Screen white>
      <SystemAdministratorScreenContents
        displayRemoveCardToLeavePrompt
        logger={logger}
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
