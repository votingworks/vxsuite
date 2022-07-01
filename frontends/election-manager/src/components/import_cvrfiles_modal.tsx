import React, { useContext, useEffect, useState } from 'react';
import styled from 'styled-components';
import { join } from 'path';
import moment from 'moment';

import {
  Modal,
  ModalWidth,
  Table,
  TD,
  Prose,
  isAdminAuth,
  isSuperadminAuth,
} from '@votingworks/ui';
import {
  assert,
  generateElectionBasedSubfolderName,
  SCANNER_RESULTS_FOLDER,
  usbstick,
} from '@votingworks/utils';
import { LogEventId } from '@votingworks/logging';

import { AppContext } from '../contexts/app_context';
import { LinkButton } from './link_button';
import { Loading } from './loading';
import {
  CastVoteRecordFile,
  CastVoteRecordFilePreprocessedData,
  InputEventFunction,
} from '../config/types';
import { FileInputButton } from './file_input_button';
import { TIME_FORMAT } from '../config/globals';
import {
  importCastVoteRecordFromFile,
  importCastVoteRecordFromFileData,
  parseAllFromFileSystemEntries,
} from '../utils/cast_vote_record_files';

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
    castVoteRecordFiles,
    refreshCastVoteRecordFiles,
    electionDefinition,
    auth,
    logger,
    importedBallotIds,
  } = useContext(AppContext);
  assert(electionDefinition);
  assert(isAdminAuth(auth) || isSuperadminAuth(auth)); // TODO(auth) check permissions for importing cvr
  const userRole = auth.user.role;
  const [currentState, setCurrentState] = useState(ModalState.INIT);
  const [importedFile, setImportedFile] = useState<CastVoteRecordFile>();
  const [foundFiles, setFoundFiles] = useState<
    CastVoteRecordFilePreprocessedData[]
  >([]);
  const [errorMessage, setErrorMessage] = useState<string>();
  const { election, electionHash } = electionDefinition;

  async function importSelectedFile(
    fileData: CastVoteRecordFilePreprocessedData
  ) {
    setCurrentState(ModalState.LOADING);
    try {
      const cvrFile = await importCastVoteRecordFromFileData(
        fileData,
        election,
        castVoteRecordFiles
      );
      await refreshCastVoteRecordFiles();

      await logger.log(LogEventId.CvrImported, userRole, {
        message: 'CVR file successfully imported.',
        disposition: 'success',
        filename: fileData.name,
        numberOfBallotsImported: cvrFile.importedCvrCount,
        duplicateBallotsIgnored: cvrFile.duplicatedCvrCount,
      });
      setImportedFile(cvrFile);
      setCurrentState(ModalState.SUCCESS);
    } catch (err) {
      assert(err instanceof Error);
      if (err.message === 'Duplicate File Imported.') {
        setCurrentState(ModalState.DUPLICATE);
        await logger.log(LogEventId.CvrImported, userRole, {
          message:
            'CVR file was not imported as it is a duplicated of a previously imported file.',
          disposition: 'failure',
          filename: fileData.name,
          result: 'File not imported, error shown to user.',
        });
        return;
      }
      setCurrentState(ModalState.ERROR);
      setErrorMessage(err.message);
      await logger.log(LogEventId.CvrImported, userRole, {
        message: `Failed to import CVR file: ${err.message}`,
        disposition: 'failure',
        filename: fileData.name,
        error: err.message,
        result: 'File not imported, error shown to user.',
      });
    }
  }

  const processCastVoteRecordFileFromFilePicker: InputEventFunction = async (
    event
  ) => {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    setCurrentState(ModalState.LOADING);

    if (files.length === 1) {
      const file = files[0];
      try {
        const cvrFile = await importCastVoteRecordFromFile(
          file,
          election,
          castVoteRecordFiles
        );
        await refreshCastVoteRecordFiles();

        input.value = '';
        await logger.log(LogEventId.CvrImported, userRole, {
          message: 'CVR file successfully imported.',
          disposition: 'success',
          filename: cvrFile.name,
          numberOfBallotsImported: cvrFile.importedCvrCount,
          duplicateBallotsIgnored: cvrFile.duplicatedCvrCount,
        });
        setImportedFile(cvrFile);
        setCurrentState(ModalState.SUCCESS);
      } catch (err) {
        assert(err instanceof Error);
        if (err.message === 'Duplicate File Imported.') {
          setCurrentState(ModalState.DUPLICATE);
          await logger.log(LogEventId.CvrImported, userRole, {
            message:
              'CVR file was not imported as it is a duplicated of a previously imported file.',
            disposition: 'failure',
            filename: file.name,
            result: 'File not imported, error shown to user.',
          });
          return;
        }
        setCurrentState(ModalState.ERROR);
        setErrorMessage(err.message);
        await logger.log(LogEventId.CvrImported, userRole, {
          message: `Failed to import CVR file: ${err.message}`,
          disposition: 'failure',
          filename: file.name,
          error: err.message,
          result: 'File not imported, error shown to user.',
        });
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
        join(
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
        await parseAllFromFileSystemEntries(
          newFoundFiles,
          electionDefinition.election,
          importedBallotIds,
          castVoteRecordFiles
        )
      ).sort(
        (a, b) => b.exportTimestamp.getTime() - a.exportTimestamp.getTime()
      );
      setFoundFiles(parsedFileInformation);
      await logger.log(LogEventId.CvrFilesReadFromUsb, userRole, {
        message: `Found ${newFoundFiles.length} CVR files on USB drive, user shown option to import.`,
        disposition: 'success',
      });
      setCurrentState(ModalState.INIT);
    } catch (err) {
      assert(err instanceof Error);
      if (err.message.includes('ENOENT')) {
        // No files found
        setFoundFiles([]);
        setCurrentState(ModalState.INIT);
        await logger.log(LogEventId.CvrFilesReadFromUsb, userRole, {
          message:
            'No CVR files automatically found on USB drive. User allowed to import manually.',
          disposition: 'success',
          result: 'User allowed to manually select files.',
        });
      } else {
        await logger.log(LogEventId.CvrFilesReadFromUsb, userRole, {
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
              <strong>{errorMessage}</strong>: {errorMessage}. Please ensure
              this file only contains valid CVR data for this election.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={<LinkButton onPress={onClose}>Close</LinkButton>}
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
          <LinkButton disabled onPress={onClose}>
            Cancel
          </LinkButton>
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
              <UsbImage src="/assets/usb-drive.svg" alt="Insert USB Image" />
              Please insert a USB drive in order to import CVR files from the
              scanner.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            {(!window.kiosk || process.env.NODE_ENV === 'development') && (
              <FileInputButton
                data-testid="manual-input"
                onChange={processCastVoteRecordFileFromFilePicker}
              >
                Select Files…
              </FileInputButton>
            )}
            <LinkButton onPress={onClose}>Cancel</LinkButton>
          </React.Fragment>
        }
      />
    );
  }

  if (usbDriveStatus === UsbDriveStatus.mounted) {
    // Determine if we are already locked to a filemode based on previously imported CVRs
    const fileMode =
      castVoteRecordFiles.length > 0
        ? castVoteRecordFiles.find((file) => file.isTestMode)
          ? 'test'
          : 'live'
        : null;
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
        modalWidth={ModalWidth.Wide}
        content={
          <React.Fragment>
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
          </React.Fragment>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            <FileInputButton
              data-testid="manual-input"
              onChange={processCastVoteRecordFileFromFilePicker}
            >
              Select File Manually…
            </FileInputButton>
            <LinkButton onPress={onClose}>Cancel</LinkButton>
          </React.Fragment>
        }
      />
    );
  }
  // Creates a compile time check to make sure this switch statement includes all enum values for UsbDriveStatus
  throwBadStatus(usbDriveStatus);
}
