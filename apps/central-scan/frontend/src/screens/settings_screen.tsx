import React, { useState, useContext } from 'react';
import { assert, err } from '@votingworks/basics';
import type { LogsResultType } from '@votingworks/backend';
import {
  Button,
  CurrentDateAndTime,
  ExportLogsButton,
  H2,
  Icons,
  Loading,
  Modal,
  P,
  SetClockButton,
  userReadableMessageFromExportError,
} from '@votingworks/ui';
import { isElectionManagerAuth } from '@votingworks/utils';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';
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
import { NavigationScreen } from '../navigation_screen';

const ButtonRow = styled.div`
  &:not(:last-child) {
    margin-bottom: 0.5rem;
  }
`;

export interface SettingsScreenProps {
  isTestMode: boolean;
  canUnconfigure: boolean;
}

export function SettingsScreen({
  isTestMode,
  canUnconfigure,
}: SettingsScreenProps): JSX.Element {
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
    <NavigationScreen title="Settings">
      <H2>Election</H2>
      <ButtonRow>
        <ToggleTestModeButton
          isTestMode={isTestMode}
          canUnconfigure={canUnconfigure}
        />
      </ButtonRow>
      <ButtonRow>
        <Button
          icon="Delete"
          color="danger"
          disabled={!canUnconfigure}
          onPress={() => setDeleteBallotDataFlowState('confirmation')}
        >
          Delete Ballot Data
        </Button>
      </ButtonRow>
      <ButtonRow>
        <Button
          icon="Delete"
          color="danger"
          disabled={!canUnconfigure}
          onPress={() => setUnconfigureFlowState('initial-confirmation')}
        >
          Delete Election Data from VxCentralScan
        </Button>{' '}
      </ButtonRow>

      <H2>Backup</H2>
      {backupError && (
        <P>
          <Icons.Danger color="danger" /> {backupError}
        </P>
      )}
      <ButtonRow>
        <Button onPress={saveBackup} disabled={isBackingUp}>
          {isBackingUp ? 'Saving…' : 'Save Backup'}
        </Button>
      </ButtonRow>

      <H2>Logs</H2>
      <ButtonRow>
        <ExportLogsButton
          usbDriveStatus={usbDriveStatus}
          auth={auth}
          logger={logger}
          onExportLogs={doExportLogs}
        />
      </ButtonRow>

      <H2>Date and Time</H2>
      <P>
        <CurrentDateAndTime />
      </P>
      <ButtonRow>
        <SetClockButton logOut={() => logOutMutation.mutate()}>
          Set Date and Time
        </SetClockButton>
      </ButtonRow>
      {!canUnconfigure && !isTestMode && (
        <P>
          <Icons.Warning color="warning" /> You must &quot;Save Backup&quot;
          before you may delete election data.
        </P>
      )}
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
              <Button variant="danger" icon="Delete" onPress={deleteBallotData}>
                Yes, Delete Ballot Data
              </Button>
              <Button onPress={resetDeleteBallotDataFlow}>Cancel</Button>
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
    </NavigationScreen>
  );
}
