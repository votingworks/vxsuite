import {
  MarkThresholds,
  ok,
  PrecinctSelection,
  PollsState,
} from '@votingworks/types';
import {
  Button,
  CurrentDateAndTime,
  Loading,
  Modal,
  Prose,
  SegmentedButton,
  SetClockButton,
  UsbDrive,
  isElectionManagerAuth,
  ChangePrecinctButton,
} from '@votingworks/ui';
import { assert } from '@votingworks/utils';
import React, { useCallback, useContext, useState } from 'react';
import { Logger, LogSource } from '@votingworks/logging';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { PrecinctScannerStatus } from '@votingworks/vx-scan-backend';
import { CalibrateScannerModal } from '../components/calibrate_scanner_modal';
import { ExportBackupModal } from '../components/export_backup_modal';
import { ExportResultsModal } from '../components/export_results_modal';
import { ScannedBallotCount } from '../components/scanned_ballot_count';
import { ScreenMainCenterChild } from '../components/layout';
import { AppContext } from '../contexts/app_context';
import { SetMarkThresholdsModal } from '../components/set_mark_thresholds_modal';
import { mockUsbDrive } from '../../test/helpers/mock_usb_drive';
import { setIsSoundMuted, setTestMode, unconfigureElection } from '../api';

export const SELECT_PRECINCT_TEXT = 'Select a precinct for this device…';

export interface ElectionManagerScreenProps {
  scannerStatus: PrecinctScannerStatus;
  isTestMode: boolean;
  pollsState: PollsState;
  updatePrecinctSelection(precinctSelection: PrecinctSelection): Promise<void>;
  setMarkThresholdOverrides: (markThresholds?: MarkThresholds) => Promise<void>;
  usbDrive: UsbDrive;
}

export function ElectionManagerScreen({
  scannerStatus,
  isTestMode,
  pollsState,
  updatePrecinctSelection,
  setMarkThresholdOverrides,
  usbDrive,
}: ElectionManagerScreenProps): JSX.Element {
  const setTestModeMutation = setTestMode.useMutation();
  const setIsSoundMutedMutation = setIsSoundMuted.useMutation();
  const unconfigureMutation = unconfigureElection.useMutation();
  const {
    electionDefinition,
    precinctSelection,
    markThresholdOverrides,
    auth,
    isSoundMuted,
    logger,
  } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  assert(isElectionManagerAuth(auth));
  const userRole = auth.user.role;

  const [
    isShowingToggleTestModeWarningModal,
    setIsShowingToggleTestModeWarningModal,
  ] = useState(false);
  const openToggleTestModeWarningModal = useCallback(
    () => setIsShowingToggleTestModeWarningModal(true),
    []
  );
  const closeToggleTestModeWarningModal = useCallback(
    () => setIsShowingToggleTestModeWarningModal(false),
    []
  );

  const [isExportingResults, setIsExportingResults] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);

  const [confirmUnconfigure, setConfirmUnconfigure] = useState(false);
  const openConfirmUnconfigureModal = useCallback(
    () => setConfirmUnconfigure(true),
    []
  );
  const closeConfirmUnconfigureModal = useCallback(
    () => setConfirmUnconfigure(false),
    []
  );
  const [isCalibratingScanner, setIsCalibratingScanner] = useState(false);
  const openCalibrateScannerModal = useCallback(
    () => setIsCalibratingScanner(true),
    []
  );
  const closeCalibrateScannerModal = useCallback(
    () => setIsCalibratingScanner(false),
    []
  );

  const [isMarkThresholdModalOpen, setIsMarkThresholdModalOpen] =
    useState(false);

  function handleTogglingTestMode() {
    if (!isTestMode && !scannerStatus.canUnconfigure) {
      openToggleTestModeWarningModal();
    } else {
      setTestModeMutation.mutate({ isTestMode: !isTestMode });
    }
  }

  const [isUnconfiguring, setIsUnconfiguring] = useState(false);
  async function handleUnconfigure() {
    setIsUnconfiguring(true);
    // If there is a mounted usb eject it so that it doesn't auto reconfigure the machine.
    if (usbDrive.status === 'mounted') {
      await usbDrive.eject(userRole);
    }
    unconfigureMutation.mutate({});
  }

  return (
    <ScreenMainCenterChild infoBarMode="admin">
      <Prose textCenter>
        <h1>Election Manager Settings</h1>
        {election.precincts.length > 1 && (
          <ChangePrecinctButton
            appPrecinctSelection={precinctSelection}
            updatePrecinctSelection={updatePrecinctSelection}
            election={election}
            mode={
              pollsState === 'polls_closed_initial'
                ? 'default'
                : pollsState !== 'polls_closed_final' &&
                  scannerStatus.ballotsCounted === 0
                ? 'confirmation_required'
                : 'disabled'
            }
            logger={logger}
          />
        )}
        <p>
          <SegmentedButton>
            <Button
              large
              onPress={handleTogglingTestMode}
              disabled={isTestMode || setTestModeMutation.isLoading}
            >
              Testing Mode
            </Button>
            <Button
              large
              onPress={handleTogglingTestMode}
              disabled={!isTestMode || setTestModeMutation.isLoading}
            >
              Live Election Mode
            </Button>
          </SegmentedButton>
        </p>
        <p>
          <SetClockButton large>
            <span role="img" aria-label="Clock">
              🕓
            </span>{' '}
            <CurrentDateAndTime />
          </SetClockButton>
        </p>
        <p>
          <Button onPress={() => setIsExportingResults(true)}>Save CVRs</Button>{' '}
          <Button onPress={() => setIsExportingBackup(true)}>
            Save Backup
          </Button>
        </p>
        <p>
          <Button onPress={() => setIsMarkThresholdModalOpen(true)}>
            {markThresholdOverrides === undefined
              ? 'Override Mark Thresholds'
              : 'Reset Mark Thresholds'}
          </Button>
        </p>
        <p>
          <Button onPress={openCalibrateScannerModal}>Calibrate Scanner</Button>
        </p>
        <p>
          <Button
            onPress={() =>
              setIsSoundMutedMutation.mutate({
                isSoundMuted: !isSoundMuted,
              })
            }
          >
            {isSoundMuted ? 'Unmute Sounds' : 'Mute Sounds'}
          </Button>
        </p>
        <p>
          <Button
            disabled={!scannerStatus.canUnconfigure}
            danger
            small
            onPress={openConfirmUnconfigureModal}
          >
            <span role="img" aria-label="Warning">
              ⚠️
            </span>{' '}
            Delete All Election Data from VxScan
          </Button>
        </p>
        {!scannerStatus.canUnconfigure && (
          <p>
            You must “Save Backup” before you can delete election data from
            VxScan.
          </p>
        )}
      </Prose>
      <ScannedBallotCount count={scannerStatus.ballotsCounted} />
      {isMarkThresholdModalOpen && (
        <SetMarkThresholdsModal
          setMarkThresholdOverrides={setMarkThresholdOverrides}
          markThresholds={electionDefinition.election.markThresholds}
          markThresholdOverrides={markThresholdOverrides}
          onClose={() => setIsMarkThresholdModalOpen(false)}
        />
      )}
      {isShowingToggleTestModeWarningModal && (
        <Modal
          content={
            <Prose>
              <h1>Save Backup to switch to Test Mode</h1>
              <p>
                You must &quot;Save Backup&quot; before you may switch to
                Testing Mode.
              </p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button
                primary
                onPress={() => {
                  closeToggleTestModeWarningModal();
                  setIsExportingBackup(true);
                }}
              >
                Save Backup
              </Button>
              <Button onPress={closeToggleTestModeWarningModal}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={closeToggleTestModeWarningModal}
        />
      )}
      {confirmUnconfigure && (
        <Modal
          content={
            isUnconfiguring ? (
              <Loading />
            ) : (
              <Prose>
                <h1>Delete All Election Data?</h1>
                <p>
                  Do you want to remove all election information and data from
                  this machine?
                </p>
              </Prose>
            )
          }
          actions={
            !isUnconfiguring && (
              <React.Fragment>
                <Button danger onPress={handleUnconfigure}>
                  Yes, Delete All
                </Button>
                <Button onPress={closeConfirmUnconfigureModal}>Cancel</Button>
              </React.Fragment>
            )
          }
          onOverlayClick={closeConfirmUnconfigureModal}
        />
      )}

      {isCalibratingScanner && (
        <CalibrateScannerModal
          scannerStatus={scannerStatus}
          onCancel={closeCalibrateScannerModal}
        />
      )}
      {isExportingResults && (
        <ExportResultsModal
          onClose={() => setIsExportingResults(false)}
          usbDrive={usbDrive}
        />
      )}
      {isExportingBackup && (
        <ExportBackupModal
          onClose={() => setIsExportingBackup(false)}
          usbDrive={usbDrive}
        />
      )}
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  const { machineConfig, electionDefinition } = useContext(AppContext);
  const [precinctSelection, setPrecinctSelection] =
    useState<PrecinctSelection>();
  assert(electionDefinition);
  return (
    <AppContext.Provider
      value={{
        machineConfig,
        electionDefinition,
        precinctSelection,
        markThresholdOverrides: undefined,
        isSoundMuted: false,
        auth: {
          status: 'logged_in',
          user: {
            role: 'election_manager',
            electionHash: electionDefinition.electionHash,
            passcode: '000000',
          },
          card: {
            hasStoredData: false,
            readStoredObject: () => Promise.resolve(ok(undefined)),
            readStoredString: () => Promise.resolve(ok(undefined)),
            readStoredUint8Array: () => Promise.resolve(ok(new Uint8Array())),
            writeStoredData: () => Promise.resolve(ok()),
            clearStoredData: () => Promise.resolve(ok()),
          },
        },
        logger: new Logger(LogSource.VxScanFrontend),
      }}
    >
      <ElectionManagerScreen
        scannerStatus={{
          state: 'no_paper',
          ballotsCounted: 1234,
          canUnconfigure: true,
        }}
        isTestMode={false}
        pollsState="polls_closed_initial"
        setMarkThresholdOverrides={() => Promise.resolve()}
        // eslint-disable-next-line @typescript-eslint/require-await
        updatePrecinctSelection={async (newPrecinctSelection) =>
          setPrecinctSelection(newPrecinctSelection)
        }
        usbDrive={mockUsbDrive('absent')}
      />
    </AppContext.Provider>
  );
}
