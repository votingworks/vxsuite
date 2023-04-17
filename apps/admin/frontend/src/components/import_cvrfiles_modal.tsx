import React, { useContext, useState } from 'react';
import styled from 'styled-components';
import { basename } from 'path';
import moment from 'moment';

import { Admin } from '@votingworks/api';
import {
  Modal,
  ModalWidth,
  Table,
  TD,
  Prose,
  Button,
  ElectronFile,
  useExternalStateChangeListener,
} from '@votingworks/ui';
import {
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import { assert, throwIllegalValue } from '@votingworks/basics';

import { AppContext } from '../contexts/app_context';
import { Loading } from './loading';
import {
  CastVoteRecordFilePreprocessedData,
  InputEventFunction,
} from '../config/types';
import { FileInputButton } from './file_input_button';
import { TIME_FORMAT } from '../config/globals';
import {
  addCastVoteRecordFile,
  getCastVoteRecordFileMode,
  getCastVoteRecordFiles,
  listCastVoteRecordFilesOnUsb,
} from '../api';

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
  | { state: 'error'; errorMessage?: string; filename: string }
  | { state: 'loading' }
  | { state: 'duplicate'; result: Admin.CvrFileImportInfo }
  | { state: 'init' }
  | { state: 'success'; result: Admin.CvrFileImportInfo };

export interface Props {
  onClose: () => void;
}

export function ImportCvrFilesModal({ onClose }: Props): JSX.Element | null {
  const { usbDrive, electionDefinition, auth } = useContext(AppContext);
  const castVoteRecordFilesQuery = getCastVoteRecordFiles.useQuery();
  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const cvrFilesOnUsbQuery = listCastVoteRecordFilesOnUsb.useQuery();
  const addCastVoteRecordFileMutation = addCastVoteRecordFile.useMutation();

  assert(electionDefinition);
  assert(isElectionManagerAuth(auth) || isSystemAdministratorAuth(auth)); // TODO(auth) check permissions for loaded cvr
  const [currentState, setCurrentState] = useState<ModalState>({
    state: 'init',
  });

  function importCastVoteRecordFile(path: string) {
    const filename = basename(path);
    setCurrentState({ state: 'loading' });

    addCastVoteRecordFileMutation.mutate(
      { path },
      {
        onSuccess: (addCastVoteRecordFileResult) => {
          if (addCastVoteRecordFileResult.isErr()) {
            setCurrentState({
              state: 'error',
              errorMessage: addCastVoteRecordFileResult.err().message,
              filename,
            });
          } else if (addCastVoteRecordFileResult.ok().wasExistingFile) {
            setCurrentState({
              state: 'duplicate',
              result: addCastVoteRecordFileResult.ok(),
            });
          } else {
            setCurrentState({
              state: 'success',
              result: addCastVoteRecordFileResult.ok(),
            });
          }
        },
      }
    );
  }

  function importSelectedFile(fileData: CastVoteRecordFilePreprocessedData) {
    importCastVoteRecordFile(fileData.path);
  }

  const processCastVoteRecordFileFromFilePicker: InputEventFunction = (
    event
  ) => {
    // electron adds a path field to the File object
    assert(window.kiosk);
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    const file = files[0] as ElectronFile;

    if (!file) {
      onClose();
      return;
    }

    importCastVoteRecordFile(file.path);
  };

  // TODO: Rather than explicitly refetching, which is outside of the standard
  // React Query pattern, we should invalidate the query on USB drive status
  // change. Currently React Query is not managing USB drive status and polling
  // is being performed elsewhere.
  useExternalStateChangeListener(usbDrive.status, () => {
    if (usbDrive.status === 'mounted') {
      void cvrFilesOnUsbQuery.refetch();
    }
  });

  if (currentState.state === 'error') {
    return (
      <Modal
        content={
          <Prose>
            <h1>Error</h1>
            <p>
              There was an error reading the content of the file{' '}
              <strong>{currentState.filename}</strong>:{' '}
              {currentState.errorMessage}. Please ensure this file only contains
              valid CVR data for this election.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
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
        actions={<Button onPress={onClose}>Close</Button>}
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
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  if (
    !castVoteRecordFilesQuery.isSuccess ||
    !castVoteRecordFileModeQuery.isSuccess ||
    !cvrFilesOnUsbQuery.isSuccess ||
    currentState.state === 'loading' ||
    usbDrive.status === 'ejecting' ||
    usbDrive.status === 'mounting'
  ) {
    return (
      <Modal
        content={<Loading />}
        onOverlayClick={onClose}
        actions={
          <Button disabled onPress={onClose}>
            Cancel
          </Button>
        }
      />
    );
  }

  if (
    usbDrive.status === 'absent' ||
    usbDrive.status === 'ejected' ||
    usbDrive.status === 'bad_format'
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
            {process.env.NODE_ENV === 'development' && (
              <FileInputButton
                data-testid="manual-input"
                onChange={processCastVoteRecordFileFromFilePicker}
              >
                Select Files…
              </FileInputButton>
            )}
            <Button onPress={onClose}>Cancel</Button>
          </React.Fragment>
        }
      />
    );
  }

  const fileMode = castVoteRecordFileModeQuery.data;

  if (usbDrive.status === 'mounted') {
    // Determine if we are already locked to a filemode based on previously loaded CVRs
    const fileModeLocked = fileMode !== Admin.CvrFileMode.Unlocked;

    // Parse the file options on the USB drive and build table rows for each valid file.
    const fileTableRows: JSX.Element[] = [];
    let numberOfNewFiles = 0;
    const cvrFiles = castVoteRecordFilesQuery.data;
    const importedFileNames = new Set(cvrFiles.map((f) => f.filename));
    for (const file of cvrFilesOnUsbQuery.data) {
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
                {isTestModeResults ? <TestMode>Test</TestMode> : 'Official'}
              </LabelText>
            </td>
          )}
          <TD textAlign="right">
            <Button
              onPress={importSelectedFile}
              value={file}
              disabled={!canImport}
              small
              variant="primary"
            >
              {canImport ? 'Load' : 'Loaded'}
            </Button>
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
        <TestMode>Test Ballot Mode</TestMode>
      ) : fileMode === 'live' ? (
        'Official Ballot Mode'
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
              accept=".json"
            >
              Select File Manually…
            </FileInputButton>
            <Button onPress={onClose}>Cancel</Button>
          </React.Fragment>
        }
      />
    );
  }
  throwIllegalValue(usbDrive.status);
}
