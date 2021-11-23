import React, { useContext, useEffect, useState } from 'react';
import styled from 'styled-components';
import path from 'path';
import moment from 'moment';

import {
  generateElectionBasedSubfolderName,
  parseCvrFileInfoFromFilename,
  SCANNER_RESULTS_FOLDER,
  usbstick,
} from '@votingworks/utils';
import { LogEventId } from '@votingworks/logging';
import { strict as assert } from 'assert';
import { Table, TD } from '@votingworks/ui';
import { AppContext } from '../contexts/app_context';
import { Modal } from './modal';
import { Prose } from './prose';
import { LinkButton } from './link_button';
import { Loading } from './loading';
import { InputEventFunction } from '../config/types';
import { FileInputButton } from './file_input_button';
import { MainChild } from './main';
import { CHECK_ICON, TIME_FORMAT } from '../config/globals';

const { UsbDriveStatus } = usbstick;

const CvrFileTable = styled(Table)`
  margin-top: 20px;
`;

const CheckTd = styled(TD)`
  line-height: 1rem;
  color: rgb(71, 167, 75);
  font-size: 1.5rem;
  font-weight: 700;
`;

const UsbImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`;

const Header = styled.h1`
  display: flex;
  justify-content: space-between;
`;

const LabelText = styled.span`
  vertical-align: middle;
  text-transform: uppercase;
  font-size: 0.7rem;
  font-weight: 500;
`;

enum ModalState {
  ERROR = 'error',
  DUPLICATE = 'duplicate',
  LOADING = 'loading',
  INIT = 'init',
}

export interface Props {
  onClose: () => void;
}

function throwBadStatus(s: never): never {
  throw new Error(`Bad status: ${s}`);
}

export function ImportCvrFilesModal({ onClose }: Props): JSX.Element {
  const {
    usbDriveStatus,
    saveCastVoteRecordFiles,
    castVoteRecordFiles,
    electionDefinition,
    currentUserSession,
    logger,
  } = useContext(AppContext);
  assert(electionDefinition);
  assert(currentUserSession); // TODO(auth) check permissions for importing cvr
  const currentUserType = currentUserSession.type;
  const [currentState, setCurrentState] = useState(ModalState.INIT);
  const [foundFiles, setFoundFiles] = useState<KioskBrowser.FileSystemEntry[]>(
    []
  );
  const { election, electionHash } = electionDefinition;

  async function importSelectedFile(fileEntry: KioskBrowser.FileSystemEntry) {
    setCurrentState(ModalState.LOADING);
    const newCastVoteRecordFiles = await castVoteRecordFiles.addAllFromFileSystemEntries(
      [fileEntry],
      election
    );
    await saveCastVoteRecordFiles(newCastVoteRecordFiles);

    if (newCastVoteRecordFiles.duplicateFiles.includes(fileEntry.name)) {
      setCurrentState(ModalState.DUPLICATE);
      await logger.log(LogEventId.CvrImported, currentUserType, {
        message:
          'CVR file was not imported as it is a duplicated of a previously imported file.',
        disposition: 'failure',
        filename: fileEntry.name,
        result: 'File not imported, error shown to user.',
      });
    } else if (newCastVoteRecordFiles.lastError?.filename === fileEntry.name) {
      setCurrentState(ModalState.ERROR);
      await logger.log(LogEventId.CvrImported, currentUserType, {
        message: `Failed to import CVR file: ${newCastVoteRecordFiles.lastError.message}`,
        disposition: 'failure',
        filename: fileEntry.name,
        error: newCastVoteRecordFiles.lastError.message,
        result: 'File not imported, error shown to user.',
      });
    } else {
      const file = newCastVoteRecordFiles.fileList.find(
        (f) => f.name === fileEntry.name
      );
      assert(file);
      await logger.log(LogEventId.CvrImported, currentUserType, {
        message: 'CVR file successfully imported.',
        disposition: 'success',
        filename: fileEntry.name,
        numberOfBallots: file.count,
      });
      onClose();
    }
  }

  const processCastVoteRecordFileFromFilePicker: InputEventFunction = async (
    event
  ) => {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    setCurrentState(ModalState.LOADING);

    if (files.length === 1) {
      const newCastVoteRecordFiles = await castVoteRecordFiles.addAll(
        files,
        election
      );
      await saveCastVoteRecordFiles(newCastVoteRecordFiles);

      input.value = '';
      const filename = files[0].name;

      if (newCastVoteRecordFiles.duplicateFiles.includes(filename)) {
        setCurrentState(ModalState.DUPLICATE);
        await logger.log(LogEventId.CvrImported, currentUserSession.type, {
          message:
            'CVR file was not imported as it is a duplicated of a previously imported file.',
          disposition: 'failure',
          filename,
          result: 'File not imported, error shown to user.',
        });
      } else if (newCastVoteRecordFiles.lastError?.filename === files[0].name) {
        setCurrentState(ModalState.ERROR);
        await logger.log(LogEventId.CvrImported, currentUserSession.type, {
          message: `Failed to import CVR file: ${newCastVoteRecordFiles.lastError.message}`,
          disposition: 'failure',
          filename,
          error: newCastVoteRecordFiles.lastError.message,
          result: 'File not imported, error shown to user.',
        });
      } else {
        const file = newCastVoteRecordFiles.fileList.find(
          (f) => f.name === filename
        );
        assert(file);
        await logger.log(LogEventId.CvrImported, currentUserSession.type, {
          message: 'CVR file successfully imported.',
          disposition: 'success',
          filename,
          numberOfBallots: file.count,
        });
        onClose();
      }
    } else {
      onClose();
    }
  };

  async function fetchFilenames() {
    setCurrentState(ModalState.LOADING);
    const usbPath = await usbstick.getDevicePath();
    try {
      assert(typeof usbPath !== 'undefined');
      assert(window.kiosk);
      const files = await window.kiosk.getFileSystemEntries(
        path.join(
          usbPath,
          SCANNER_RESULTS_FOLDER,
          generateElectionBasedSubfolderName(election, electionHash)
        )
      );
      const newFoundFiles = files.filter(
        (f) => f.type === 1 && f.name.endsWith('.jsonl')
      );
      setFoundFiles(newFoundFiles);
      await logger.log(LogEventId.CvrFilesReadFromUsb, currentUserType, {
        message: `Found ${newFoundFiles.length} CVR files on USB drive, user shown option to import.`,
        disposition: 'success',
      });
      setCurrentState(ModalState.INIT);
    } catch (err) {
      if (err.message.includes('ENOENT')) {
        // No files found
        setFoundFiles([]);
        setCurrentState(ModalState.INIT);
        await logger.log(LogEventId.CvrFilesReadFromUsb, currentUserType, {
          message:
            'No CVR files automatically found on usb drive. User allowed to import manually.',
          disposition: 'success',
          result: 'User allowed to manually select files.',
        });
      } else {
        await logger.log(LogEventId.CvrFilesReadFromUsb, currentUserType, {
          message: 'Error searching USB for CVR files.',
          disposition: 'failure',
          result: 'Error shown to user.',
        });
        throw err;
      }
    }
  }

  useEffect(() => {
    if (usbDriveStatus === usbstick.UsbDriveStatus.mounted) {
      void fetchFilenames();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usbDriveStatus]);

  if (currentState === ModalState.ERROR) {
    return (
      <Modal
        content={
          <Prose>
            <h1>Error</h1>
            <p>
              There was an error reading the content of the file{' '}
              <strong>{castVoteRecordFiles?.lastError?.filename}</strong>:{' '}
              {castVoteRecordFiles?.lastError?.message}. Please ensure this file
              only contains valid CVR data for this election.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            <LinkButton onPress={onClose}>Close</LinkButton>
          </React.Fragment>
        }
      />
    );
  }

  if (currentState === ModalState.DUPLICATE) {
    return (
      <Modal
        content={
          <Prose>
            <h1>Duplicate File</h1>
            <p>
              The selected file was ignored as a duplicate of a previously
              imported file.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={<LinkButton onPress={onClose}>Close</LinkButton>}
      />
    );
  }

  if (
    currentState === ModalState.LOADING ||
    usbDriveStatus === usbstick.UsbDriveStatus.ejecting ||
    usbDriveStatus === usbstick.UsbDriveStatus.present
  ) {
    return (
      <Modal
        content={<Loading />}
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            <LinkButton onPress={onClose} disabled>
              Cancel
            </LinkButton>
          </React.Fragment>
        }
      />
    );
  }

  if (
    usbDriveStatus === usbstick.UsbDriveStatus.absent ||
    usbDriveStatus === usbstick.UsbDriveStatus.notavailable ||
    usbDriveStatus === UsbDriveStatus.recentlyEjected
  ) {
    return (
      <Modal
        content={
          <Prose>
            <h1>No USB Drive Detected</h1>
            <p>
              <UsbImage src="usb-drive.svg" alt="Insert USB Image" />
              Please insert a USB drive in order to import CVR files from the
              scanner.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            <LinkButton onPress={onClose}>Cancel</LinkButton>
            {(!window.kiosk || process.env.NODE_ENV === 'development') && (
              <FileInputButton
                onChange={processCastVoteRecordFileFromFilePicker}
                data-testid="manual-input"
              >
                Select Files…
              </FileInputButton>
            )}{' '}
          </React.Fragment>
        }
      />
    );
  }

  if (usbDriveStatus === UsbDriveStatus.mounted) {
    // Parse information from the filenames and sort by exported timestamp
    const parsedFileInformation = foundFiles
      .flatMap((fileEntry) => {
        const parsedInfo = parseCvrFileInfoFromFilename(fileEntry.name);

        if (!parsedInfo) {
          return [];
        }

        return [
          {
            parsedInfo,
            fileEntry,
          },
        ];
      })
      .sort(
        (a, b) =>
          b.parsedInfo.timestamp.getTime() - a.parsedInfo.timestamp.getTime()
      );
    // Determine if we are already locked to a filemode based on previously imported CVRs
    const fileMode = castVoteRecordFiles?.fileMode;
    const fileModeLocked = !!fileMode;

    // Parse the file options on the USB drive and build table rows for each valid file.
    const fileTableRows = [];
    let numberOfNewFiles = 0;
    for (const { parsedInfo, fileEntry } of parsedFileInformation) {
      const {
        isTestModeResults,
        machineId,
        numberOfBallots,
        timestamp,
      } = parsedInfo;
      const isImported = castVoteRecordFiles.filenameAlreadyImported(
        fileEntry.name
      );
      const inProperFileMode =
        !fileModeLocked ||
        (isTestModeResults && fileMode === 'test') ||
        (!isTestModeResults && fileMode === 'live');
      const canImport = !isImported && inProperFileMode;
      const row = (
        <tr key={fileEntry.name} data-testid="table-row">
          <td>{moment(timestamp).format(TIME_FORMAT)}</td>
          <td>{machineId}</td>
          <td>{numberOfBallots}</td>
          <td>
            <LabelText>{isTestModeResults ? 'Test' : 'Live'}</LabelText>
          </td>
          <CheckTd narrow textAlign="center">
            {isImported ? CHECK_ICON : ''}
          </CheckTd>
          <TD textAlign="right">
            <LinkButton
              onPress={() => importSelectedFile(fileEntry)}
              disabled={!canImport}
              small
              primary
            >
              Select
            </LinkButton>
          </TD>
        </tr>
      );
      if (inProperFileMode) {
        fileTableRows.push(row);
        if (canImport) {
          numberOfNewFiles += 1;
        }
      }
    }
    // Set the header and instructional text for the modal
    const headerModeText =
      fileMode === 'test'
        ? 'Test Mode'
        : fileMode === 'live'
        ? 'Live Mode'
        : '';

    let instructionalText: string;
    if (numberOfNewFiles === 0) {
      instructionalText =
        'There were no new CVR files automatically found on this USB drive. Export CVR files to this USB drive from the scanner. Optionally, you may manually select files to import.';
    } else if (fileModeLocked) {
      instructionalText = `The following ${fileMode} mode CVR files were automatically found on this USB drive. Select which file to import or if you do not see the file you are looking for, you may manually select a file to import.`;
    } else {
      instructionalText =
        'The following CVR files were automatically found on this USB drive. Select which file to import or if you do not see the file you are looking for, you may manually select a file to import.';
    }

    return (
      <Modal
        className="import-cvr-modal"
        content={
          <MainChild>
            <Prose maxWidth={false}>
              <Header>Import {headerModeText} CVR Files </Header>
              <p>{instructionalText}</p>
            </Prose>
            {fileTableRows.length > 0 && (
              <CvrFileTable>
                <thead>
                  <tr>
                    <th>Exported At</th>
                    <th>Scanner ID</th>
                    <th>CVR Count</th>
                    <th>Ballot Type</th>
                    <th>Previously Imported?</th>
                    <th />
                  </tr>
                </thead>
                <tbody>{fileTableRows}</tbody>
              </CvrFileTable>
            )}
          </MainChild>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            <LinkButton onPress={onClose}>Cancel</LinkButton>
            <FileInputButton
              onChange={processCastVoteRecordFileFromFilePicker}
              data-testid="manual-input"
            >
              Select File Manually…
            </FileInputButton>
          </React.Fragment>
        }
      />
    );
  }
  // Creates a compile time check to make sure this switch statement includes all enum values for UsbDriveStatus
  throwBadStatus(usbDriveStatus);
}
