import React, { useState } from 'react';
import styled from 'styled-components';

import {
  Button,
  Loading,
  Modal,
  UsbControllerButton,
  P,
  userReadableMessageFromExportError,
} from '@votingworks/ui';
import { throwIllegalValue } from '@votingworks/basics';

import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { ejectUsbDrive, exportCastVoteRecordsToUsbDrive } from '../api';

const UsbImage = styled.img`
  margin: 0 auto;
  height: 200px;
`;

export interface ExportResultsModalProps {
  onClose: () => void;
  usbDrive: UsbDriveStatus;
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
  const exportCastVoteRecordsToUsbDriveMutation =
    exportCastVoteRecordsToUsbDrive.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();
  const [currentState, setCurrentState] = useState<ModalState>(ModalState.INIT);
  const [errorMessage, setErrorMessage] = useState('');

  function exportResults() {
    setCurrentState(ModalState.SAVING);
    exportCastVoteRecordsToUsbDriveMutation.mutate(
      { mode: 'full_export' },
      {
        onSuccess: (result) => {
          if (result.isErr()) {
            const errorDetails = userReadableMessageFromExportError(
              result.err()
            );
            setErrorMessage(`Failed to save CVRs. ${errorDetails}`);
            setCurrentState(ModalState.ERROR);
          } else {
            setCurrentState(ModalState.DONE);
          }
        },
      }
    );
  }

  if (currentState === ModalState.ERROR) {
    return (
      <Modal
        title="Failed to Save CVRs"
        content={<P>{errorMessage}</P>}
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  if (currentState === ModalState.DONE) {
    if (usbDrive.status === 'ejected') {
      return (
        <Modal
          title="USB Drive Ejected"
          content={
            <P>You may now take the USB drive to VxAdmin for tabulation.</P>
          }
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Close</Button>}
        />
      );
    }
    return (
      <Modal
        title="CVRs Saved"
        content={
          <P>
            You may now eject the USB drive and take it to VxAdmin for
            tabulation.
          </P>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            <UsbControllerButton
              primary
              usbDriveStatus={usbDrive}
              usbDriveEject={() => ejectUsbDriveMutation.mutate()}
              usbDriveIsEjecting={ejectUsbDriveMutation.isLoading}
            />
            <Button onPress={onClose}>Cancel</Button>
          </React.Fragment>
        }
      />
    );
  }

  if (currentState === ModalState.SAVING) {
    return <Modal content={<Loading>Saving CVRs</Loading>} />;
  }

  /* istanbul ignore next - compile time check */
  if (currentState !== ModalState.INIT) {
    throwIllegalValue(currentState);
  }

  switch (usbDrive.status) {
    case 'no_drive':
    case 'ejected':
    case 'error':
      return (
        <Modal
          title="No USB Drive Detected"
          content={
            <React.Fragment>
              <UsbImage src="/assets/usb-drive.svg" alt="Insert USB Image" />
              <P>Please insert a USB drive in order to save CVRs.</P>
            </React.Fragment>
          }
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Cancel</Button>}
        />
      );
    case 'mounted':
      return (
        <Modal
          title="Save CVRs"
          content={
            <React.Fragment>
              <UsbImage src="/assets/usb-drive.svg" alt="Insert USB Image" />
              <P>CVRs will be saved to the inserted USB drive.</P>
            </React.Fragment>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button variant="primary" onPress={exportResults}>
                Save
              </Button>
              <Button onPress={onClose}>Cancel</Button>
            </React.Fragment>
          }
        />
      );
    /* istanbul ignore next - compile time check */
    default:
      throwIllegalValue(usbDrive, 'status');
  }
}
