import React from 'react';
import { Logger } from '@votingworks/logging';
import { isVxDev } from '@votingworks/utils';

import { Button } from './button';
import { Main } from './main';
import { Prose } from './prose';
import { RebootFromUsbButton } from './reboot_from_usb_button';
import { RebootToBiosButton } from './reboot_to_bios_button';
import { UnconfigureMachineButton } from './unconfigure_machine_button';
import { ResetPollsToPausedButton } from './reset_polls_to_paused_button';
import { UsbDriveStatus } from './hooks/use_usb_drive';

interface Props {
  displayRemoveCardToLeavePrompt?: boolean;
  logger: Logger;
  primaryText: React.ReactNode;
  unconfigureMachine: () => Promise<void>;
  resetPollsToPausedText?: string;
  resetPollsToPaused?: () => Promise<void>;
  isMachineConfigured: boolean;
  usbDriveStatus: UsbDriveStatus;
}

/**
 * A component for system administrator (formerly super admin) screen contents on non-VxAdmin
 * machines
 */
export function SystemAdministratorScreenContents({
  displayRemoveCardToLeavePrompt,
  logger,
  primaryText,
  unconfigureMachine,
  resetPollsToPausedText,
  resetPollsToPaused,
  isMachineConfigured,
  usbDriveStatus,
}: Props): JSX.Element {
  return (
    <Main padded centerChild>
      <Prose textCenter>
        <p>{primaryText}</p>
        {displayRemoveCardToLeavePrompt && (
          <p>Remove the System Administrator card to leave this screen.</p>
        )}
        {resetPollsToPausedText && (
          <p>
            <ResetPollsToPausedButton
              resetPollsToPausedText={resetPollsToPausedText}
              resetPollsToPaused={resetPollsToPaused}
              logger={logger}
            />
          </p>
        )}
        <p>
          <RebootFromUsbButton
            usbDriveStatus={usbDriveStatus}
            logger={logger}
          />
        </p>
        <p>
          <RebootToBiosButton logger={logger} />
        </p>
        <p>
          <UnconfigureMachineButton
            unconfigureMachine={unconfigureMachine}
            isMachineConfigured={isMachineConfigured}
          />
        </p>
        {isVxDev() && (
          <p>
            <Button onPress={() => window.kiosk?.quit()}>Quit</Button>
          </p>
        )}
      </Prose>
    </Main>
  );
}
