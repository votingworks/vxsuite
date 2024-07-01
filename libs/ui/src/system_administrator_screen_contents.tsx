import React from 'react';
import { isVxDev } from '@votingworks/utils';

import styled from 'styled-components';
import { UsbDriveStatus } from '@votingworks/usb-drive';
import { Button } from './button';
import { RebootToBiosButton } from './reboot_to_bios_button';
import { UnconfigureMachineButton } from './unconfigure_machine_button';
import { ResetPollsToPausedButton } from './reset_polls_to_paused_button';
import { P } from './typography';
import { PowerDownButton } from './power_down_button';
import { SetClockButton } from './set_clock';
import { ExportLogsButton } from './export_logs_modal';

interface Props {
  displayRemoveCardToLeavePrompt?: boolean;
  primaryText: React.ReactNode;
  unconfigureMachine: () => Promise<void>;
  resetPollsToPausedText?: string;
  resetPollsToPaused?: () => Promise<void>;
  isMachineConfigured: boolean;
  logOut: () => void;
  usbDriveStatus: UsbDriveStatus;
  additionalButtons?: React.ReactNode;
}

const ButtonGrid = styled.div`
  display: grid;
  grid-auto-rows: 1fr;
  grid-gap: max(${(p) => p.theme.sizes.minTouchAreaSeparationPx}px, 0.25rem);
  grid-template-columns: 1fr 1fr;

  @media (orientation: landscape) {
    grid-template-columns: 1fr 1fr 1fr;
  }

  button {
    flex-wrap: nowrap;
    white-space: nowrap;
  }
`;

/**
 * A component for system administrator (formerly super admin) screen contents on non-VxAdmin
 * machines
 */
export function SystemAdministratorScreenContents({
  displayRemoveCardToLeavePrompt,
  primaryText,
  unconfigureMachine,
  resetPollsToPausedText,
  resetPollsToPaused,
  isMachineConfigured,
  logOut,
  additionalButtons,
  usbDriveStatus,
}: Props): JSX.Element {
  return (
    <React.Fragment>
      <P>{primaryText}</P>
      {displayRemoveCardToLeavePrompt && (
        <P>Remove the System Administrator card to leave this screen.</P>
      )}
      <ButtonGrid>
        {resetPollsToPausedText && (
          <ResetPollsToPausedButton
            resetPollsToPausedText={resetPollsToPausedText}
            resetPollsToPaused={resetPollsToPaused}
          />
        )}
        <SetClockButton logOut={logOut}>Set Date and Time</SetClockButton>
        <RebootToBiosButton />
        <PowerDownButton />
        <UnconfigureMachineButton
          unconfigureMachine={unconfigureMachine}
          isMachineConfigured={isMachineConfigured}
        />
        <ExportLogsButton usbDriveStatus={usbDriveStatus} />
        {additionalButtons}
        {isVxDev() && (
          <Button onPress={() => window.kiosk?.quit()}>Quit</Button>
        )}
      </ButtonGrid>
    </React.Fragment>
  );
}
