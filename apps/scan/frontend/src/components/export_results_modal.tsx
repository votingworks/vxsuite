import React, { useState } from 'react';

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
            <P>
              Insert the USB drive into VxAdmin for adjudication and reporting.
            </P>
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
          <P>Eject the USB drive for adjudication and reporting at VxAdmin.</P>
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

  /* istanbul ignore next - compile time check @preserve */
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
          content={<P>Insert a USB drive in order to save CVRs.</P>}
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Cancel</Button>}
        />
      );
    case 'mounted':
      return (
        <Modal
          title="Save CVRs"
          content={<P>CVRs will be saved to the inserted USB drive.</P>}
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
    /* istanbul ignore next - compile time check @preserve */
    default:
      throwIllegalValue(usbDrive, 'status');
  }
}
