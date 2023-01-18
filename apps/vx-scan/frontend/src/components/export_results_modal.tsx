import React, { useState } from 'react';
import styled from 'styled-components';

import {
  Button,
  Prose,
  Loading,
  Modal,
  UsbControllerButton,
  UsbDrive,
} from '@votingworks/ui';
import { throwIllegalValue } from '@votingworks/utils';
import { exportCastVoteRecordsToUsbDrive } from '../api';

const UsbImage = styled.img`
  margin: 0 auto;
  height: 200px;
`;

export interface ExportResultsModalProps {
  onClose: () => void;
  usbDrive: UsbDrive;
}

enum ModalState {
  ERROR = 'error',
  SAVING = 'saving',
  DONE = 'done',
  INIT = 'init',
}

export function ExportResultsModal({
  onClose,
  usbDrive,
}: ExportResultsModalProps): JSX.Element {
  const exportMutation = exportCastVoteRecordsToUsbDrive.useMutation();
  const [currentState, setCurrentState] = useState<ModalState>(ModalState.INIT);
  const [errorMessage, setErrorMessage] = useState('');

  function exportResults() {
    setCurrentState(ModalState.SAVING);
    exportMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result.isErr()) {
          setErrorMessage(`Failed to save CVRs. ${result.err().message}`);
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
        content={
          <Prose>
            <h1>Failed to Save CVRs</h1>
            <p>{errorMessage}</p>
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
          content={
            <Prose>
              <h1>USB Drive Ejected</h1>
              <p>You may now take the USB Drive to VxAdmin for tabulation.</p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Close</Button>}
        />
      );
    }
    return (
      <Modal
        content={
          <Prose>
            <h1>CVRs Saved to USB Drive</h1>
            <p>
              You may now eject the USB drive and take it to VxAdmin for
              tabulation.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            <Button onPress={onClose}>Cancel</Button>
            <UsbControllerButton
              small={false}
              primary
              usbDriveStatus={usbDrive.status}
              usbDriveEject={() => usbDrive.eject('election_manager')}
            />
          </React.Fragment>
        }
      />
    );
  }

  if (currentState === ModalState.SAVING) {
    return (
      <Modal
        content={<Loading>Saving CVRs</Loading>}
        onOverlayClick={onClose}
      />
    );
  }

  /* istanbul ignore next - compile time check */
  if (currentState !== ModalState.INIT) {
    throwIllegalValue(currentState);
  }

  switch (usbDrive.status) {
    case 'absent':
    case 'ejected':
    case 'bad_format':
      // When run not through kiosk mode let the user download the file
      // on the machine for internal debugging use
      return (
        <Modal
          content={
            <Prose textCenter>
              <h1>No USB Drive Detected</h1>
              <p>
                Please insert a USB drive in order to save CVRs.
                <UsbImage src="/assets/usb-drive.svg" alt="Insert USB Image" />
              </p>
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
          content={
            <Prose>
              <h1>Save CVRs</h1>
              <UsbImage src="/assets/usb-drive.svg" alt="Insert USB Image" />
              <p>
                A CVR file will automatically be saved to the default location
                on the mounted USB drive.
              </p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button primary onPress={exportResults}>
                Save
              </Button>
              <Button onPress={onClose}>Cancel</Button>
            </React.Fragment>
          }
        />
      );
    /* istanbul ignore next - compile time check */
    default:
      throwIllegalValue(usbDrive.status);
  }
}
