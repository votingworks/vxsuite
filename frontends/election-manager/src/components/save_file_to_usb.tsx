import React, { useContext, useState } from 'react';
import styled from 'styled-components';
import { join } from 'path';
import fileDownload from 'js-file-download';
import { assert, usbstick, throwIllegalValue, sleep } from '@votingworks/utils';

import {
  Modal,
  UsbControllerButton,
  Prose,
  isAdminAuth,
  isSuperadminAuth,
} from '@votingworks/ui';

import { LogEventId } from '@votingworks/logging';
import { PromiseOr } from '@votingworks/types';
import { AppContext } from '../contexts/app_context';
import { Button } from './button';
import { LinkButton } from './link_button';
import { Loading } from './loading';

const { UsbDriveStatus } = usbstick;

export const UsbImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`;

export enum FileType {
  TallyReport = 'TallyReport',
  TestDeckTallyReport = 'TestDeckTallyReport',
  Ballot = 'Ballot',
  Results = 'Results',
  BatchResultsCsv = 'BatchResultsCSV',
}

export interface Props {
  onClose: () => void;
  generateFileContent: () => PromiseOr<Uint8Array | string>;
  defaultFilename: string;
  fileType: FileType;
  promptToEjectUsb?: boolean;
}

enum ModalState {
  ERROR = 'error',
  SAVING = 'saving',
  DONE = 'done',
  INIT = 'init',
}

export function SaveFileToUsb({
  onClose,
  generateFileContent,
  defaultFilename,
  fileType,
  promptToEjectUsb = false,
}: Props): JSX.Element {
  const { usbDriveStatus, usbDriveEject, isOfficialResults, auth, logger } =
    useContext(AppContext);
  assert(isAdminAuth(auth) || isSuperadminAuth(auth)); // TODO(auth) should this check for a specific user type
  const userRole = auth.user.role;

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
    case FileType.TestDeckTallyReport:
      title = 'Test Deck Tally Report';
      fileName = 'test deck tally report';
      break;
    case FileType.Ballot:
      title = 'Ballot';
      fileName = 'ballot';
      break;
    case FileType.Results:
      title = 'Results';
      fileName = 'election results';
      break;
    case FileType.BatchResultsCsv:
      title = 'Batch Results';
      fileName = 'election batch results';
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
      } else {
        const usbPath = await usbstick.getDevicePath();
        if (openFileDialog) {
          const fileWriter = await window.kiosk.saveAs({
            defaultPath: defaultFilename,
          });

          if (!fileWriter) {
            throw new Error('could not begin download; no file was chosen');
          }

          await fileWriter.write(results);
          filenameLocation = fileWriter.filename;
          await fileWriter.end();
        } else {
          assert(typeof usbPath !== 'undefined');
          const pathToFile = join(usbPath, defaultFilename);
          assert(window.kiosk);
          await window.kiosk.writeFile(pathToFile, results);
          filenameLocation = defaultFilename;
        }
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
        content={
          <Prose>
            <h1>Failed to Save {title}</h1>
            <p>
              Failed to save {fileName}. {errorMessage}
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={<LinkButton onPress={onClose}>Close</LinkButton>}
      />
    );
  }

  if (currentState === ModalState.DONE) {
    let actions = <LinkButton onPress={onClose}>Close</LinkButton>;
    if (promptToEjectUsb && usbDriveStatus !== UsbDriveStatus.recentlyEjected) {
      actions = (
        <React.Fragment>
          <UsbControllerButton
            small={false}
            primary
            usbDriveStatus={usbDriveStatus}
            usbDriveEject={() => usbDriveEject(userRole)}
          />
          <LinkButton onPress={onClose}>Close</LinkButton>
        </React.Fragment>
      );
    }
    return (
      <Modal
        content={
          <Prose>
            <h1>{title} Saved</h1>
            {promptToEjectUsb && <p>You may now eject the USB drive.</p>}
            <p>
              {fileName.charAt(0).toUpperCase() + fileName.slice(1)}{' '}
              successfully saved{' '}
              {savedFilename !== '' && (
                <span>
                  as <strong>{savedFilename}</strong>
                </span>
              )}{' '}
              on the inserted USB drive.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={actions}
      />
    );
  }

  if (currentState === ModalState.SAVING) {
    return <Modal content={<Loading>Saving {title}</Loading>} />;
  }

  if (currentState !== ModalState.INIT) {
    throwIllegalValue(currentState);
  }

  switch (usbDriveStatus) {
    case UsbDriveStatus.absent:
    case UsbDriveStatus.notavailable:
    case UsbDriveStatus.recentlyEjected:
      // When run not through kiosk mode let the user download the file
      // on the machine for internal debugging use
      return (
        <Modal
          content={
            <Prose>
              <h1>No USB Drive Detected</h1>
              <p>
                <UsbImage src="/assets/usb-drive.svg" alt="Insert USB Image" />
                Please insert a USB drive where you would like the save the{' '}
                {fileName}.
              </p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              {(!window.kiosk || process.env.NODE_ENV === 'development') && (
                <Button
                  data-testid="manual-export"
                  onPress={() => exportResults(true)}
                >
                  Save
                </Button>
              )}
              <LinkButton onPress={onClose}>Cancel</LinkButton>
            </React.Fragment>
          }
        />
      );
    case UsbDriveStatus.ejecting:
    case UsbDriveStatus.present:
      return (
        <Modal
          content={<Loading />}
          onOverlayClick={onClose}
          actions={<LinkButton onPress={onClose}>Cancel</LinkButton>}
        />
      );
    case UsbDriveStatus.mounted: {
      return (
        <Modal
          content={
            <Prose>
              <h1>Save {title}</h1>
              <p>
                Save the {fileName} as <strong>{defaultFilename}</strong>{' '}
                directly on the inserted USB drive?
              </p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button primary onPress={() => exportResults(false)}>
                Save
              </Button>
              <LinkButton onPress={onClose}>Cancel</LinkButton>
              <Button onPress={() => exportResults(true)}>Save As…</Button>
            </React.Fragment>
          }
        />
      );
    }
    default:
      // Creates a compile time check to make sure this switch statement includes all enum values for UsbDriveStatus
      throwIllegalValue(usbDriveStatus);
  }
}
