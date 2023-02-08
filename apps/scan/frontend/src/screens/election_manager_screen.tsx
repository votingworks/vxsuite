import { ElectionDefinition } from '@votingworks/types';
import {
  Button,
  CurrentDateAndTime,
  Loading,
  Modal,
  Prose,
  SegmentedButton,
  SetClockButton,
  UsbDrive,
  ChangePrecinctButton,
} from '@votingworks/ui';
import React, { useState } from 'react';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { PrecinctScannerStatus } from '@votingworks/scan-backend';
import { Logger, LogSource } from '@votingworks/logging';
import { CalibrateScannerModal } from '../components/calibrate_scanner_modal';
import { ExportBackupModal } from '../components/export_backup_modal';
import { ExportResultsModal } from '../components/export_results_modal';
import { ScannedBallotCount } from '../components/scanned_ballot_count';
import { ScreenMainCenterChild } from '../components/layout';
import { SetMarkThresholdsModal } from '../components/set_mark_thresholds_modal';
import {
  getConfig,
  setIsSoundMuted,
  setPrecinctSelection,
  setTestMode,
  supportsCalibration,
  unconfigureElection,
} from '../api';
import { usePreviewContext } from '../preview_dashboard';

export const SELECT_PRECINCT_TEXT = 'Select a precinct for this device…';

export interface ElectionManagerScreenProps {
  // We pass electionDefinition in as a prop because the preview dashboard needs
  // to be able to change it (otherwise we would just use the configQuery
  electionDefinition: ElectionDefinition;
  scannerStatus: PrecinctScannerStatus;
  usbDrive: UsbDrive;
  logger: Logger;
}

export function ElectionManagerScreen({
  electionDefinition,
  scannerStatus,
  usbDrive,
  logger,
}: ElectionManagerScreenProps): JSX.Element | null {
  const supportsCalibrationQuery = supportsCalibration.useQuery();
  const configQuery = getConfig.useQuery();
  const setPrecinctSelectionMutation = setPrecinctSelection.useMutation();
  const setTestModeMutation = setTestMode.useMutation();
  const setIsSoundMutedMutation = setIsSoundMuted.useMutation();
  const unconfigureMutation = unconfigureElection.useMutation();

  const [
    isShowingToggleTestModeWarningModal,
    setIsShowingToggleTestModeWarningModal,
  ] = useState(false);

  const [isExportingResults, setIsExportingResults] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);

  const [confirmUnconfigure, setConfirmUnconfigure] = useState(false);
  const [isCalibratingScanner, setIsCalibratingScanner] = useState(false);
  const [isMarkThresholdModalOpen, setIsMarkThresholdModalOpen] =
    useState(false);
  const [isUnconfiguring, setIsUnconfiguring] = useState(false);

  if (!configQuery.isSuccess) return null;

  const { election } = electionDefinition;
  const {
    precinctSelection,
    isTestMode,
    isSoundMuted,
    markThresholdOverrides,
    pollsState,
  } = configQuery.data;

  function handleTogglingTestMode() {
    if (!isTestMode && !scannerStatus.canUnconfigure) {
      setIsShowingToggleTestModeWarningModal(true);
    } else {
      setTestModeMutation.mutate({ isTestMode: !isTestMode });
    }
  }

  async function handleUnconfigure() {
    setIsUnconfiguring(true);
    // If there is a mounted usb eject it so that it doesn't auto reconfigure the machine.
    if (usbDrive.status === 'mounted') {
      await usbDrive.eject('election_manager');
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
            updatePrecinctSelection={async (newPrecinctSelection) => {
              try {
                await setPrecinctSelectionMutation.mutateAsync({
                  precinctSelection: newPrecinctSelection,
                });
              } catch (error) {
                // Handled by default query client error handling
              }
            }}
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
          <Button
            disabled={supportsCalibrationQuery.data === false}
            onPress={() => setIsCalibratingScanner(true)}
            title={
              !supportsCalibrationQuery.data
                ? 'This scanner does not support calibration.'
                : undefined
            }
          >
            Calibrate Scanner
          </Button>
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
            onPress={() => setConfirmUnconfigure(true)}
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
                  setIsShowingToggleTestModeWarningModal(false);
                  setIsExportingBackup(true);
                }}
              >
                Save Backup
              </Button>
              <Button
                onPress={() => setIsShowingToggleTestModeWarningModal(false)}
              >
                Cancel
              </Button>
            </React.Fragment>
          }
          onOverlayClick={() => setIsShowingToggleTestModeWarningModal(false)}
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
                <Button onPress={() => setConfirmUnconfigure(false)}>
                  Cancel
                </Button>
              </React.Fragment>
            )
          }
          onOverlayClick={() => setConfirmUnconfigure(false)}
        />
      )}

      {isCalibratingScanner && (
        <CalibrateScannerModal
          scannerStatus={scannerStatus}
          onCancel={() => setIsCalibratingScanner(false)}
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
  const { electionDefinition } = usePreviewContext();
  return (
    <ElectionManagerScreen
      electionDefinition={electionDefinition}
      scannerStatus={{
        state: 'no_paper',
        ballotsCounted: 1234,
        canUnconfigure: true,
      }}
      usbDrive={{
        status: 'absent',
        eject: () => {
          return Promise.resolve();
        },
        format: () => {
          return Promise.resolve();
        },
      }}
      logger={new Logger(LogSource.VxScanFrontend)}
    />
  );
}
