import React, { useContext, useState } from 'react';

import {
  Button,
  Icons,
  Modal,
  P,
  UsbControllerButton,
  userReadableMessageFromExportError,
} from '@votingworks/ui';
import { isElectionManagerAuth } from '@votingworks/utils';

import { assert, throwIllegalValue } from '@votingworks/basics';
import { AppContext } from '../contexts/app_context';
import {
  ejectUsbDrive,
  exportCastVoteRecordsToUsbDrive,
  getUsbDriveStatus,
} from '../api';
import { InsertUsbDriveModal } from './insert_usb_drive_modal';

export interface Props {
  onClose: () => void;
}

enum ModalState {
  ERROR = 'error',
  SAVING = 'saving',
  DONE = 'done',
  INIT = 'init',
}

export function ExportResultsModal({ onClose }: Props): JSX.Element | null {
  const [currentState, setCurrentState] = useState<ModalState>(ModalState.INIT);
  const [errorMessage, setErrorMessage] = useState('');

  const { auth } = useContext(AppContext);
  assert(isElectionManagerAuth(auth));
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();
  const exportCastVoteRecordsToUsbDriveMutation =
    exportCastVoteRecordsToUsbDrive.useMutation();

  function exportResults() {
    setCurrentState(ModalState.SAVING);
    exportCastVoteRecordsToUsbDriveMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result.isErr()) {
          setErrorMessage(userReadableMessageFromExportError(result.err()));
          setCurrentState(ModalState.ERROR);
        } else {
          setCurrentState(ModalState.DONE);
        }
      },
    });
  }

  if (!usbDriveStatusQuery.isSuccess) {
    return null;
  }

  const usbDriveStatus = usbDriveStatusQuery.data;

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
          <P>
            Eject the USB drive and insert it into VxAdmin for adjudication and
            reporting.
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
            <Button onPress={onClose}>Close</Button>
          </React.Fragment>
        }
      />
    );
  }

  if (currentState === ModalState.SAVING) {
    return (
      <Modal
        title="Saving CVRs…"
        content={
          <P>
            <Icons.Warning color="warning" /> Do not remove the USB drive.
          </P>
        }
      />
    );
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
          message="Insert a USB drive in order to save CVRs."
          onClose={onClose}
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
