import { Result } from '@votingworks/types';
import {
  Button,
  isElectionManagerAuth,
  isPollWorkerAuth,
  Loading,
  Modal,
  Prose,
  UsbControllerButton,
  UsbDrive,
} from '@votingworks/ui';
import {
  assert,
  generateElectionBasedSubfolderName,
  SCANNER_BACKUPS_FOLDER,
  throwIllegalValue,
  usbstick,
} from '@votingworks/utils';
import { join } from 'path';
import React, { useCallback, useContext, useState } from 'react';
import styled from 'styled-components';
import { AppContext } from '../contexts/app_context';
import { download, DownloadError, DownloadErrorKind } from '../utils/download';

const UsbImage = styled.img`
  margin: 0 auto;
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

export function ExportBackupModal({ onClose, usbDrive }: Props): JSX.Element {
  const [currentState, setCurrentState] = useState(ModalState.INIT);
  const [errorMessage, setErrorMessage] = useState('');

  const { electionDefinition, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth) || isPollWorkerAuth(auth));
  const userRole = auth.user.role;

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
        const pathToFolder = join(
          usbPath,
          SCANNER_BACKUPS_FOLDER,
          electionFolderName
        );
        result = await download('/precinct-scanner/backup', {
          directory: pathToFolder,
        });
      } else {
        result = await download('/precinct-scanner/backup');
      }

      if (window.kiosk) {
        // Backups can take several minutes. Ensure the data is flushed to the
        // usb before prompting the user to eject it.
        await usbstick.doSync();
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
              `Unable to write file to save location: ${error.path}`
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
            <h1>Failed to Save Backup</h1>
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
              <h1>Backup Saved</h1>
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
            <h1>Backup Saved</h1>
            <p>
              Backup file saved successfully! You may now eject the USB drive.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            <UsbControllerButton
              small={false}
              primary
              usbDriveStatus={usbDrive.status ?? usbstick.UsbDriveStatus.absent}
              usbDriveEject={() => usbDrive.eject(userRole)}
            />
            <Button onPress={onClose}>Cancel</Button>
          </React.Fragment>
        }
      />
    );
  }

  if (currentState === ModalState.SAVING) {
    return <Modal content={<Loading>Saving Backup</Loading>} />;
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
      // When run not through kiosk mode let the user save the file
      // on the machine for internal debugging use
      return (
        <Modal
          content={
            <Prose>
              <h1>No USB Drive Detected</h1>
              <p>
                Please insert a USB drive to save the backup.
                <UsbImage
                  src="/assets/usb-drive.svg"
                  alt="Insert USB Image"
                  // hidden feature to save with file dialog by double-clicking
                  onDoubleClick={() => exportBackup(true)}
                />
              </p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              {!window.kiosk && (
                <Button
                  data-testid="manual-export"
                  onPress={() => exportBackup(true)}
                  primary
                >
                  Save
                </Button>
              )}
              <Button onPress={onClose}>Cancel</Button>
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
              <h1>Save Backup</h1>
              <UsbImage
                src="/assets/usb-drive.svg"
                onDoubleClick={() => exportBackup(true)}
                alt="Insert USB Image"
              />
              <p>
                A ZIP file will automatically be saved to the default location
                on the mounted USB drive. Optionally, you may pick a custom save
                location.
              </p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button primary onPress={() => exportBackup(false)}>
                Save
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
