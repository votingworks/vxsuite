import React, { useContext, useEffect, useState } from 'react';
import path from 'path';
import { usbstick, throwIllegalValue } from '@votingworks/utils';

import assert from 'assert';
import { LogEventId } from '@votingworks/logging';
import { AppContext } from '../contexts/app_context';
import { Modal } from './modal';
import { Button } from './button';
import { Prose } from './prose';
import { LinkButton } from './link_button';
import { Loading } from './loading';
import { MainChild } from './main';
import { UsbImage } from './save_file_to_usb';

const { UsbDriveStatus } = usbstick;

const LOGS_ROOT_LOCATION = '/var/log';
const LOG_NAME = 'vx-logs.log';

export interface Props {
  onClose: () => void;
}

enum ModalState {
  ERROR = 'error',
  SAVING = 'saving',
  DONE = 'done',
  INIT = 'init',
}

export function ExportLogsModal({ onClose }: Props): JSX.Element {
  const { usbDriveStatus, currentUserSession, logger } = useContext(AppContext);
  assert(currentUserSession); // TODO(auth) should this check for a specific user type

  const [currentState, setCurrentState] = useState(ModalState.INIT);
  const [errorMessage, setErrorMessage] = useState('');

  const [savedFilename, setSavedFilename] = useState('');
  const [foundLogFile, setFoundLogFile] = useState(false);
  const [isLocatingLogFile, setIsLocatingLogFile] = useState(true);

  useEffect(() => {
    async function checkLogFile() {
      assert(currentUserSession);
      if (window.kiosk) {
        const allLogs = await window.kiosk.getFileSystemEntries(
          LOGS_ROOT_LOCATION
        );
        const vxLogFile = allLogs.filter((f) => f.name === LOG_NAME);
        if (vxLogFile.length > 0) {
          setFoundLogFile(true);
          await logger.log(
            LogEventId.ExportLogFileFound,
            currentUserSession.type,
            {
              disposition: 'success',
              message:
                'Successfully located vx-logs.log file on machine to export.',
            }
          );
        } else {
          setFoundLogFile(false);
          await logger.log(
            LogEventId.ExportLogFileFound,
            currentUserSession.type,
            {
              disposition: 'failure',
              message:
                'Could not locate vx-logs.log file on machine. Machine is not configured for production use.',
              result: 'Logs are not exportable.',
            }
          );
        }
        setIsLocatingLogFile(false);
      }
    }
    void checkLogFile();
  }, [currentUserSession, logger]);

  async function exportResults(openFileDialog: boolean) {
    assert(window.kiosk);
    assert(currentUserSession); // TODO(auth) should this check for a specific user type
    setCurrentState(ModalState.SAVING);

    try {
      const results = await window.kiosk.readFile(
        `${LOGS_ROOT_LOCATION}/${LOG_NAME}`
      );
      let filenameLocation = '';
      const usbPath = await usbstick.getDevicePath();
      if (openFileDialog) {
        const fileWriter = await window.kiosk.saveAs({
          defaultPath: LOG_NAME,
        });

        if (!fileWriter) {
          throw new Error('could not begin download; no file was chosen');
        }

        await fileWriter.write(results);
        filenameLocation = fileWriter.filename;
        await fileWriter.end();
      } else {
        assert(typeof usbPath !== 'undefined');
        const pathToFile = path.join(usbPath, LOG_NAME);
        assert(window.kiosk);
        await window.kiosk.writeFile(pathToFile, results);
        filenameLocation = LOG_NAME;
      }

      setSavedFilename(filenameLocation);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await logger.log(LogEventId.FileSaved, currentUserSession.type, {
        disposition: 'success',
        message: `Successfully saved log file to ${filenameLocation} on the usb drive.`,
        fileType: 'logs',
        filename: filenameLocation,
      });
      setCurrentState(ModalState.DONE);
    } catch (error) {
      setErrorMessage(error.message);
      await logger.log(LogEventId.FileSaved, currentUserSession.type, {
        disposition: 'failure',
        message: `Error saving log file: ${error.message}`,
        result: 'File not saved, error message shown to user.',
        fileType: 'logs',
      });
      setCurrentState(ModalState.ERROR);
    }
  }

  if (currentState === ModalState.ERROR) {
    return (
      <Modal
        content={
          <Prose>
            <h1>Failed to Save Logs</h1>
            <p>Failed to save log file. {errorMessage}</p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={<LinkButton onPress={onClose}>Close</LinkButton>}
      />
    );
  }

  if (currentState === ModalState.DONE) {
    const actions = <LinkButton onPress={onClose}>Close</LinkButton>;
    return (
      <Modal
        content={
          <Prose>
            <h1>Logs Saved</h1>
            <p>
              Log file successfully saved{' '}
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
    return <Modal content={<Loading>Saving Logs</Loading>} />;
  }

  if (currentState !== ModalState.INIT) {
    throwIllegalValue(currentState);
  }

  if (isLocatingLogFile) {
    return (
      <Modal
        content={<Loading>Loading</Loading>}
        onOverlayClick={onClose}
        actions={<LinkButton onPress={onClose}>Close</LinkButton>}
      />
    );
  }

  if (!window.kiosk || !foundLogFile) {
    return (
      <Modal
        content={
          <Prose>
            <h1>No Log File Present</h1>
            <p>No log file detected on device.</p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={<LinkButton onPress={onClose}>Close</LinkButton>}
      />
    );
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
                <UsbImage src="/usb-drive.svg" alt="Insert USB Image" />
                Please insert a USB drive where you would like the save the log
                file.
              </p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <LinkButton onPress={onClose}>Cancel</LinkButton>
              {process.env.NODE_ENV === 'development' && (
                <Button
                  data-testid="manual-export"
                  onPress={() => exportResults(true)}
                >
                  Save
                </Button>
              )}{' '}
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
          actions={
            <React.Fragment>
              <LinkButton onPress={onClose}>Cancel</LinkButton>
            </React.Fragment>
          }
        />
      );
    case UsbDriveStatus.mounted: {
      return (
        <Modal
          content={
            <MainChild>
              <Prose>
                <h1>Save Logs</h1>
                <p>
                  Save the log file as <strong>{LOG_NAME}</strong> directly on
                  the inserted USB drive?
                </p>
              </Prose>
            </MainChild>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <LinkButton onPress={onClose}>Cancel</LinkButton>
              <Button onPress={() => exportResults(true)}>Save As…</Button>
              <Button primary onPress={() => exportResults(false)}>
                Save
              </Button>
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
