import { ElectionDefinition } from '@votingworks/types';
import {
  Button,
  CurrentDateAndTime,
  Loading,
  Modal,
  Prose,
  SegmentedButton,
  SetClockButton,
  ChangePrecinctButton,
  P,
  Caption,
  TabbedSection,
  H1,
} from '@votingworks/ui';
import React, { useState } from 'react';
import type { PrecinctScannerStatus } from '@votingworks/scan-backend';
import { Logger, LogSource } from '@votingworks/logging';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { isElectionManagerAuth } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { ExportBackupModal } from '../components/export_backup_modal';
import { ExportResultsModal } from '../components/export_results_modal';
import { Screen } from '../components/layout';
import { SetMarkThresholdsModal } from '../components/set_mark_thresholds_modal';
import {
  ejectUsbDrive,
  getAuthStatus,
  getConfig,
  setIsSoundMuted,
  setIsUltrasonicDisabled,
  setPrecinctSelection,
  setTestMode,
  supportsUltrasonic,
  unconfigureElection,
  updateSessionExpiry,
} from '../api';
import { usePreviewContext } from '../preview_dashboard';

export const SELECT_PRECINCT_TEXT = 'Select a precinct for this device…';

export interface ElectionManagerScreenProps {
  // We pass electionDefinition in as a prop because the preview dashboard needs
  // to be able to change it (otherwise we would just use the configQuery
  electionDefinition: ElectionDefinition;
  scannerStatus: PrecinctScannerStatus;
  usbDrive: UsbDriveStatus;
  logger: Logger;
}

export function ElectionManagerScreen({
  electionDefinition,
  scannerStatus,
  usbDrive,
  logger,
}: ElectionManagerScreenProps): JSX.Element | null {
  const supportsUltrasonicQuery = supportsUltrasonic.useQuery();
  const configQuery = getConfig.useQuery();
  const authStatusQuery = getAuthStatus.useQuery();
  const setPrecinctSelectionMutation = setPrecinctSelection.useMutation();
  const setTestModeMutation = setTestMode.useMutation();
  const setIsSoundMutedMutation = setIsSoundMuted.useMutation();
  const setIsUltrasonicDisabledMutation = setIsUltrasonicDisabled.useMutation();
  const unconfigureMutation = unconfigureElection.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();
  const updateSessionExpiryMutation = updateSessionExpiry.useMutation();

  const [
    isShowingToggleTestModeWarningModal,
    setIsShowingToggleTestModeWarningModal,
  ] = useState(false);

  const [isExportingResults, setIsExportingResults] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);

  const [confirmUnconfigure, setConfirmUnconfigure] = useState(false);
  const [isMarkThresholdModalOpen, setIsMarkThresholdModalOpen] =
    useState(false);
  const [isUnconfiguring, setIsUnconfiguring] = useState(false);

  if (!configQuery.isSuccess || !authStatusQuery.isSuccess) {
    return null;
  }

  const { election } = electionDefinition;
  const {
    precinctSelection,
    isTestMode,
    isSoundMuted,
    isUltrasonicDisabled,
    markThresholdOverrides,
    pollsState,
  } = configQuery.data;
  const authStatus = authStatusQuery.data;
  assert(isElectionManagerAuth(authStatus));

  function handleTogglingTestMode() {
    if (!isTestMode && !scannerStatus.canUnconfigure) {
      setIsShowingToggleTestModeWarningModal(true);
    } else {
      setTestModeMutation.mutate({ isTestMode: !isTestMode });
    }
  }

  function handleUnconfigure() {
    setIsUnconfiguring(true);
    // If there is a mounted usb eject it so that it doesn't auto reconfigure the machine.
    // TODO move this to the backend?
    if (usbDrive.status === 'mounted') {
      ejectUsbDriveMutation.mutate(undefined, {
        onSuccess() {
          unconfigureMutation.mutate({});
        },
      });
    } else {
      unconfigureMutation.mutate({});
    }
  }

  const changePrecinctButton = election.precincts.length > 1 && (
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
  );

  const ballotMode = (
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
  );

  const dateTimeButton = (
    <P>
      <SetClockButton
        large
        sessionExpiresAt={authStatus.sessionExpiresAt}
        updateSessionExpiry={async (sessionExpiresAt: Date) => {
          try {
            await updateSessionExpiryMutation.mutateAsync({
              sessionExpiresAt,
            });
          } catch {
            // Handled by default query client error handling
          }
        }}
      >
        <span role="img" aria-label="Clock">
          🕓
        </span>{' '}
        <CurrentDateAndTime />
      </SetClockButton>
    </P>
  );

  const dataExportButtons = (
    <P>
      <Button onPress={() => setIsExportingResults(true)}>Save CVRs</Button>{' '}
      <Button onPress={() => setIsExportingBackup(true)}>Save Backup</Button>
    </P>
  );

  const overrideThresholdsButton = (
    <P>
      <Button onPress={() => setIsMarkThresholdModalOpen(true)}>
        {markThresholdOverrides === undefined
          ? 'Override Mark Thresholds'
          : 'Reset Mark Thresholds'}
      </Button>
    </P>
  );

  const doubleSheetDetectionToggle = (
    <P>
      {supportsUltrasonicQuery.data === true && (
        <Button
          onPress={() =>
            setIsUltrasonicDisabledMutation.mutate({
              isUltrasonicDisabled: !isUltrasonicDisabled,
            })
          }
        >
          {isUltrasonicDisabled
            ? 'Enable Double Sheet Detection'
            : 'Disable Double Sheet Detection'}
        </Button>
      )}
    </P>
  );

  const audioMuteToggle = (
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
  );

  const unconfigureElectionButton = (
    <P>
      <Button
        disabled={!scannerStatus.canUnconfigure}
        onPress={() => setConfirmUnconfigure(true)}
      >
        Delete All Election Data from VxScan
      </Button>
      <br />
      {!scannerStatus.canUnconfigure && (
        <Caption>
          You must “Save Backup” before you can delete election data from
          VxScan.
        </Caption>
      )}
    </P>
  );

  return (
    <Screen
      infoBarMode="admin"
      ballotCountOverride={scannerStatus.ballotsCounted}
    >
      <H1 as="h1" align="center">
        Election Manager Settings
      </H1>
      <TabbedSection
        ariaLabel="Election Manager Settings"
        tabs={[
          {
            paneId: 'managerSettingsConfiguration',
            label: 'Configuration',
            content: (
              <React.Fragment>
                {changePrecinctButton}
                {ballotMode}
              </React.Fragment>
            ),
          },
          {
            paneId: 'managerSettingsData',
            label: 'Election Data',
            content: (
              <React.Fragment>
                {dataExportButtons}
                {unconfigureElectionButton}
              </React.Fragment>
            ),
          },
          {
            paneId: 'managerSettingsSystem',
            label: 'System Settings',
            content: (
              <React.Fragment>
                {overrideThresholdsButton}
                {doubleSheetDetectionToggle}
                {dateTimeButton}
                {audioMuteToggle}
              </React.Fragment>
            ),
          },
        ]}
      />
      {isMarkThresholdModalOpen && (
        <SetMarkThresholdsModal
          markThresholds={electionDefinition.election.markThresholds}
          markThresholdOverrides={markThresholdOverrides}
          onClose={() => setIsMarkThresholdModalOpen(false)}
        />
      )}
      {isShowingToggleTestModeWarningModal && (
        <Modal
          title="Save Backup to switch to Test Ballot Mode"
          content={
            <Prose>
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
          title={isUnconfiguring ? undefined : 'Delete All Election Data?'}
          content={
            isUnconfiguring ? (
              <Loading />
            ) : (
              <Prose>
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
    </Screen>
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
      usbDrive={{ status: 'no_drive' }}
      logger={new Logger(LogSource.VxScanFrontend)}
    />
  );
}
