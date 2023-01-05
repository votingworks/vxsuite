import { LogEventId, Logger } from '@votingworks/logging';
import { assert, throwIllegalValue } from '@votingworks/utils';
import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { Button } from './button';
import { UsbDriveStatus } from './hooks/use_usb_drive';
import { Loading } from './loading';
import { Modal } from './modal';
import { Prose } from './prose';

enum State {
  CLOSED = 'closed',
  NO_USB_INSERTED = 'no_usb_inserted',
  NO_BOOTABLE_USB_OPTION = 'no_bootable_usb_option',
  PREPARING_BOOT = 'preparing_boot',
  REBOOTING = 'rebooting',
}

const UsbImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`;

interface Props {
  usbDriveStatus: UsbDriveStatus;
  logger: Logger;
}

/**
 * Button that attempts to reboot the machine from a mounted, bootable USB drive if one exists.
 * Shows a prompt to insert a USB to the user when loaded with no mounted USB.
 * Prompts the user to reboot and try again when loaded with a mounted USB but window.kiosk.prepareToBootFromUsb returns false indicating there is no bootable usb option.
 */

export function RebootFromUsbButton({
  usbDriveStatus,
  logger,
}: Props): JSX.Element {
  const [currentState, setCurrentState] = useState(State.CLOSED);
  const attemptReboot = useCallback(async () => {
    assert(window.kiosk);
    await logger.log(
      LogEventId.PrepareBootFromUsbInit,
      'system_administrator',
      {
        message:
          'Attempting to set the USB drive next in the boot order and reboot',
      }
    );
    if (usbDriveStatus !== 'mounted') {
      setCurrentState(State.NO_USB_INSERTED);
      await logger.log(
        LogEventId.PrepareBootFromUsbComplete,
        'system_administrator',
        {
          message: 'No USB drive found, could not boot from usb',
          disposition: 'failure',
        }
      );
      return;
    }
    setCurrentState(State.PREPARING_BOOT);
    const readyToReboot = await window.kiosk.prepareToBootFromUsb();
    if (readyToReboot) {
      await logger.log(
        LogEventId.PrepareBootFromUsbComplete,
        'system_administrator',
        {
          message:
            'USB Drive successfully set next in the boot order for the next boot.',
          disposition: 'success',
        }
      );
      await logger.log(LogEventId.RebootMachine, 'system_administrator', {
        message: 'Machine will now reboot…',
      });
      setCurrentState(State.REBOOTING);
      await window.kiosk.reboot();
    } else {
      setCurrentState(State.NO_BOOTABLE_USB_OPTION);
      await logger.log(
        LogEventId.PrepareBootFromUsbComplete,
        'system_administrator',
        {
          message:
            'USB Drive not found in the list of bootable options, boot order is not modified.',
          disposition: 'failure',
        }
      );
    }
  }, [usbDriveStatus, logger]);
  async function reboot() {
    assert(window.kiosk);
    await logger.log(LogEventId.RebootMachine, 'system_administrator', {
      message: 'User trigged a reboot of the machine…',
    });
    setCurrentState(State.REBOOTING);
    await window.kiosk.reboot();
  }
  useEffect(() => {
    if (
      usbDriveStatus === 'mounted' &&
      currentState === State.NO_USB_INSERTED
    ) {
      void attemptReboot();
    }
  }, [usbDriveStatus, currentState, attemptReboot]);

  const onClose = useCallback(
    () => setCurrentState(State.CLOSED),
    [setCurrentState]
  );

  if (currentState === State.PREPARING_BOOT) {
    return <Modal content={<Loading>Preparing to boot…</Loading>} />;
  }
  if (currentState === State.REBOOTING) {
    return <Modal content={<Loading>Rebooting…</Loading>} />;
  }
  if (currentState === State.NO_BOOTABLE_USB_OPTION) {
    return (
      <Modal
        content={
          <Prose>
            The USB Drive was not found in the list of bootable devices. Make
            sure it is the correct USB drive and reboot the machine with it
            plugged in, then try again.
          </Prose>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            <Button primary onPress={reboot}>
              Reboot
            </Button>
            <Button onPress={onClose}>Close</Button>
          </React.Fragment>
        }
      />
    );
  }
  if (currentState === State.NO_USB_INSERTED) {
    return (
      <Modal
        content={
          <Prose>
            <h1>No USB Drive Detected</h1>
            <p>
              <UsbImage src="/assets/usb-drive.svg" alt="Insert USB Image" />
              Please insert a USB drive to boot from.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Cancel</Button>}
      />
    );
  }
  if (currentState === State.CLOSED) {
    return <Button onPress={attemptReboot}>Reboot from USB</Button>;
  }
  /* istanbul ignore next - compile time check for completeness */
  throwIllegalValue(currentState);
}
