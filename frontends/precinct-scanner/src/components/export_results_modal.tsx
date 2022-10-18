import React, { useCallback, useContext, useState } from 'react';
import styled from 'styled-components';

import {
  Button,
  Prose,
  Loading,
  Modal,
  UsbControllerButton,
  UsbDrive,
  isElectionManagerAuth,
  isPollWorkerAuth,
} from '@votingworks/ui';
import { assert, throwIllegalValue, usbstick } from '@votingworks/utils';
import { AppContext } from '../contexts/app_context';
import { saveCvrExportToUsb } from '../utils/save_cvr_export_to_usb';

const UsbImage = styled.img`
  margin: 0 auto;
  height: 200px;
`;

export interface Props {
  onClose: () => void;
  usbDrive: UsbDrive;
  scannedBallotCount: number;
  isTestMode: boolean;
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
  scannedBallotCount,
  isTestMode,
}: Props): JSX.Element {
  const [currentState, setCurrentState] = useState<ModalState>(ModalState.INIT);
  const [errorMessage, setErrorMessage] = useState('');

  const { electionDefinition, machineConfig, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth) || isPollWorkerAuth(auth));
  const userRole = auth.user.role;

  const exportResults = useCallback(
    async (openDialog: boolean) => {
      setCurrentState(ModalState.SAVING);
      try {
        await saveCvrExportToUsb({
          electionDefinition,
          machineConfig,
          scannedBallotCount,
          isTestMode,
          openFilePickerDialog: openDialog,
        });
        setCurrentState(ModalState.DONE);
      } catch (error) {
        assert(error instanceof Error);
        setErrorMessage(`Failed to save CVRs. ${error.message}`);
        setCurrentState(ModalState.ERROR);
      }
    },
    [electionDefinition, isTestMode, machineConfig, scannedBallotCount]
  );

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
    if (usbDrive.status === usbstick.UsbDriveStatus.recentlyEjected) {
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
              usbDriveStatus={
                usbDrive.status ?? usbstick.UsbDriveStatus.notavailable
              }
              usbDriveEject={() => usbDrive.eject(userRole)}
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

  if (currentState !== ModalState.INIT) {
    throwIllegalValue(currentState);
  }

  switch (usbDrive.status) {
    case undefined:
    case usbstick.UsbDriveStatus.absent:
    case usbstick.UsbDriveStatus.notavailable:
    case usbstick.UsbDriveStatus.recentlyEjected:
      // When run not through kiosk mode let the user download the file
      // on the machine for internal debugging use
      return (
        <Modal
          content={
            <Prose textCenter>
              <h1>No USB Drive Detected</h1>
              <p>
                Please insert a USB drive in order to save CVRs.
                <UsbImage
                  src="/assets/usb-drive.svg"
                  alt="Insert USB Image"
                  // hidden feature to save with file dialog by double-clicking
                  onDoubleClick={() => exportResults(true)}
                />
              </p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button onPress={onClose}>Cancel</Button>
              {!window.kiosk && (
                <Button
                  data-testid="manual-export"
                  onPress={() => exportResults(true)}
                  disabled // Not currently supported
                >
                  Save
                </Button>
              )}{' '}
            </React.Fragment>
          }
        />
      );
    case usbstick.UsbDriveStatus.ejecting:
    case usbstick.UsbDriveStatus.present:
      return (
        <Modal
          content={<Loading />}
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Cancel</Button>}
        />
      );
    case usbstick.UsbDriveStatus.mounted:
      return (
        <Modal
          content={
            <Prose>
              <h1>Save CVRs</h1>
              <UsbImage src="/assets/usb-drive.svg" alt="Insert USB Image" />
              <p>
                A CVR file will automatically be saved to the default location
                on the mounted USB drive. Optionally, you may pick a custom save
                location.
              </p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button primary onPress={() => exportResults(false)}>
                Save
              </Button>
              <Button onPress={onClose}>Cancel</Button>
              <Button onPress={() => exportResults(true)}>Custom</Button>
            </React.Fragment>
          }
        />
      );
    default:
      throwIllegalValue(usbDrive.status);
  }
}
