import { Result } from '@votingworks/types';
import {
  Button,
  Loading,
  Prose,
  USBControllerButton,
  UsbDrive,
} from '@votingworks/ui';
import {
  generateElectionBasedSubfolderName,
  SCANNER_BACKUPS_FOLDER,
  throwIllegalValue,
  usbstick,
} from '@votingworks/utils';
import { strict as assert } from 'assert';
import path from 'path';
import React, { useCallback, useContext, useState } from 'react';
import styled from 'styled-components';
import AppContext from '../contexts/AppContext';
import { download, DownloadError, DownloadErrorKind } from '../utils/download';
import Modal from './Modal';

const USBImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`;

export interface Props {
  onClose: () => void;
  usbDrive: UsbDrive;
}

enum ModalState {
  ERROR = 'error',
  SAVING = 'saving',
  DONE = 'done',
  INIT = 'init',
}

function ExportBackupModal({ onClose, usbDrive }: Props): JSX.Element {
  const [currentState, setCurrentState] = useState(ModalState.INIT);
  const [errorMessage, setErrorMessage] = useState('');

  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);

  const exportBackup = useCallback(
    async (openDialog: boolean) => {
      setCurrentState(ModalState.SAVING);

      let result: Result<void, DownloadError>;
      if (window.kiosk && !openDialog) {
        const usbPath = await usbstick.getDevicePath();
        if (!usbPath) {
          setErrorMessage('No USB drive found.');
          setCurrentState(ModalState.ERROR);
          return;
        }
        const electionFolderName = generateElectionBasedSubfolderName(
          electionDefinition.election,
          electionDefinition.electionHash
        );
        const pathToFolder = path.join(
          usbPath,
          SCANNER_BACKUPS_FOLDER,
          electionFolderName
        );
        result = await download('/scan/backup', { into: pathToFolder });
        setCurrentState(result.isOk() ? ModalState.DONE : ModalState.ERROR);
      } else {
        result = await download('/scan/backup');
      }

      if (result.isOk()) {
        setCurrentState(ModalState.DONE);
      } else {
        const error = result.err();
        switch (error.kind) {
          case DownloadErrorKind.FetchFailed:
          case DownloadErrorKind.FileMissing:
            setErrorMessage(
              `Unable to get backup: ${error.kind} (status=${error.response.statusText})`
            );
            break;

          case DownloadErrorKind.OpenFailed:
            setErrorMessage(
              `Unable to write file to download location: ${error.path}`
            );
            break;

          default:
            // nothing to do
            break;
        }
        setCurrentState(ModalState.ERROR);
      }
    },
    [electionDefinition.election, electionDefinition.electionHash]
  );

  if (currentState === ModalState.ERROR) {
    return (
      <Modal
        content={
          <Prose>
            <h1>Download Failed</h1>
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
              <h1>Download Complete</h1>
              <p>USB drive successfully ejected.</p>
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
            <h1>Download Complete</h1>
            <p>
              Backup file saved successfully! You may now eject the USB drive.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            <Button onPress={onClose}>Cancel</Button>
            <USBControllerButton
              small={false}
              primary
              usbDriveStatus={usbDrive.status ?? usbstick.UsbDriveStatus.absent}
              usbDriveEject={usbDrive.eject}
            />
          </React.Fragment>
        }
      />
    );
  }

  if (currentState === ModalState.SAVING) {
    return <Modal content={<Loading />} onOverlayClick={onClose} />;
  }

  /* istanbul ignore next - compile time check for completeness */
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
            <Prose>
              <h1>No USB Drive Detected</h1>
              <p>
                <USBImage
                  src={`${process.env.PUBLIC_URL}/assets/usb-stick.svg`}
                  onDoubleClick={() => exportBackup(true)}
                  alt="Insert USB Image"
                />
                Please insert a USB drive in order to export the scanner backup.
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
                  onPress={() => exportBackup(true)}
                >
                  Export
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
          actions={
            <React.Fragment>
              <Button onPress={onClose}>Cancel</Button>
            </React.Fragment>
          }
        />
      );
    case usbstick.UsbDriveStatus.mounted:
      return (
        <Modal
          content={
            <Prose>
              <h1>Export Backup</h1>
              <USBImage
                src={`${process.env.PUBLIC_URL}/assets/usb-stick.svg`}
                onDoubleClick={() => exportBackup(true)}
                alt="Insert USB Image"
              />
              <p>
                A ZIP file will automatically be saved to the default location
                on the mounted USB drive. Optionally, you may pick a custom
                export location.
              </p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button primary onPress={() => exportBackup(false)}>
                Export
              </Button>
              <Button onPress={onClose}>Cancel</Button>
              <Button onPress={() => exportBackup(true)}>Custom</Button>
            </React.Fragment>
          }
        />
      );
    default:
      throwIllegalValue(usbDrive.status);
  }
}

export default ExportBackupModal;
