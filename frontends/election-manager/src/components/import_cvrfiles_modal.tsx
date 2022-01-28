import React, { useContext, useEffect, useState } from 'react';
import styled from 'styled-components';
import path from 'path';
import moment from 'moment';

import { Modal, Table, TD } from '@votingworks/ui';
import {
  assert,
  generateElectionBasedSubfolderName,
  SCANNER_RESULTS_FOLDER,
  usbstick,
} from '@votingworks/utils';
import { LogEventId } from '@votingworks/logging';

import { AppContext } from '../contexts/app_context';
import { Prose } from './prose';
import { LinkButton } from './link_button';
import { Loading } from './loading';
import {
  CastVoteRecordFile,
  CastVoteRecordFilePreprocessedData,
  InputEventFunction,
} from '../config/types';
import { FileInputButton } from './file_input_button';
import { MainChild } from './main';
import { TIME_FORMAT } from '../config/globals';

const { UsbDriveStatus } = usbstick;

const CvrFileTable = styled(Table)`
  margin-top: 20px;
`;

const UsbImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`;

const LabelText = styled.span`
  vertical-align: middle;
  text-transform: uppercase;
  font-size: 0.7rem;
  font-weight: 500;
`;

const TestMode = styled.span`
  color: #ff8c00;
`;

const ImportCvrsModalContent = styled.div`
  max-width: 45rem;
`;

enum ModalState {
  ERROR = 'error',
  DUPLICATE = 'duplicate',
  LOADING = 'loading',
  INIT = 'init',
  SUCCESS = 'success',
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
  const [importedFile, setImportedFile] = useState<CastVoteRecordFile>();
  const [foundFiles, setFoundFiles] = useState<
    CastVoteRecordFilePreprocessedData[]
  >([]);
  const { election, electionHash } = electionDefinition;

  async function importSelectedFile(
    fileData: CastVoteRecordFilePreprocessedData
  ) {
    setCurrentState(ModalState.LOADING);
    const newCastVoteRecordFiles = await castVoteRecordFiles.addFromFileData(
      fileData,
      election
    );
    await saveCastVoteRecordFiles(newCastVoteRecordFiles);

    if (newCastVoteRecordFiles.duplicateFiles.includes(fileData.name)) {
      setCurrentState(ModalState.DUPLICATE);
      await logger.log(LogEventId.CvrImported, currentUserType, {
        message:
          'CVR file was not imported as it is a duplicated of a previously imported file.',
        disposition: 'failure',
        filename: fileData.name,
        result: 'File not imported, error shown to user.',
      });
    } else if (newCastVoteRecordFiles.lastError?.filename === fileData.name) {
      setCurrentState(ModalState.ERROR);
      await logger.log(LogEventId.CvrImported, currentUserType, {
        message: `Failed to import CVR file: ${newCastVoteRecordFiles.lastError.message}`,
        disposition: 'failure',
        filename: fileData.name,
        error: newCastVoteRecordFiles.lastError.message,
        result: 'File not imported, error shown to user.',
      });
    } else {
      const file = newCastVoteRecordFiles.fileList.find(
        (f) => f.name === fileData.name
      );
      assert(file);
      await logger.log(LogEventId.CvrImported, currentUserType, {
        message: 'CVR file successfully imported.',
        disposition: 'success',
        filename: fileData.name,
        numberOfBallotsImported: file.importedCvrCount,
        duplicateBallotsIgnored: file.duplicatedCvrCount,
      });
      setImportedFile(file);
      setCurrentState(ModalState.SUCCESS);
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
          numberOfBallotsImported: file.importedCvrCount,
          duplicateBallotsIgnored: file.duplicatedCvrCount,
        });
        setImportedFile(file);
        setCurrentState(ModalState.SUCCESS);
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
      assert(electionDefinition !== undefined);
      const parsedFileInformation = (
        await castVoteRecordFiles.parseAllFromFileSystemEntries(
          newFoundFiles,
          electionDefinition.election
        )
      ).sort(
        (a, b) => b.exportTimestamp.getTime() - a.exportTimestamp.getTime()
      );
      setFoundFiles(parsedFileInformation);
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
            'No CVR files automatically found on USB drive. User allowed to import manually.',
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

  if (currentState === ModalState.SUCCESS) {
    assert(importedFile !== undefined);
    return (
      <Modal
        content={
          <Prose>
            <h1>{importedFile.importedCvrCount} new CVRs Imported</h1>
            {importedFile.duplicatedCvrCount > 0 && (
              <React.Fragment>
                <p>
                  Of the{' '}
                  {importedFile.importedCvrCount +
                    importedFile.duplicatedCvrCount}{' '}
                  total CVRs in this file, {importedFile.duplicatedCvrCount}{' '}
                  were previously imported.
                </p>
              </React.Fragment>
            )}
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
    // Determine if we are already locked to a filemode based on previously imported CVRs
    const fileMode = castVoteRecordFiles?.fileMode;
    const fileModeLocked = !!fileMode;

    // Parse the file options on the USB drive and build table rows for each valid file.
    const fileTableRows: JSX.Element[] = [];
    let numberOfNewFiles = 0;
    for (const file of foundFiles) {
      const {
        isTestModeResults,
        scannerIds,
        exportTimestamp,
        newCvrCount,
        importedCvrCount,
        name,
        fileImported,
      } = file;
      const inProperFileMode =
        !fileModeLocked ||
        (isTestModeResults && fileMode === 'test') ||
        (!isTestModeResults && fileMode === 'live');
      const canImport = !fileImported && inProperFileMode;
      const row = (
        <tr key={name} data-testid="table-row">
          <td>{moment(exportTimestamp).format(TIME_FORMAT)}</td>
          <td>{scannerIds.join(', ')}</td>
          <td data-testid="new-cvr-count">{newCvrCount}</td>
          <td data-testid="imported-cvr-count">{importedCvrCount}</td>
          {!fileModeLocked && (
            <td>
              <LabelText>
                {isTestModeResults ? <TestMode>Test</TestMode> : 'Live'}
              </LabelText>
            </td>
          )}
          <TD textAlign="right">
            <LinkButton
              onPress={() => importSelectedFile(file)}
              disabled={!canImport}
              small
              primary
            >
              {canImport ? 'Import' : 'Imported'}
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
      fileMode === 'test' ? (
        <TestMode>Test Mode</TestMode>
      ) : fileMode === 'live' ? (
        'Live Mode'
      ) : (
        ''
      );

    let instructionalText: JSX.Element | string;
    if (numberOfNewFiles === 0) {
      instructionalText = fileModeLocked ? (
        <React.Fragment>
          There were no new {headerModeText} CVR files automatically found on
          this USB drive. Export CVR files to this USB drive from the scanner.
          Optionally, you may manually select files to import.
        </React.Fragment>
      ) : (
        'There were no new CVR files automatically found on this USB drive. Export CVR files to this USB drive from the scanner. Optionally, you may manually select files to import.'
      );
    } else if (fileModeLocked) {
      instructionalText = (
        <React.Fragment>
          The following {headerModeText} CVR files were automatically found on
          this USB drive. Previously imported CVR entries will be ignored.
        </React.Fragment>
      );
    } else {
      instructionalText =
        'The following CVR files were automatically found on this USB drive. Previously imported CVR entries will be ignored.';
    }

    return (
      <Modal
        content={
          <ImportCvrsModalContent>
            <MainChild>
              <Prose maxWidth={false}>
                <h1 data-testid="modal-title">
                  Import {headerModeText} CVR Files{' '}
                </h1>
                <p>{instructionalText}</p>
              </Prose>
              {fileTableRows.length > 0 && (
                <CvrFileTable>
                  <thead>
                    <tr>
                      <th>Exported At</th>
                      <th>Scanner ID</th>
                      <th>New CVRs</th>
                      <th>Imported CVRs</th>
                      {!fileModeLocked && <th>Ballot Type</th>}
                      <th />
                    </tr>
                  </thead>
                  <tbody>{fileTableRows}</tbody>
                </CvrFileTable>
              )}
            </MainChild>
          </ImportCvrsModalContent>
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
