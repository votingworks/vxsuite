import { ElectionDefinition } from '@votingworks/types';
import React, { useCallback, useState, useContext } from 'react';
import { LogEventId } from '@votingworks/logging';
import { assert, Result } from '@votingworks/basics';
import {
  Button,
  ExportLogsButtonRow,
  LinkButton,
  Loading,
  Main,
  Modal,
  Screen,
  SetClockButton,
  Text,
} from '@votingworks/ui';
import { isElectionManagerAuth } from '@votingworks/utils';
import { Scan } from '@votingworks/api';
import { useHistory } from 'react-router-dom';
import { MainNav } from '../components/main_nav';
import { Prose } from '../components/prose';
import { ToggleTestModeButton } from '../components/toggle_test_mode_button';
import { SetMarkThresholdsModal } from '../components/set_mark_thresholds_modal';
import { AppContext } from '../contexts/app_context';
import {
  getMarkThresholdOverrides,
  logOut,
  unconfigure,
  zeroScanningData,
} from '../api';

export interface AdminActionScreenProps {
  backup: () => Promise<Result<string[], Scan.BackupError | Error>>;
  hasBatches: boolean;
  isTestMode: boolean;
  canUnconfigure: boolean;
  electionDefinition: ElectionDefinition;
}

export function AdminActionsScreen({
  backup,
  hasBatches,
  isTestMode,
  canUnconfigure,
  electionDefinition,
}: AdminActionScreenProps): JSX.Element {
  const history = useHistory();
  const { logger, auth, usbDriveStatus, usbDriveEject, machineConfig } =
    useContext(AppContext);
  assert(isElectionManagerAuth(auth));
  const userRole = auth.user.role;
  const logOutMutation = logOut.useMutation();
  const unconfigureMutation = unconfigure.useMutation();
  const zeroScanningDataMutation = zeroScanningData.useMutation();
  const markThresholdOverridesQuery = getMarkThresholdOverrides.useQuery();

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
    usbDriveEject(userRole);
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
    zeroScanningDataMutation.mutate(undefined, {
      onSuccess: redirectToDashboard,
    });
  }

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupError, setBackupError] = useState('');
  const exportBackup = useCallback(async () => {
    setBackupError('');
    setIsBackingUp(true);
    const result = await backup();
    if (result.isErr()) {
      const error = result.err();
      setBackupError(error.message);
      await logger.log(LogEventId.SavedScanImageBackup, userRole, {
        disposition: 'failure',
        message: `Error saving ballot data backup: ${error.message}`,
        result: 'No backup saved.',
      });
    } else {
      await logger.log(LogEventId.SavedScanImageBackup, userRole, {
        disposition: 'success',
        message: 'User successfully saved ballot data backup files.',
      });
    }
    setIsBackingUp(false);
  }, [backup, logger, userRole]);

  const [isSetMarkThresholdModalOpen, setIsMarkThresholdModalOpen] =
    useState(false);

  const markThresholdOverrides = markThresholdOverridesQuery.data ?? undefined;

  return (
    <React.Fragment>
      <Screen>
        <Main padded>
          <Prose>
            <h1>Admin Actions</h1>
            <p>
              <ToggleTestModeButton
                isTestMode={isTestMode}
                canUnconfigure={canUnconfigure}
              />
            </p>
            <p>
              <Button
                onPress={() => setIsMarkThresholdModalOpen(true)}
                disabled={hasBatches}
              >
                {markThresholdOverrides
                  ? 'Reset Mark Thresholds'
                  : 'Override Mark Thresholds'}
              </Button>
            </p>
            {backupError && <p style={{ color: 'red' }}>{backupError}</p>}
            <p>
              <Button onPress={exportBackup} disabled={isBackingUp}>
                {isBackingUp ? 'Saving…' : 'Save Backup'}
              </Button>
            </p>
            <ExportLogsButtonRow
              electionDefinition={electionDefinition}
              usbDriveStatus={usbDriveStatus}
              auth={auth}
              logger={logger}
              machineConfig={machineConfig}
            />
            <p>
              <SetClockButton logOut={() => logOutMutation.mutate()}>
                Update Date and Time
              </SetClockButton>
            </p>
            <p>
              <Button
                variant="danger"
                disabled={!canUnconfigure}
                onPress={() => setDeleteBallotDataFlowState('confirmation')}
              >
                Delete Ballot Data
              </Button>
            </p>

            <p>
              <Button
                variant="danger"
                disabled={!canUnconfigure}
                onPress={() => setUnconfigureFlowState('initial-confirmation')}
              >
                Delete Election Data from VxCentralScan
              </Button>{' '}
              {!canUnconfigure && !isTestMode && (
                <React.Fragment>
                  <br />
                  <Text as="span" warning warningIcon>
                    You must &quot;Save Backup&quot; before you may delete
                    election data.
                  </Text>
                </React.Fragment>
              )}
            </p>
          </Prose>
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
          centerContent
          content={
            <Prose textCenter>
              <h1>Delete All Scanned Ballot Data?</h1>
              <p>
                This will permanently delete all scanned ballot data and reset
                the scanner to only be configured with the current election,
                with the default mark thresholds.
              </p>
            </Prose>
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
          centerContent
          content={
            <Prose textCenter>
              <h1>Delete all election data?</h1>
              <p>
                This will delete the election configuration and all the scanned
                ballot data from VxCentralScan.
              </p>
              {usbDriveStatus === 'mounted' && (
                <p>It will also eject the USB drive.</p>
              )}
            </Prose>
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
          centerContent
          content={
            <Prose textCenter>
              <h1>Are you sure?</h1>
              <p>This can not be undone.</p>
            </Prose>
          }
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
      {isSetMarkThresholdModalOpen && (
        <SetMarkThresholdsModal
          markThresholds={electionDefinition.election.markThresholds}
          markThresholdOverrides={markThresholdOverrides}
          onClose={() => setIsMarkThresholdModalOpen(false)}
        />
      )}
      {isBackingUp && (
        <Modal centerContent content={<Loading>Saving Backup</Loading>} />
      )}
    </React.Fragment>
  );
}
