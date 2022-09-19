import React, { useContext, useEffect, useState } from 'react';
import { join } from 'path';
import {
  assert,
  usbstick,
  throwIllegalValue,
  generateLogFilename,
  LogFileType,
  sleep,
} from '@votingworks/utils';

import {
  LogEventId,
  LOGS_ROOT_LOCATION,
  LOG_NAME,
  FULL_LOG_PATH,
} from '@votingworks/logging';
import {
  Button,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
  Modal,
  Prose,
} from '@votingworks/ui';
import { AppContext } from '../contexts/app_context';
import { LinkButton } from './link_button';
import { Loading } from './loading';
import { UsbImage } from './save_file_to_usb';

const { UsbDriveStatus } = usbstick;

export interface Props {
  onClose: () => void;
  logFileType: LogFileType;
}

enum ModalState {
  Error = 'error',
  Saving = 'saving',
  Done = 'done',
  Init = 'init',
}

export function ExportLogsModal({ onClose, logFileType }: Props): JSX.Element {
  const { usbDriveStatus, auth, logger, electionDefinition, machineConfig } =
    useContext(AppContext);
  assert(isSystemAdministratorAuth(auth) || isElectionManagerAuth(auth)); // TODO(auth) should this check for a specific user type
  const userRole = auth.user.role;

  const [currentState, setCurrentState] = useState(ModalState.Init);
  const [errorMessage, setErrorMessage] = useState('');

  const [savedFilename, setSavedFilename] = useState('');
  const [foundLogFile, setFoundLogFile] = useState(false);
  const [isLocatingLogFile, setIsLocatingLogFile] = useState(true);

  useEffect(() => {
    async function checkLogFile() {
      if (window.kiosk) {
        const allLogs = await window.kiosk.getFileSystemEntries(
          LOGS_ROOT_LOCATION
        );
        const vxLogFile = allLogs.filter((f) => f.name === `${LOG_NAME}.log`);
        if (vxLogFile.length > 0) {
          setFoundLogFile(true);
          await logger.log(LogEventId.SaveLogFileFound, userRole, {
            disposition: 'success',
            message:
              'Successfully located vx-logs.log file on machine to save.',
          });
        } else {
          setFoundLogFile(false);
          await logger.log(LogEventId.SaveLogFileFound, userRole, {
            disposition: 'failure',
            message:
              'Could not locate vx-logs.log file on machine. Machine is not configured for production use.',
            result: 'Logs are not saveable.',
          });
        }
        setIsLocatingLogFile(false);
      }
    }
    void checkLogFile();
  }, [userRole, logger]);
  const defaultFilename = generateLogFilename('vx-logs', logFileType);

  async function exportResults(openFileDialog: boolean) {
    assert(window.kiosk);
    setCurrentState(ModalState.Saving);

    try {
      const rawLogFile = await window.kiosk.readFile(FULL_LOG_PATH, 'utf8');
      let results = '';
      switch (logFileType) {
        case LogFileType.Raw:
          results = rawLogFile;
          break;
        case LogFileType.Cdf: {
          assert(electionDefinition !== undefined);
          results = logger.buildCDFLog(
            electionDefinition,
            rawLogFile,
            machineConfig.machineId,
            machineConfig.codeVersion,
            userRole
          );
          break;
        }
        /* istanbul ignore next - compile time check for completeness */
        default:
          throwIllegalValue(logFileType);
      }
      let filenameLocation = '';
      const usbPath = await usbstick.getDevicePath();
      if (openFileDialog) {
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
        assert(typeof usbPath !== 'undefined');
        const pathToFile = join(usbPath, defaultFilename);
        await window.kiosk.writeFile(pathToFile, results);
        filenameLocation = defaultFilename;
      }

      setSavedFilename(filenameLocation);
      await sleep(2000);
      await logger.log(LogEventId.FileSaved, userRole, {
        disposition: 'success',
        message: `Successfully saved log file to ${filenameLocation} on the usb drive.`,
        fileType: 'logs',
        filename: filenameLocation,
      });
      setCurrentState(ModalState.Done);
    } catch (error) {
      assert(error instanceof Error);
      setErrorMessage(error.message);
      await logger.log(LogEventId.FileSaved, userRole, {
        disposition: 'failure',
        message: `Error saving log file: ${error.message}`,
        result: 'File not saved, error message shown to user.',
        fileType: 'logs',
      });
      setCurrentState(ModalState.Error);
    }
  }

  if (currentState === ModalState.Error) {
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

  if (currentState === ModalState.Done) {
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
        actions={<LinkButton onPress={onClose}>Close</LinkButton>}
      />
    );
  }

  if (currentState === ModalState.Saving) {
    return <Modal content={<Loading>Saving Logs</Loading>} />;
  }

  if (currentState !== ModalState.Init) {
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
      // When run not through kiosk mode let the user save the file
      // on the machine for internal debugging use
      return (
        <Modal
          content={
            <Prose>
              <h1>No USB Drive Detected</h1>
              <p>
                <UsbImage src="/assets/usb-drive.svg" alt="Insert USB Image" />
                Please insert a USB drive where you would like the save the log
                file.
              </p>
            </Prose>
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
              <h1>Save Logs</h1>
              <p>
                Save the log file as <strong>{defaultFilename}</strong> directly
                on the inserted USB drive?
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
