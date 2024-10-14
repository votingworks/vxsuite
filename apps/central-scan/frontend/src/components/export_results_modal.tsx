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
import {
  ejectUsbDrive,
  exportCastVoteRecordsToUsbDrive,
  getUsbDriveStatus,
} from '../api';
import { InsertUsbDriveModal, UsbImage } from './insert_usb_drive_modal';

export interface Props {
  onClose: () => void;
  mode: 'cvrs' | 'backup';
}

enum ModalState {
  ERROR = 'error',
  SAVING = 'saving',
  DONE = 'done',
  INIT = 'init',
}

export function ExportResultsModal({
  onClose,
  mode,
}: Props): JSX.Element | null {
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
    exportCastVoteRecordsToUsbDriveMutation.mutate(
      { isMinimalExport: mode === 'cvrs' },
      {
        onSuccess: (result) => {
          if (result.isErr()) {
            setErrorMessage(userReadableMessageFromExportError(result.err()));
            setCurrentState(ModalState.ERROR);
          } else {
            setCurrentState(ModalState.DONE);
          }
        },
      }
    );
  }

  if (!usbDriveStatusQuery.isSuccess) {
    return null;
  }

  const usbDriveStatus = usbDriveStatusQuery.data;

  if (currentState === ModalState.ERROR) {
    return (
      <Modal
        title={`Failed to Save ${mode === 'cvrs' ? 'CVRs' : 'Backup'}`}
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
            mode === 'cvrs' ? (
              <P>
                Insert the USB drive into VxAdmin for adjudication and
                reporting.
              </P>
            ) : null
          }
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Close</Button>}
        />
      );
    }
    return (
      <Modal
        title={mode === 'cvrs' ? 'CVRs Saved' : 'Backup Saved'}
        content={
          mode === 'cvrs' ? (
            <P>
              Eject the USB drive and insert it into VxAdmin for adjudication
              and reporting.
            </P>
          ) : null
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
        content={
          <Loading>{mode === 'cvrs' ? 'Saving CVRs' : 'Saving Backup'}</Loading>
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
          message={`Insert a USB drive in order to save ${
            mode === 'cvrs' ? 'CVRs' : 'a backup'
          }.`}
          onClose={onClose}
        />
      );
    case 'mounted':
      return (
        <Modal
          title={mode === 'cvrs' ? 'Save CVRs' : 'Save Backup'}
          content={
            <React.Fragment>
              <UsbImage />
              <P>
                {mode === 'cvrs' ? 'CVRs' : 'A backup'} will be saved to the
                inserted USB drive.
              </P>
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
