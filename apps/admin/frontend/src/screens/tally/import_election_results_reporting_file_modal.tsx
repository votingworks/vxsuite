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

import type {
  ImportElectionResultsReportingError,
  ManualResultsVotingMethod,
} from '@votingworks/admin-backend';
import { AppContext } from '../../contexts/app_context';
import { Loading } from '../../components/loading';
import { InputEventFunction } from '../../config/types';
import { importElectionResultsReportingFile } from '../../api';

const Content = styled.div`
  overflow: hidden;
`;

function errorCodeToMessage(
  errorCode: ImportElectionResultsReportingError
): string {
  switch (errorCode.type) {
    case 'parsing-failed':
      return 'File is unreadable. Try exporting it again.';
    case 'conversion-failed':
      return 'File is not a valid Election Results Reporting CDF file. Please ensure you are using the correct file format.';
    /* istanbul ignore next - compile time check */
    default:
      throwIllegalValue(errorCode);
  }
}

export interface Props {
  onClose: () => void;
  ballotStyleGroupId: string;
  precinctId: string; // Precinct ID type?
  votingMethod: ManualResultsVotingMethod;
}

export function ImportElectionsResultReportingFileModal({
  onClose,
  ballotStyleGroupId,
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
      ballotStyleId: ballotStyleGroupId,
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

  if (importElectionResultReportingFileMutation.isSuccess) {
    const result = importElectionResultReportingFileMutation.data;

    // Handle expected errors
    if (result.isErr()) {
      return errorContents(errorCodeToMessage(result.err()));
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
                Select File…
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
        title="Import Results File"
        content={
          <Content>
            <P>
              Results may be imported as an Election Results Reporting Common
              Data Format (ERR CDF) file. Choose an ERR CDF file to import.
            </P>
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
              Select File…
            </FileInputButton>
            <Button onPress={onClose}>Cancel</Button>
          </React.Fragment>
        }
      />
    );
  }

  /* istanbul ignore next - compile time check */
  throwIllegalValue(usbDriveStatus, 'status');
}
