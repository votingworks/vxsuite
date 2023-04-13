import { throwIllegalValue } from '@votingworks/basics';
import {
  Button,
  Loading,
  Modal,
  P,
  Prose,
  UsbControllerButton,
  UsbDrive,
} from '@votingworks/ui';
import { usbstick } from '@votingworks/utils';
import React, { useState } from 'react';
import styled from 'styled-components';
import { backupToUsbDrive } from '../api';

const UsbImage = styled.img`
  margin: 0 auto;
  height: 200px;
`;

export interface ExportBackupModalProps {
  onClose: () => void;
  usbDrive: UsbDrive;
}

enum ModalState {
  ERROR = 'error',
  SAVING = 'saving',
  DONE = 'done',
  INIT = 'init',
}

const DEFAULT_ERROR = 'Failed to save backup.';

export function ExportBackupModal({
  onClose,
  usbDrive,
}: ExportBackupModalProps): JSX.Element {
  const backupToUsbDriveMutation = backupToUsbDrive.useMutation();
  const [currentState, setCurrentState] = useState(ModalState.INIT);
  const [errorMessage, setErrorMessage] = useState('');

  async function exportBackup() {
    setCurrentState(ModalState.SAVING);

    const usbPath = await usbstick.getPath();
    if (!usbPath) {
      setErrorMessage('No USB drive found.');
      setCurrentState(ModalState.ERROR);
      return;
    }

    backupToUsbDriveMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result.isErr()) {
          setErrorMessage(result.err().message ?? DEFAULT_ERROR);
          setCurrentState(ModalState.ERROR);
        } else {
          setCurrentState(ModalState.DONE);
        }
      },
    });
  }

  if (currentState === ModalState.ERROR) {
    return (
      <Modal
        title="Failed to Save Backup"
        content={
          <Prose>
            <P>{errorMessage}</P>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  if (currentState === ModalState.DONE) {
    if (usbDrive.status === 'ejected') {
      return (
        <Modal
          title="Backup Saved"
          content={
            <Prose>
              <P>USB drive successfully ejected.</P>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Close</Button>}
        />
      );
    }

    return (
      <Modal
        title="Backup Saved"
        content={
          <Prose>
            <P>
              Backup file saved successfully! You may now eject the USB drive.
            </P>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            <UsbControllerButton
              small={false}
              primary
              usbDriveStatus={usbDrive.status}
              usbDriveEject={() => usbDrive.eject('election_manager')}
            />
            <Button onPress={onClose}>Cancel</Button>
          </React.Fragment>
        }
      />
    );
  }

  if (currentState === ModalState.SAVING) {
    return <Modal content={<Loading>Saving Backup</Loading>} />;
  }

  /* istanbul ignore next - compile time check for completeness */
  if (currentState !== ModalState.INIT) {
    throwIllegalValue(currentState);
  }

  switch (usbDrive.status) {
    case 'absent':
    case 'ejected':
    case 'bad_format':
      // When run not through kiosk mode let the user save the file
      // on the machine for internal debugging use
      return (
        <Modal
          title="No USB Drive Detected"
          content={
            <Prose>
              <P>
                Please insert a USB drive to save the backup.
                <UsbImage src="/assets/usb-drive.svg" alt="Insert USB Image" />
              </P>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Cancel</Button>}
        />
      );
    case 'ejecting':
    case 'mounting':
      return (
        <Modal
          content={<Loading />}
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Cancel</Button>}
        />
      );
    case 'mounted':
      return (
        <Modal
          title="Save Backup"
          content={
            <Prose>
              <UsbImage src="/assets/usb-drive.svg" alt="Insert USB Image" />
              <P>
                A ZIP file will automatically be saved to the default location
                on the mounted USB drive.
              </P>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button variant="primary" onPress={exportBackup}>
                Save
              </Button>
              <Button onPress={onClose}>Cancel</Button>
            </React.Fragment>
          }
        />
      );
    default:
      throwIllegalValue(usbDrive.status);
  }
}
