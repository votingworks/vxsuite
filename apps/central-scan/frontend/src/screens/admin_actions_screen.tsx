import { ElectionDefinition } from '@votingworks/types';
import React, { useState, useContext } from 'react';
import { assert } from '@votingworks/basics';
import {
  Button,
  ExportLogsButtonRow,
  Font,
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
} from '../api';

const ButtonRow = styled.div`
  &:not(:last-child) {
    margin-bottom: 1rem;
  }
`;

export interface AdminActionScreenProps {
  isTestMode: boolean;
  canUnconfigure: boolean;
  electionDefinition: ElectionDefinition;
}

export function AdminActionsScreen({
  isTestMode,
  canUnconfigure,
  electionDefinition,
}: AdminActionScreenProps): JSX.Element {
  const history = useHistory();
  const { logger, auth, usbDriveStatus, machineConfig } =
    useContext(AppContext);
  assert(isElectionManagerAuth(auth));
  const logOutMutation = logOut.useMutation();
  const unconfigureMutation = unconfigure.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();
  const clearBallotDataMutation = clearBallotData.useMutation();
  const exportCastVoteRecordsToUsbDriveMutation =
    exportCastVoteRecordsToUsbDrive.useMutation();

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
                electionDefinition={electionDefinition}
                usbDriveStatus={usbDriveStatus}
                auth={auth}
                logger={logger}
                machineConfig={machineConfig}
              />
            </ButtonRow>
            <ButtonRow>
              <SetClockButton logOut={() => logOutMutation.mutate()}>
                Update Date and Time
              </SetClockButton>
            </ButtonRow>
            <ButtonRow>
              <Button
                disabled={!canUnconfigure}
                onPress={() => setDeleteBallotDataFlowState('confirmation')}
              >
                <Icons.Delete /> Delete Ballot Data
              </Button>
            </ButtonRow>

            <ButtonRow>
              <Button
                disabled={!canUnconfigure}
                onPress={() => setUnconfigureFlowState('initial-confirmation')}
              >
                <Icons.Delete /> Delete Election Data from VxCentralScan
              </Button>{' '}
            </ButtonRow>
            {!canUnconfigure && !isTestMode && (
              <Font color="warning">
                <Icons.Warning /> You must &quot;Save Backup&quot; before you
                may delete election data.
              </Font>
            )}
          </div>
        </Main>
        <MainNav isTestMode={isTestMode}>
          <Button small onPress={() => logOutMutation.mutate()}>
            Lock Machine
          </Button>
          <LinkButton small to="/">
            Back to Dashboard
          </LinkButton>
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
              <Button variant="danger" onPress={deleteBallotData}>
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
              <Button variant="danger" onPress={doUnconfigure}>
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
