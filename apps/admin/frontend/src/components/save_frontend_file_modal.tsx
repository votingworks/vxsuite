import React, { useContext, useState } from 'react';
import styled from 'styled-components';
import { join } from 'path';
import fileDownload from 'js-file-download';
import { assert, throwIllegalValue, sleep } from '@votingworks/basics';
import {
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';

import {
  Button,
  Modal,
  UsbControllerButton,
  P,
  Font,
  ModalWidth,
} from '@votingworks/ui';

import { LogEventId } from '@votingworks/logging';
import { PromiseOr } from '@votingworks/types';
import { AppContext } from '../contexts/app_context';
import { Loading } from './loading';
import { ejectUsbDrive } from '../api';

export const UsbImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`;

export enum FileType {
  TallyReport = 'TallyReport',
  BallotCountReport = 'BallotCountReport',
  WriteInAdjudicationReport = 'WriteInAdjudicationReport',
  Ballot = 'Ballot',
  Results = 'Results',
}

export interface Props {
  onClose: () => void;
  generateFileContent: () => PromiseOr<Uint8Array | string>;
  defaultFilename: string;
  fileType: FileType;
  defaultDirectory?: string;
  promptToEjectUsb?: boolean;
}

enum ModalState {
  ERROR = 'error',
  SAVING = 'saving',
  DONE = 'done',
  INIT = 'init',
}

export function SaveFrontendFileModal({
  onClose,
  generateFileContent,
  defaultFilename,
  fileType,
  defaultDirectory = '',
  promptToEjectUsb = false,
}: Props): JSX.Element {
  const { usbDriveStatus, isOfficialResults, auth, logger } =
    useContext(AppContext);
  assert(isElectionManagerAuth(auth) || isSystemAdministratorAuth(auth)); // TODO(auth) should this check for a specific user type
  const userRole = auth.user.role;

  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();

  const [currentState, setCurrentState] = useState(ModalState.INIT);
  const [errorMessage, setErrorMessage] = useState('');

  const [savedFilename, setSavedFilename] = useState('');

  let title = ''; // Will be used in headings like Save Title
  let fileName = ''; // Will be used in sentence like "Would you like to save the title?"
  switch (fileType) {
    case FileType.TallyReport:
      title = `${isOfficialResults ? 'Official' : 'Unofficial'} Tally Report`;
      fileName = 'tally report';
      break;
    case FileType.BallotCountReport:
      title = `${
        isOfficialResults ? 'Official' : 'Unofficial'
      } Ballot Count Report`;
      fileName = 'ballot count report';
      break;
    case FileType.Ballot:
      title = 'Ballot';
      fileName = 'ballot';
      break;
    case FileType.Results:
      title = 'Results';
      fileName = 'election results';
      break;
    case FileType.WriteInAdjudicationReport:
      title = `${
        isOfficialResults ? 'Official' : 'Unofficial'
      } Write-In Adjudication Report`;
      fileName = 'write-in adjudication report';
      break;
    default:
      throwIllegalValue(fileType);
  }

  async function exportResults(openFileDialog: boolean) {
    setCurrentState(ModalState.SAVING);

    try {
      const results = await generateFileContent();
      let filenameLocation = '';
      if (!window.kiosk) {
        fileDownload(results, defaultFilename, 'text/csv');
      } else if (openFileDialog) {
        const fileWriter = await window.kiosk.saveAs({
          defaultPath: defaultFilename,
        });

        if (!fileWriter) {
          throw new Error('could not save; no file was chosen');
        }

        await fileWriter.write(results);
        filenameLocation = fileWriter.filename;
        await fileWriter.end();
      } else {
        assert(usbDriveStatus.status === 'mounted');
        const usbPath = usbDriveStatus.mountPoint;
        assert(typeof usbPath !== 'undefined');
        assert(window.kiosk);

        if (defaultDirectory) {
          const pathToFolder = join(usbPath, defaultDirectory);
          await window.kiosk.makeDirectory(pathToFolder, {
            recursive: true,
          });
        }

        const pathToFile = join(usbPath, defaultDirectory, defaultFilename);
        await window.kiosk.writeFile(pathToFile, results);
        filenameLocation = defaultFilename;
      }

      setSavedFilename(filenameLocation);
      await sleep(2000);
      await logger.log(LogEventId.FileSaved, userRole, {
        disposition: 'success',
        message: `Successfully saved ${fileName} to ${filenameLocation} on the usb drive.`,
        fileType,
        filename: filenameLocation,
      });
      setCurrentState(ModalState.DONE);
    } catch (error) {
      assert(error instanceof Error);
      setErrorMessage(error.message);
      await logger.log(LogEventId.FileSaved, userRole, {
        disposition: 'failure',
        message: `Error saving ${fileName}: ${error.message}`,
        result: 'File not saved, error message shown to user.',
        fileType,
      });
      setCurrentState(ModalState.ERROR);
    }
  }

  if (currentState === ModalState.ERROR) {
    return (
      <Modal
        title={`Failed to Save ${title}`}
        content={
          <P>
            Failed to save {fileName}. {errorMessage}
          </P>
        }
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  if (currentState === ModalState.DONE) {
    let actions = <Button onPress={onClose}>Close</Button>;
    if (promptToEjectUsb && usbDriveStatus.status !== 'ejected') {
      actions = (
        <React.Fragment>
          <UsbControllerButton
            primary
            usbDriveStatus={usbDriveStatus}
            usbDriveEject={() => ejectUsbDriveMutation.mutate()}
            usbDriveIsEjecting={ejectUsbDriveMutation.isLoading}
          />
          <Button onPress={onClose}>Close</Button>
        </React.Fragment>
      );
    }
    return (
      <Modal
        title={`${title} Saved`}
        content={
          <React.Fragment>
            {promptToEjectUsb && <P>You may now eject the USB drive.</P>}
            <P>
              {fileName.charAt(0).toUpperCase() + fileName.slice(1)}{' '}
              successfully saved{' '}
              {savedFilename !== '' && (
                <span>
                  as <Font weight="bold">{savedFilename}</Font>
                </span>
              )}{' '}
              on the inserted USB drive.
            </P>
          </React.Fragment>
        }
        onOverlayClick={onClose}
        actions={actions}
      />
    );
  }

  if (currentState === ModalState.SAVING) {
    return (
      <Modal
        centerContent
        modalWidth={ModalWidth.Wide}
        content={<Loading>Saving {title}</Loading>}
      />
    );
  }

  if (currentState !== ModalState.INIT) {
    throwIllegalValue(currentState);
  }

  switch (usbDriveStatus.status) {
    case 'no_drive':
    case 'ejected':
    case 'error':
      // When run not through kiosk mode let the user save the file
      // on the machine for internal debugging use
      return (
        <Modal
          title="No USB Drive Detected"
          content={
            <P>
              <UsbImage src="/assets/usb-drive.svg" alt="Insert USB Image" />
              Please insert a USB drive where you would like the save the{' '}
              {fileName}.
            </P>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              {process.env.NODE_ENV === 'development' && (
                <Button
                  data-testid="manual-export"
                  onPress={() => exportResults(true)}
                >
                  Save
                </Button>
              )}
              <Button onPress={onClose}>Cancel</Button>
            </React.Fragment>
          }
        />
      );
    case 'mounted': {
      return (
        <Modal
          title={`Save ${title}`}
          content={
            <P>
              Save the {fileName} as{' '}
              <Font weight="bold">{defaultFilename}</Font> on the inserted USB
              drive?
            </P>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button variant="primary" onPress={() => exportResults(false)}>
                Save
              </Button>
              <Button onPress={onClose}>Cancel</Button>
              <Button onPress={() => exportResults(true)}>Save As…</Button>
            </React.Fragment>
          }
        />
      );
    }
    default:
      throwIllegalValue(usbDriveStatus, 'status');
  }
}
