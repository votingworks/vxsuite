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
  H1,
  P,
} from '@votingworks/ui';
import React, { useState } from 'react';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { PrecinctScannerStatus } from '@votingworks/scan-backend';
import { Logger, LogSource } from '@votingworks/logging';
import { CalibrateScannerModal } from '../components/calibrate_scanner_modal';
import { ExportBackupModal } from '../components/export_backup_modal';
import { ExportResultsModal } from '../components/export_results_modal';
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
    <ScreenMainCenterChild
      infoBarMode="admin"
      ballotCountOverride={scannerStatus.ballotsCounted}
    >
      <Prose textCenter>
        <H1>Election Manager Settings</H1>
        {election.precincts.length > 1 && (
          <P>
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
          </P>
        )}
        <P>
          <SegmentedButton
            disabled={setTestModeMutation.isLoading}
            label="Ballot Mode:"
            hideLabel
            onChange={handleTogglingTestMode}
            options={[
              { id: 'test', label: 'Test Ballot Mode' },
              { id: 'official', label: 'Official Ballot Mode' },
            ]}
            selectedOptionId={isTestMode ? 'test' : 'official'}
          />
        </P>
        <P>
          <SetClockButton large>
            <span role="img" aria-label="Clock">
              🕓
            </span>{' '}
            <CurrentDateAndTime />
          </SetClockButton>
        </P>
        <P>
          <Button onPress={() => setIsExportingResults(true)}>Save CVRs</Button>{' '}
          <Button onPress={() => setIsExportingBackup(true)}>
            Save Backup
          </Button>
        </P>
        <P>
          <Button onPress={() => setIsMarkThresholdModalOpen(true)}>
            {markThresholdOverrides === undefined
              ? 'Override Mark Thresholds'
              : 'Reset Mark Thresholds'}
          </Button>
        </P>
        <P>
          <Button
            disabled={supportsCalibrationQuery.data === false}
            onPress={() => setIsCalibratingScanner(true)}
            nonAccessibleTitle={
              !supportsCalibrationQuery.data
                ? 'This scanner does not support calibration.'
                : undefined
            }
          >
            Calibrate Scanner
          </Button>
        </P>
        <P>
          <Button
            onPress={() =>
              setIsSoundMutedMutation.mutate({
                isSoundMuted: !isSoundMuted,
              })
            }
          >
            {isSoundMuted ? 'Unmute Sounds' : 'Mute Sounds'}
          </Button>
        </P>
        <P>
          <Button
            disabled={!scannerStatus.canUnconfigure}
            variant="danger"
            small
            onPress={() => setConfirmUnconfigure(true)}
          >
            Delete All Election Data from VxScan
          </Button>
        </P>
        {!scannerStatus.canUnconfigure && (
          <P>
            You must “Save Backup” before you can delete election data from
            VxScan.
          </P>
        )}
      </Prose>
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
              <H1>Save Backup to switch to Test Ballot Mode</H1>
              <P>
                You must &quot;Save Backup&quot; before you may switch to Test
                Ballot Mode.
              </P>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button
                variant="primary"
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
                <H1>Delete All Election Data?</H1>
                <P>
                  Do you want to remove all election information and data from
                  this machine?
                </P>
              </Prose>
            )
          }
          actions={
            !isUnconfiguring && (
              <React.Fragment>
                <Button variant="danger" onPress={handleUnconfigure}>
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
