import React, { useContext, useState } from 'react';
import styled from 'styled-components';
import {
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { Button, Modal, Prose, UsbControllerButton } from '@votingworks/ui';
import { BallotPackageExportError } from '@votingworks/types';

import { saveBallotPackageToUsb as saveBallotPackageToUsbBase } from '../api';
import { AppContext } from '../contexts/app_context';
import { Loading } from './loading';

const UsbImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`;

type SaveState =
  | { state: 'unsaved' }
  | { state: 'saving' }
  | { state: 'saved' }
  | { state: 'error'; error: BallotPackageExportError };

const ErrorMessages: Record<BallotPackageExportError, string> = {
  no_usb_drive: 'No USB drive detected',
};

export function ExportElectionBallotPackageModalButton(): JSX.Element {
  const { electionDefinition, usbDrive, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth) || isSystemAdministratorAuth(auth));
  const userRole = auth.user.role;
  const saveBallotPackageToUsbMutation =
    saveBallotPackageToUsbBase.useMutation();

  const [saveState, setSaveState] = useState<SaveState>({ state: 'unsaved' });

  const [isModalOpen, setIsModalOpen] = useState(false);

  function closeModal() {
    setIsModalOpen(false);
    setSaveState({ state: 'unsaved' });
  }

  async function saveBallotPackageToUsb() {
    const result = await saveBallotPackageToUsbMutation.mutateAsync();
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
      switch (usbDrive.status) {
        case 'absent':
        case 'ejected':
        case 'bad_format':
          actions = <Button onPress={closeModal}>Cancel</Button>;
          title = 'No USB Drive Detected';
          mainContent = (
            <Prose>
              <p>
                <UsbImage src="/assets/usb-drive.svg" alt="Insert USB Image" />
                Please insert a USB drive in order to save the ballot
                configuration.
              </p>
            </Prose>
          );
          break;
        case 'ejecting':
        case 'mounting':
          mainContent = <Loading />;
          actions = (
            <Button onPress={closeModal} disabled>
              Cancel
            </Button>
          );
          break;
        case 'mounted': {
          actions = (
            <React.Fragment>
              <Button onPress={saveBallotPackageToUsb} variant="primary">
                Save
              </Button>
              <Button onPress={closeModal}>Cancel</Button>
            </React.Fragment>
          );
          title = 'Save Ballot Package';
          mainContent = (
            <Prose>
              <p>
                <UsbImage src="/assets/usb-drive.svg" alt="Insert USB Image" />A
                zip archive will automatically be saved to the default location
                on the mounted USB drive.
              </p>
            </Prose>
          );
          break;
        }

        default:
          throwIllegalValue(usbDrive.status);
      }
      break;

    case 'saving': {
      actions = (
        <Button onPress={closeModal} disabled>
          Cancel
        </Button>
      );
      title = 'Saving…';
      mainContent = (
        <Prose>
          <p>Closing zip file.</p>
        </Prose>
      );
      break;
    }

    case 'saved': {
      if (usbDrive.status !== 'ejected') {
        actions = (
          <React.Fragment>
            <UsbControllerButton
              primary
              small={false}
              usbDriveEject={() => usbDrive.eject(userRole)}
              usbDriveStatus={usbDrive.status}
            />
            <Button onPress={closeModal}>Close</Button>
          </React.Fragment>
        );
      } else {
        actions = <Button onPress={closeModal}>Close</Button>;
      }
      title = 'Ballot Package Saved';
      mainContent = (
        <Prose>
          <p>
            You may now eject the USB drive. Use the saved ballot package on
            this USB drive to configure VxScan or VxCentralScan.
          </p>
        </Prose>
      );
      break;
    }

    case 'error': {
      actions = <Button onPress={closeModal}>Close</Button>;
      title = 'Failed to Save Ballot Package';
      mainContent = (
        <Prose>
          <p>An error occurred: {ErrorMessages[saveState.error]}.</p>
        </Prose>
      );
      break;
    }

    default:
      // nothing to do
      break;
  }

  return (
    <React.Fragment>
      <Button small onPress={() => setIsModalOpen(true)}>
        Save Ballot Package
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
