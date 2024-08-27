import React, { useContext, useState } from 'react';
import styled from 'styled-components';

import {
  Modal,
  ModalWidth,
  Button,
  ElectronFile,
  P,
  Font,
  FileInputButton,
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

const UsbImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`;

const Content = styled.div`
  overflow: hidden;
`;

type ModalState =
  | { state: 'error'; errorMessage?: string; filename: string }
  | { state: 'loading' }
  | { state: 'init' }
  | { state: 'success' };

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
  const [currentState, setCurrentState] = useState<ModalState>({
    state: 'init',
  });

  async function handleImportElectionResultReportingFile(path: string) {
    const filepath = path;
    setCurrentState({ state: 'loading' });

    const result = await importElectionResultReportingFileMutation.mutateAsync({
      precinctId,
      ballotStyleId,
      votingMethod,
      filepath,
    });

    if (result.isOk()) {
      setCurrentState({ state: 'success' });
    } else {
      setCurrentState({ state: 'error', filename: filepath });
    }
  }

  const processElectionResultReportingFileFromFilePicker: InputEventFunction =
    async (event) => {
      // electron adds a path field to the File object
      assert(window.kiosk, 'No window.kiosk');
      const input = event.currentTarget;
      const files = Array.from(input.files || []);
      const file = files[0] as ElectronFile;

      if (!file) {
        onClose();
        return;
      }

      await handleImportElectionResultReportingFile(file.path);
    };

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

  if (currentState.state === 'success') {
    return (
      <Modal
        title="ERR File Added"
        content={<P>Success</P>}
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  if (currentState.state === 'loading') {
    return <Modal content={<Loading>Loading ERR File</Loading>} />;
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
            Please insert a USB drive in order to load ERR file.
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
