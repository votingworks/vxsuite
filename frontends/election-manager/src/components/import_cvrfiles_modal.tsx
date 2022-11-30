import React, { useContext, useEffect, useState } from 'react';
import styled from 'styled-components';
import { join } from 'path';
import moment from 'moment';

import { Admin } from '@votingworks/api';
import {
  Modal,
  ModalWidth,
  Table,
  TD,
  Prose,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
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
  CastVoteRecordFilePreprocessedData,
  InputEventFunction,
} from '../config/types';
import { FileInputButton } from './file_input_button';
import { TIME_FORMAT } from '../config/globals';
import { useAddCastVoteRecordFileMutation } from '../hooks/use_add_cast_vote_record_file_mutation';
import { useCvrFileModeQuery } from '../hooks/use_cvr_file_mode_query';
import { AddCastVoteRecordFileResult } from '../lib/backends';
import { useCvrFilesQuery } from '../hooks/use_cvr_files_query';
import { CastVoteRecordFiles } from '../utils/cast_vote_record_files';

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

type ModalState =
  | { state: 'error'; error: Error; filename: string }
  | { state: 'loading' }
  | { state: 'duplicate'; result: AddCastVoteRecordFileResult }
  | { state: 'init' }
  | { state: 'success'; result: AddCastVoteRecordFileResult };

export interface Props {
  onClose: () => void;
}

function throwBadStatus(s: never): never {
  throw new Error(`Bad status: ${s}`);
}

export function ImportCvrFilesModal({ onClose }: Props): JSX.Element {
  const { usbDriveStatus, electionDefinition, auth, logger } =
    useContext(AppContext);
  const addCastVoteRecordFileMutation = useAddCastVoteRecordFileMutation();
  const cvrFilesQuery = useCvrFilesQuery();
  const fileMode = useCvrFileModeQuery().data;

  assert(electionDefinition);
  assert(isElectionManagerAuth(auth) || isSystemAdministratorAuth(auth)); // TODO(auth) check permissions for loaded cvr
  const userRole = auth.user.role;
  const [currentState, setCurrentState] = useState<ModalState>({
    state: 'init',
  });
  const [foundFiles, setFoundFiles] = useState<
    CastVoteRecordFilePreprocessedData[]
  >([]);
  const { election, electionHash } = electionDefinition;

  async function importCvrFile(file: File) {
    const filename = file.name;
    setCurrentState({ state: 'loading' });

    try {
      const addCastVoteRecordFileResult =
        await addCastVoteRecordFileMutation.mutateAsync(file);

      if (addCastVoteRecordFileResult.wasExistingFile) {
        setCurrentState({
          state: 'duplicate',
          result: addCastVoteRecordFileResult,
        });
        await logger.log(LogEventId.CvrLoaded, userRole, {
          message:
            'CVR file was not loaded as it is a duplicate of a previously loaded file.',
          disposition: 'failure',
          filename,
          result: 'File not loaded, error shown to user.',
        });
      } else {
        await logger.log(LogEventId.CvrLoaded, userRole, {
          message: 'CVR file successfully loaded.',
          disposition: 'success',
          filename,
          numberOfBallotsImported: addCastVoteRecordFileResult.newlyAdded,
          duplicateBallotsIgnored: addCastVoteRecordFileResult.alreadyPresent,
        });
        setCurrentState({
          state: 'success',
          result: addCastVoteRecordFileResult,
        });
      }
    } catch (error) {
      assert(error instanceof Error);
      setCurrentState({ state: 'error', error, filename });
      await logger.log(LogEventId.CvrLoaded, userRole, {
        message: `Failed to load CVR file: ${error.message}`,
        disposition: 'failure',
        filename,
        error: error.message,
        result: 'File not loaded, error shown to user.',
      });
    }
  }

  async function importSelectedFile(
    fileData: CastVoteRecordFilePreprocessedData
  ) {
    assert(window.kiosk);
    // TODO: To avoid unnecessarily loading potentially large CVR files into
    // memory, we might want to add a file streaming API to kiosk-browser, or
    // update the backend API to support importing files with just a file path
    // instead of file attachments.
    const fileContent = await window.kiosk.readFile(fileData.path, 'utf-8');

    await importCvrFile(
      new File([fileContent], fileData.name, {
        lastModified: moment(fileData.exportTimestamp).valueOf(),
      })
    );
  }

  const processCastVoteRecordFileFromFilePicker: InputEventFunction = async (
    event
  ) => {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    const file = files[0];

    if (!file) {
      onClose();
      return;
    }

    await importCvrFile(file);
  };

  async function fetchFilenames() {
    setCurrentState({ state: 'loading' });
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
      const parsedFileInformation =
        CastVoteRecordFiles.parseAllFromFileSystemEntries(newFoundFiles).sort(
          (a, b) => b.exportTimestamp.getTime() - a.exportTimestamp.getTime()
        );
      setFoundFiles(parsedFileInformation);
      await logger.log(LogEventId.CvrFilesReadFromUsb, userRole, {
        message: `Found ${newFoundFiles.length} CVR files on USB drive, user shown option to load.`,
        disposition: 'success',
      });
      setCurrentState({ state: 'init' });
    } catch (err) {
      assert(err instanceof Error);
      if (err.message.includes('ENOENT')) {
        // No files found
        setFoundFiles([]);
        setCurrentState({ state: 'init' });
        await logger.log(LogEventId.CvrFilesReadFromUsb, userRole, {
          message:
            'No CVR files automatically found on USB drive. User allowed to load manually.',
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

  if (currentState.state === 'error') {
    return (
      <Modal
        content={
          <Prose>
            <h1>Error</h1>
            <p>
              There was an error reading the content of the file{' '}
              <strong>{currentState.filename}</strong>:{' '}
              {currentState.error.message}. Please ensure this file only
              contains valid CVR data for this election.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={<LinkButton onPress={onClose}>Close</LinkButton>}
      />
    );
  }

  if (currentState.state === 'duplicate') {
    return (
      <Modal
        content={
          <Prose>
            <h1>Duplicate File</h1>
            <p>
              The selected file was ignored as a duplicate of a previously
              loaded file.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={<LinkButton onPress={onClose}>Close</LinkButton>}
      />
    );
  }

  if (currentState.state === 'success') {
    return (
      <Modal
        content={
          <Prose>
            <h1>{currentState.result.newlyAdded} new CVRs Loaded</h1>
            {currentState.result.alreadyPresent > 0 && (
              <p>
                Of the{' '}
                {currentState.result.newlyAdded +
                  currentState.result.alreadyPresent}{' '}
                total CVRs in this file, {currentState.result.alreadyPresent}{' '}
                were previously loaded.
              </p>
            )}
          </Prose>
        }
        onOverlayClick={onClose}
        actions={<LinkButton onPress={onClose}>Close</LinkButton>}
      />
    );
  }

  if (
    cvrFilesQuery.isLoading ||
    currentState.state === 'loading' ||
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
              Please insert a USB drive in order to load CVR files from the
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
    // Determine if we are already locked to a filemode based on previously loaded CVRs
    const fileModeLocked = fileMode !== Admin.CvrFileMode.Unlocked;

    // Parse the file options on the USB drive and build table rows for each valid file.
    const fileTableRows: JSX.Element[] = [];
    let numberOfNewFiles = 0;
    const cvrFiles = cvrFilesQuery.data || [];
    const importedFileNames = new Set(cvrFiles.map((f) => f.filename));
    for (const file of foundFiles) {
      const { isTestModeResults, scannerIds, exportTimestamp, cvrCount, name } =
        file;
      const fileImported = importedFileNames.has(name);
      const inProperFileMode =
        !fileModeLocked ||
        (isTestModeResults && fileMode === Admin.CvrFileMode.Test) ||
        (!isTestModeResults && fileMode === Admin.CvrFileMode.Official);
      const canImport = !fileImported && inProperFileMode;
      const row = (
        <tr key={name} data-testid="table-row">
          <td>{moment(exportTimestamp).format(TIME_FORMAT)}</td>
          <td>{scannerIds.join(', ')}</td>
          <td data-testid="cvr-count">{cvrCount}</td>
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
              {canImport ? 'Load' : 'Loaded'}
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
          this USB drive. Save CVR files to this USB drive from the scanner.
          Optionally, you may manually select files to load.
        </React.Fragment>
      ) : (
        'There were no new CVR files automatically found on this USB drive. Save CVR files to this USB drive from the scanner. Optionally, you may manually select files to load.'
      );
    } else if (fileModeLocked) {
      instructionalText = (
        <React.Fragment>
          The following {headerModeText} CVR files were automatically found on
          this USB drive. Previously loaded CVR entries will be ignored.
        </React.Fragment>
      );
    } else {
      instructionalText =
        'The following CVR files were automatically found on this USB drive. Previously loaded CVR entries will be ignored.';
    }

    return (
      <Modal
        modalWidth={ModalWidth.Wide}
        content={
          <React.Fragment>
            <Prose maxWidth={false}>
              <h1 data-testid="modal-title">
                Load {headerModeText} CVR Files{' '}
              </h1>
              <p>{instructionalText}</p>
            </Prose>
            {fileTableRows.length > 0 && (
              <CvrFileTable>
                <thead>
                  <tr>
                    <th>Saved At</th>
                    <th>Scanner ID</th>
                    <th>CVR Count</th>
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
