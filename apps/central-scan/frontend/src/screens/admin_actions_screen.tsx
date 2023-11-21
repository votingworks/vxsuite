import React, { useState, useContext } from 'react';
import { assert, err } from '@votingworks/basics';
import type { LogsResultType } from '@votingworks/backend';
import {
  Button,
  ExportLogsButtonRow,
  H1,
  Icons,
  LinkButton,
  Loading,
  Main,
  Modal,
  P,
  Screen,
  SetClockButton,
  userReadableMessageFromExportError,
} from '@votingworks/ui';
import { isElectionManagerAuth } from '@votingworks/utils';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';
import { MainNav } from '../components/main_nav';
import { ToggleTestModeButton } from '../components/toggle_test_mode_button';
import { AppContext } from '../contexts/app_context';
import {
  logOut,
  unconfigure,
  clearBallotData,
  exportCastVoteRecordsToUsbDrive,
  ejectUsbDrive,
  exportLogsToUsb,
} from '../api';

const ButtonRow = styled.div`
  &:not(:last-child) {
    margin-bottom: 1rem;
  }
`;

export interface AdminActionScreenProps {
  isTestMode: boolean;
  canUnconfigure: boolean;
}

export function AdminActionsScreen({
  isTestMode,
  canUnconfigure,
}: AdminActionScreenProps): JSX.Element {
  const history = useHistory();
  const { logger, auth, usbDriveStatus } = useContext(AppContext);
  assert(isElectionManagerAuth(auth));
  const logOutMutation = logOut.useMutation();
  const unconfigureMutation = unconfigure.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();
  const clearBallotDataMutation = clearBallotData.useMutation();
  const exportCastVoteRecordsToUsbDriveMutation =
    exportCastVoteRecordsToUsbDrive.useMutation();

  const exportLogsToUsbMutation = exportLogsToUsb.useMutation();

  async function doExportLogs(): Promise<LogsResultType> {
    try {
      return await exportLogsToUsbMutation.mutateAsync();
    } catch (e) {
      return err('copy-failed');
    }
  }

  function redirectToDashboard() {
    history.replace('/');
  }

  const [unconfigureFlowState, setUnconfigureFlowState] = useState<
    'initial-confirmation' | 'double-confirmation' | 'unconfiguring'
  >();
  function resetUnconfigureFlow() {
    setUnconfigureFlowState(undefined);
  }
  function doUnconfigure() {
    setUnconfigureFlowState('unconfiguring');
    ejectUsbDriveMutation.mutate();
    unconfigureMutation.mutate(
      { ignoreBackupRequirement: false },
      {
        onSuccess: redirectToDashboard,
      }
    );
  }

  const [deleteBallotDataFlowState, setDeleteBallotDataFlowState] = useState<
    'confirmation' | 'deleting'
  >();
  function resetDeleteBallotDataFlow() {
    setDeleteBallotDataFlowState(undefined);
  }
  function deleteBallotData() {
    setDeleteBallotDataFlowState('deleting');
    clearBallotDataMutation.mutate(undefined, {
      onSuccess: redirectToDashboard,
    });
  }

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupError, setBackupError] = useState('');

  function saveBackup() {
    setIsBackingUp(true);
    setBackupError('');
    exportCastVoteRecordsToUsbDriveMutation.mutate(
      { isMinimalExport: false },
      {
        onSuccess(result) {
          if (result.isErr()) {
            setBackupError(userReadableMessageFromExportError(result.err()));
          }
          setIsBackingUp(false);
        },
      }
    );
  }

  return (
    <React.Fragment>
      <Screen>
        <Main padded>
          <div>
            <H1>Admin Actions</H1>
            <ButtonRow>
              <ToggleTestModeButton
                isTestMode={isTestMode}
                canUnconfigure={canUnconfigure}
              />
            </ButtonRow>
            {backupError && <P style={{ color: 'red' }}>{backupError}</P>}
            <ButtonRow>
              <Button onPress={saveBackup} disabled={isBackingUp}>
                {isBackingUp ? 'Saving…' : 'Save Backup'}
              </Button>
            </ButtonRow>
            <ButtonRow>
              <ExportLogsButtonRow
                usbDriveStatus={usbDriveStatus}
                auth={auth}
                logger={logger}
                onExportLogs={doExportLogs}
              />
            </ButtonRow>
            <ButtonRow>
              <SetClockButton logOut={() => logOutMutation.mutate()}>
                Update Date and Time
              </SetClockButton>
            </ButtonRow>
            <ButtonRow>
              <Button
                icon="Delete"
                disabled={!canUnconfigure}
                onPress={() => setDeleteBallotDataFlowState('confirmation')}
              >
                Delete Ballot Data
              </Button>
            </ButtonRow>

            <ButtonRow>
              <Button
                icon="Delete"
                disabled={!canUnconfigure}
                onPress={() => setUnconfigureFlowState('initial-confirmation')}
              >
                Delete Election Data from VxCentralScan
              </Button>{' '}
            </ButtonRow>
            {!canUnconfigure && !isTestMode && (
              <P>
                <Icons.Warning color="warning" /> You must &quot;Save
                Backup&quot; before you may delete election data.
              </P>
            )}
          </div>
        </Main>
        <MainNav isTestMode={isTestMode}>
          <Button onPress={() => logOutMutation.mutate()}>Lock Machine</Button>
          <LinkButton to="/">Back to Dashboard</LinkButton>
        </MainNav>
      </Screen>
      {deleteBallotDataFlowState === 'confirmation' && (
        <Modal
          title="Delete All Scanned Ballot Data?"
          content={
            <P>
              This will permanently delete all scanned ballot data and reset the
              scanner to only be configured with the current election.
            </P>
          }
          actions={
            <React.Fragment>
              <Button onPress={resetDeleteBallotDataFlow}>Cancel</Button>
              <Button variant="danger" icon="Delete" onPress={deleteBallotData}>
                Yes, Delete Ballot Data
              </Button>
            </React.Fragment>
          }
          onOverlayClick={resetDeleteBallotDataFlow}
        />
      )}
      {unconfigureFlowState === 'initial-confirmation' && (
        <Modal
          title="Delete all election data?"
          content={
            <React.Fragment>
              <P>
                This will delete the election configuration and all the scanned
                ballot data from VxCentralScan.
              </P>
              {usbDriveStatus.status === 'mounted' && (
                <P>It will also eject the USB drive.</P>
              )}
            </React.Fragment>
          }
          actions={
            <React.Fragment>
              <Button
                variant="danger"
                icon="Delete"
                onPress={() => setUnconfigureFlowState('double-confirmation')}
              >
                Yes, Delete Election Data
              </Button>
              <Button onPress={resetUnconfigureFlow}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={resetUnconfigureFlow}
        />
      )}
      {unconfigureFlowState === 'double-confirmation' && (
        <Modal
          title="Are you sure?"
          content={<P>This cannot be undone.</P>}
          actions={
            <React.Fragment>
              <Button variant="danger" icon="Delete" onPress={doUnconfigure}>
                I am sure. Delete all election data.
              </Button>
              <Button onPress={resetUnconfigureFlow}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={resetUnconfigureFlow}
        />
      )}
      {unconfigureFlowState === 'unconfiguring' && (
        <Modal
          centerContent
          content={<Loading>Deleting election data</Loading>}
        />
      )}
      {deleteBallotDataFlowState === 'deleting' && (
        <Modal
          centerContent
          content={<Loading>Deleting ballot data</Loading>}
        />
      )}
      {isBackingUp && (
        <Modal centerContent content={<Loading>Saving backup</Loading>} />
      )}
    </React.Fragment>
  );
}
