import React, { useContext } from 'react';
import styled from 'styled-components';

import {
  Modal,
  ModalWidth,
  Button,
  ElectronFile,
  P,
  FileInputButton,
  UsbDriveImage,
} from '@votingworks/ui';
import {
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import { assert, throwIllegalValue } from '@votingworks/basics';

import type { ManualResultsVotingMethod } from '@votingworks/admin-backend';
import { AppContext } from '../contexts/app_context';
import { Loading } from './loading';
import { InputEventFunction } from '../config/types';
import { importElectionResultsReportingFile } from '../api';

const Content = styled.div`
  overflow: hidden;
`;

export interface Props {
  onClose: () => void;
  ballotStyleId: string;
  precinctId: string; // Precinct ID type?
  votingMethod: ManualResultsVotingMethod;
}

export function ImportElectionsResultReportingFileModal({
  onClose,
  ballotStyleId,
  precinctId,
  votingMethod,
}: Props): JSX.Element | null {
  const { usbDriveStatus, electionDefinition, auth } = useContext(AppContext);
  const importElectionResultReportingFileMutation =
    importElectionResultsReportingFile.useMutation();

  assert(electionDefinition);
  assert(isElectionManagerAuth(auth) || isSystemAdministratorAuth(auth));

  function handleImportElectionResultReportingFile(path: string) {
    const filepath = path;
    importElectionResultReportingFileMutation.mutate({
      precinctId,
      ballotStyleId,
      votingMethod,
      filepath,
    });
  }

  const processElectionResultReportingFileFromFilePicker: InputEventFunction = (
    event
  ) => {
    // electron adds a path field to the File object
    assert(window.kiosk, 'No window.kiosk');
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    const file = files[0] as ElectronFile;

    if (!file) {
      onClose();
      return;
    }

    handleImportElectionResultReportingFile(file.path);
  };

  function errorContents(message: string) {
    return (
      <Modal
        title="Failed to Import Results"
        content={<P>{message}</P>}
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  /* istanbul ignore next */
  if (importElectionResultReportingFileMutation.isError) {
    /* istanbul ignore next */
    return errorContents(
      (importElectionResultReportingFileMutation.error as Error).message
    );
  }

  if (importElectionResultReportingFileMutation.isSuccess) {
    const result = importElectionResultReportingFileMutation.data;
    if (result.isErr()) {
      return errorContents(result.err().message);
    }

    return (
      <Modal
        title="Results Imported"
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  if (importElectionResultReportingFileMutation.isLoading) {
    return <Modal content={<Loading>Importing Results</Loading>} />;
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
            <UsbDriveImage />
            Please insert a USB drive in order to import a results file.
          </P>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            {window.kiosk && (
              <FileInputButton
                data-testid="manual-input"
                onChange={processElectionResultReportingFileFromFilePicker}
                accept=".json"
                disabled
              >
                Select Import…
              </FileInputButton>
            )}
            <Button onPress={onClose}>Cancel</Button>
          </React.Fragment>
        }
      />
    );
  }

  if (usbDriveStatus.status === 'mounted') {
    return (
      <Modal
        modalWidth={ModalWidth.Wide}
        title="Load Election Results Reporting Files"
        content={
          <Content>
            <P>Choose an Election Results Reporting file to load.</P>
          </Content>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            <FileInputButton
              data-testid="manual-input"
              onChange={processElectionResultReportingFileFromFilePicker}
              accept=".json"
            >
              Select Import…
            </FileInputButton>
            <Button onPress={onClose}>Cancel</Button>
          </React.Fragment>
        }
      />
    );
  }
  throwIllegalValue(usbDriveStatus, 'status');
}