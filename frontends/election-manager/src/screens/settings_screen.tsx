import React, { useContext, useState } from 'react';
import { v4 as uuid } from 'uuid';
import {
  CurrentDateAndTime,
  Prose,
  RebootFromUsbButton,
  RebootToBiosButton,
  Button,
  SetClockButton,
  Modal,
} from '@votingworks/ui';

import { AppContext } from '../contexts/app_context';
import { NavigationScreen } from '../components/navigation_screen';

export function SettingsScreen(): JSX.Element {
  const { logger, usbDriveStatus, usbDriveEject, usbDriveFormat } =
    useContext(AppContext);
  const [showFormatModal, setShowFormatModal] = useState(false);

  async function formatUsb() {
    if (!window.kiosk || !usbDriveFormat) {
      return;
    }

    await usbDriveEject('system'); // a temporary hack so we don't have to pass down the auth here, this is just used for logging.
    await usbDriveFormat(`vx-${uuid().substring(0, 5)}`);
    setShowFormatModal(false);
  }

  function onClose() {
    setShowFormatModal(false);
  }

  const formatButtonEnabled =
    usbDriveStatus === 'present' || usbDriveStatus === 'mounted';
  if (!formatButtonEnabled && showFormatModal) {
    setShowFormatModal(false);
  }

  return (
    <NavigationScreen>
      <Prose maxWidth={false}>
        <h1>Settings</h1>
        <h2>Current Date and Time</h2>
        <p>
          <SetClockButton>
            <CurrentDateAndTime />
          </SetClockButton>
        </p>
        <h2>Software Update</h2>
        <p>
          <RebootFromUsbButton
            logger={logger}
            usbDriveStatus={usbDriveStatus}
          />{' '}
          or <RebootToBiosButton logger={logger} />
        </p>
        <h2>USB Sticks</h2>
        <p>
          <Button
            disabled={!formatButtonEnabled}
            onPress={() => setShowFormatModal(true)}
          >
            Format USB Stick
          </Button>
        </p>
      </Prose>
      {showFormatModal && (
        <Modal
          centerContent
          content={
            <Prose textCenter>
              <p>Do you want to format this USB stick?</p>
              <p>All data on the USB stick will be removed.</p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button danger onPress={formatUsb}>
                Format USB Stick
              </Button>
              <Button onPress={onClose}>Cancel</Button>
            </React.Fragment>
          }
        />
      )}
    </NavigationScreen>
  );
}
