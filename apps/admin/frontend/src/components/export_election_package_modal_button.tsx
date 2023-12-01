import React, { useContext, useState } from 'react';
import styled from 'styled-components';
import {
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { Button, Modal, P, UsbControllerButton } from '@votingworks/ui';
import type { ExportDataError } from '@votingworks/admin-backend';

import {
  ejectUsbDrive,
  saveElectionPackageToUsb as saveElectionPackageToUsbBase,
} from '../api';
import { AppContext } from '../contexts/app_context';

const UsbImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`;

type SaveState =
  | { state: 'unsaved' }
  | { state: 'saving' }
  | { state: 'saved' }
  | { state: 'error'; error: ExportDataError };

const ErrorMessages: Record<ExportDataError['type'], string> = {
  'file-system-error': 'Error reading from USB',
  'missing-usb-drive': 'No USB drive detected',
  'permission-denied': 'Error reading from USB',
  'relative-file-path': 'Error reading from USB',
};

export function ExportElectionPackageModalButton(): JSX.Element {
  const { electionDefinition, usbDriveStatus, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth) || isSystemAdministratorAuth(auth));
  const saveElectionPackageToUsbMutation =
    saveElectionPackageToUsbBase.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();

  const [saveState, setSaveState] = useState<SaveState>({ state: 'unsaved' });

  const [isModalOpen, setIsModalOpen] = useState(false);

  function closeModal() {
    setIsModalOpen(false);
    setSaveState({ state: 'unsaved' });
  }

  async function saveElectionPackageToUsb() {
    const result = await saveElectionPackageToUsbMutation.mutateAsync();
    if (result.isErr()) {
      setSaveState({ state: 'error', error: result.err() });
      return;
    }
    setSaveState({ state: 'saved' });
  }

  let title = '';
  let mainContent: React.ReactNode = null;
  let actions: React.ReactNode = null;

  switch (saveState.state) {
    case 'unsaved':
      switch (usbDriveStatus.status) {
        case 'no_drive':
        case 'ejected':
        case 'error':
          actions = <Button onPress={closeModal}>Cancel</Button>;
          title = 'No USB Drive Detected';
          mainContent = (
            <P>
              <UsbImage src="/assets/usb-drive.svg" alt="Insert USB Image" />
              Please insert a USB drive in order to save the ballot
              configuration.
            </P>
          );
          break;
        case 'mounted': {
          actions = (
            <React.Fragment>
              <Button
                icon="Export"
                onPress={saveElectionPackageToUsb}
                variant="primary"
              >
                Save
              </Button>
              <Button onPress={closeModal}>Cancel</Button>
            </React.Fragment>
          );
          title = 'Save Election Package';
          mainContent = (
            <P>
              <UsbImage src="/assets/usb-drive.svg" alt="Insert USB Image" />A
              zip archive will automatically be saved to the default location on
              the mounted USB drive.
            </P>
          );
          break;
        }

        default:
          throwIllegalValue(usbDriveStatus, 'status');
      }
      break;

    case 'saving': {
      actions = (
        <Button onPress={closeModal} disabled>
          Cancel
        </Button>
      );
      title = 'Saving…';
      mainContent = <P>Closing zip file.</P>;
      break;
    }

    case 'saved': {
      if (usbDriveStatus.status !== 'ejected') {
        actions = (
          <React.Fragment>
            <UsbControllerButton
              primary
              usbDriveEject={() => ejectUsbDriveMutation.mutate()}
              usbDriveStatus={usbDriveStatus}
              usbDriveIsEjecting={ejectUsbDriveMutation.isLoading}
            />
            <Button onPress={closeModal}>Close</Button>
          </React.Fragment>
        );
      } else {
        actions = <Button onPress={closeModal}>Close</Button>;
      }
      title = 'Election Package Saved';
      mainContent = (
        <P>
          You may now eject the USB drive. Use the saved election package on
          this USB drive to configure VxScan or VxCentralScan.
        </P>
      );
      break;
    }

    case 'error': {
      actions = <Button onPress={closeModal}>Close</Button>;
      title = 'Failed to Save Election Package';
      mainContent = (
        <P>An error occurred: {ErrorMessages[saveState.error.type]}.</P>
      );
      break;
    }

    default:
      // nothing to do
      break;
  }

  return (
    <React.Fragment>
      <Button
        variant="primary"
        icon="Export"
        onPress={() => setIsModalOpen(true)}
      >
        Save Election Package
      </Button>
      {isModalOpen && (
        <Modal
          title={title}
          content={mainContent}
          onOverlayClick={closeModal}
          actions={actions}
        />
      )}
    </React.Fragment>
  );
}
