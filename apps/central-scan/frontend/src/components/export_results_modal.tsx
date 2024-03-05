import React, { useContext, useState } from 'react';

import {
  Button,
  Loading,
  Modal,
  P,
  UsbControllerButton,
  userReadableMessageFromExportError,
} from '@votingworks/ui';
import { isElectionManagerAuth } from '@votingworks/utils';

import { assert, throwIllegalValue } from '@votingworks/basics';
import { AppContext } from '../contexts/app_context';
import { ejectUsbDrive, exportCastVoteRecordsToUsbDrive } from '../api';
import { InsertUsbDriveModal, UsbImage } from './insert_usb_drive_modal';

export interface Props {
  onClose: () => void;
}

enum ModalState {
  ERROR = 'error',
  SAVING = 'saving',
  DONE = 'done',
  INIT = 'init',
}

export function ExportResultsModal({ onClose }: Props): JSX.Element {
  const [currentState, setCurrentState] = useState<ModalState>(ModalState.INIT);
  const [errorMessage, setErrorMessage] = useState('');

  const { usbDriveStatus, auth } = useContext(AppContext);
  assert(isElectionManagerAuth(auth));
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();
  const exportCastVoteRecordsToUsbDriveMutation =
    exportCastVoteRecordsToUsbDrive.useMutation();

  function exportResults() {
    setCurrentState(ModalState.SAVING);
    exportCastVoteRecordsToUsbDriveMutation.mutate(
      { isMinimalExport: true },
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
    if (usbDriveStatus.status === 'ejected') {
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
              usbDriveStatus={usbDriveStatus}
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

  // istanbul ignore next -- compile-time check
  if (currentState !== ModalState.INIT) {
    throwIllegalValue(currentState);
  }

  switch (usbDriveStatus.status) {
    case 'no_drive':
    case 'ejected':
    case 'error':
      return (
        <InsertUsbDriveModal
          message="Please insert a USB drive in order to save CVRs."
          onClose={onClose}
        />
      );
    case 'mounted':
      return (
        <Modal
          title="Save CVRs"
          content={
            <React.Fragment>
              <UsbImage />
              <P>CVRs will be saved to the mounted USB drive.</P>
            </React.Fragment>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button icon="Export" variant="primary" onPress={exportResults}>
                Save
              </Button>
              <Button onPress={onClose}>Cancel</Button>
            </React.Fragment>
          }
        />
      );
    // istanbul ignore next -- compile-time check
    default:
      throwIllegalValue(usbDriveStatus);
  }
}
