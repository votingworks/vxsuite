import React, { useContext, useState } from 'react';
import styled from 'styled-components';
import { basename } from 'path';
import moment from 'moment';

import {
  Modal,
  ModalWidth,
  Table,
  TD,
  Button,
  ElectronFile,
  useExternalStateChangeListener,
  WithScrollButtons,
  P,
  Font,
} from '@votingworks/ui';
import {
  format,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import { assert, throwIllegalValue } from '@votingworks/basics';

import type {
  CvrFileImportInfo,
  ImportCastVoteRecordsError,
} from '@votingworks/admin-backend';
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

const Content = styled.div`
  display: flex;
  flex-direction: column;
  max-height: 100%;
  overflow: hidden;
`;

function userReadableMessageFromError(
  error: ImportCastVoteRecordsError
): string {
  switch (error.type) {
    case 'authentication-error': {
      return 'Unable to authenticate cast vote records. Try exporting them from the scanner again.';
    }
    case 'ballot-id-already-exists-with-different-data': {
      return `Found a cast vote record at index ${error.index} that has the same ballot ID as a previously imported cast vote record, but with different data.`;
    }
    case 'invalid-mode': {
      return {
        official:
          'You are currently tabulating official results but the selected cast vote record export contains test results.',
        test: 'You are currently tabulating test results but the selected cast vote record export contains official results.',
      }[error.currentMode];
    }
    case 'invalid-cast-vote-record': {
      const messageBase = `Found an invalid cast vote record at index ${error.index}. `;
      const messageDetail = (() => {
        switch (error.subType) {
          case 'ballot-style-not-found': {
            return 'The record references a ballot style that does not exist.';
          }
          case 'batch-id-not-found': {
            return 'The record references a batch ID that does not exist.';
          }
          case 'contest-not-found': {
            return 'The record references a contest that does not exist.';
          }
          case 'contest-option-not-found': {
            return 'The record references a contest option that does not exist.';
          }
          case 'election-mismatch': {
            return 'The record references the wrong election.';
          }
          case 'image-file-not-found': {
            return 'The record references an image file that does not exist.';
          }
          // These two go hand-in-hand
          case 'invalid-ballot-image-field':
          case 'invalid-write-in-field': {
            return 'The record contains an incorrectly formatted ballot image and/or write-in field.';
          }
          case 'invalid-ballot-sheet-id': {
            return 'The record contains an incorrectly formatted ballot sheet ID.';
          }
          case 'layout-file-not-found': {
            return 'The record references a layout file that does not exist.';
          }
          case 'layout-parse-error': {
            return 'The layout file could not be parsed.';
          }
          case 'no-current-snapshot': {
            return 'The record does not contain a current snapshot of the interpreted results.';
          }
          case 'parse-error': {
            return 'The record could not be parsed.';
          }
          case 'precinct-not-found': {
            return 'The record references a precinct that does not exist.';
          }
          default: {
            throwIllegalValue(error, 'subType');
          }
        }
      })();
      return [messageBase, messageDetail].join(' ');
    }
    case 'metadata-file-not-found': {
      return 'Unable to find metadata file.';
    }
    case 'metadata-file-parse-error': {
      return 'Unable to parse metadata file.';
    }
    default: {
      throwIllegalValue(error, 'type');
    }
  }
}

type ModalState =
  | { state: 'error'; errorMessage?: string; filename: string }
  | { state: 'loading' }
  | { state: 'duplicate'; result: CvrFileImportInfo }
  | { state: 'init' }
  | { state: 'success'; result: CvrFileImportInfo };

export interface Props {
  onClose: () => void;
}

export function ImportCvrFilesModal({ onClose }: Props): JSX.Element | null {
  const { usbDriveStatus, electionDefinition, auth } = useContext(AppContext);
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
            const error = addCastVoteRecordFileResult.err();
            setCurrentState({
              state: 'error',
              errorMessage: userReadableMessageFromError(error),
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
  useExternalStateChangeListener(usbDriveStatus.status, () => {
    if (usbDriveStatus.status === 'mounted') {
      void cvrFilesOnUsbQuery.refetch();
    }
  });

  if (currentState.state === 'error') {
    return (
      <Modal
        title="Error"
        content={
          <P>
            There was an error reading the contents of{' '}
            <Font weight="bold">{currentState.filename}</Font>:{' '}
            {currentState.errorMessage}
          </P>
        }
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  if (currentState.state === 'duplicate') {
    return (
      <Modal
        title="Duplicate File"
        content={
          <P>
            The selected file was ignored as a duplicate of a previously loaded
            file.
          </P>
        }
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  if (currentState.state === 'success') {
    return (
      <Modal
        title={`${format.count(
          currentState.result.newlyAdded
        )} new CVRs Loaded`}
        content={
          currentState.result.alreadyPresent > 0 && (
            <P>
              Of the{' '}
              {format.count(
                currentState.result.newlyAdded +
                  currentState.result.alreadyPresent
              )}{' '}
              total CVRs in this file,{' '}
              {format.count(currentState.result.alreadyPresent)} were previously
              loaded.
            </P>
          )
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
    currentState.state === 'loading'
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
    usbDriveStatus.status === 'no_drive' ||
    usbDriveStatus.status === 'ejected' ||
    usbDriveStatus.status === 'error'
  ) {
    return (
      <Modal
        title="No USB Drive Detected"
        content={
          <P>
            <UsbImage src="/assets/usb-drive.svg" alt="Insert USB Image" />
            Please insert a USB drive in order to load CVR files from the
            scanner.
          </P>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            {window.kiosk && process.env.NODE_ENV === 'development' && (
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

  if (usbDriveStatus.status === 'mounted') {
    // Determine if we are already locked to a filemode based on previously loaded CVRs
    const fileModeLocked = fileMode !== 'unlocked';

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
        (isTestModeResults && fileMode === 'test') ||
        (!isTestModeResults && fileMode === 'official');
      const canImport = !fileImported && inProperFileMode;
      const row = (
        <tr key={name} data-testid="table-row">
          <td>{moment(exportTimestamp).format(TIME_FORMAT)}</td>
          <td>{scannerIds.join(', ')}</td>
          <td data-testid="cvr-count">{cvrCount}</td>
          {!fileModeLocked && (
            <td>
              <LabelText>
                {isTestModeResults ? (
                  <Font color="warning">Test</Font>
                ) : (
                  <Font color="success">Official</Font>
                )}
              </LabelText>
            </td>
          )}
          <TD textAlign="right">
            <Button
              onPress={importSelectedFile}
              value={file}
              disabled={!canImport}
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
      fileMode === 'test'
        ? 'Test Ballot Mode'
        : fileMode === 'official'
        ? 'Official Ballot Mode'
        : '';

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
        title={`Load ${headerModeText} CVR Files`}
        content={
          <Content>
            <P>{instructionalText}</P>
            {fileTableRows.length > 0 && (
              <WithScrollButtons>
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
              </WithScrollButtons>
            )}
          </Content>
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
  throwIllegalValue(usbDriveStatus, 'status');
}
