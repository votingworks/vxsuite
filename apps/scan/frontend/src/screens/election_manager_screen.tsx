import { ElectionDefinition } from '@votingworks/types';
import {
  Button,
  CurrentDateAndTime,
  Loading,
  Modal,
  SegmentedButton,
  SetClockButton,
  ChangePrecinctButton,
  P,
  TabbedSection,
  H1,
  ExportLogsButtonRow,
} from '@votingworks/ui';
import React, { useState } from 'react';
import type { PrecinctScannerStatus } from '@votingworks/scan-backend';
import { Logger, LogSource } from '@votingworks/logging';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { ExportResultsModal } from '../components/export_results_modal';
import { Screen } from '../components/layout';
import {
  ejectUsbDrive,
  getAuthStatus,
  getConfig,
  getMachineConfig,
  getUsbDriveStatus,
  logOut,
  setIsSoundMuted,
  setIsUltrasonicDisabled,
  setPrecinctSelection,
  setTestMode,
  supportsUltrasonic,
  unconfigureElection,
} from '../api';
import { usePreviewContext } from '../preview_dashboard';
import { LiveCheckButton } from '../components/live_check_button';
import { CastVoteRecordSyncReminderModal } from '../components/cast_vote_record_sync_modal';

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
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const authStatusQuery = getAuthStatus.useQuery();
  const machineConfigQuery = getMachineConfig.useQuery();
  const setPrecinctSelectionMutation = setPrecinctSelection.useMutation();
  const setTestModeMutation = setTestMode.useMutation();
  const setIsSoundMutedMutation = setIsSoundMuted.useMutation();
  const setIsUltrasonicDisabledMutation = setIsUltrasonicDisabled.useMutation();
  const unconfigureMutation = unconfigureElection.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();
  const logOutMutation = logOut.useMutation();

  const [isConfirmingSwitchToTestMode, setIsConfirmingSwitchToTestMode] =
    useState(false);

  const [isExportingResults, setIsExportingResults] = useState(false);

  const [isConfirmingUnconfigure, setIsConfirmingUnconfigure] = useState(false);
  const [isUnconfiguring, setIsUnconfiguring] = useState(false);

  if (
    !configQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess ||
    !authStatusQuery.isSuccess ||
    !machineConfigQuery.isSuccess
  ) {
    return null;
  }

  const { election } = electionDefinition;
  const {
    precinctSelection,
    isTestMode,
    isSoundMuted,
    isUltrasonicDisabled,
    pollsState,
  } = configQuery.data;
  const authStatus = authStatusQuery.data;
  const machineConfig = machineConfigQuery.data;

  const doesUsbDriveRequireCastVoteRecordSync = Boolean(
    usbDriveStatusQuery.data.doesUsbDriveRequireCastVoteRecordSync
  );

  function switchMode() {
    setTestModeMutation.mutate(
      { isTestMode: !isTestMode },
      {
        onSuccess() {
          setIsConfirmingSwitchToTestMode(false);
        },
      }
    );
  }

  function unconfigure() {
    setIsUnconfiguring(true);
    // If there is a mounted usb eject it so that it doesn't auto reconfigure the machine.
    // TODO move this to the backend?
    if (usbDrive.status === 'mounted') {
      ejectUsbDriveMutation.mutate(undefined, {
        onSuccess() {
          unconfigureMutation.mutate();
        },
      });
    } else {
      unconfigureMutation.mutate();
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
        onChange={() => {
          if (!isTestMode && scannerStatus.ballotsCounted > 0) {
            setIsConfirmingSwitchToTestMode(true);
            return;
          }
          switchMode();
        }}
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
      <SetClockButton large logOut={() => logOutMutation.mutate()}>
        <span role="img" aria-label="Clock">
          🕓
        </span>{' '}
        <CurrentDateAndTime />
      </SetClockButton>
    </P>
  );

  const dataExportButtons = (
    <React.Fragment>
      <P>
        <Button onPress={() => setIsExportingResults(true)}>Save CVRs</Button>{' '}
      </P>
      <ExportLogsButtonRow
        electionDefinition={electionDefinition}
        usbDriveStatus={usbDrive}
        auth={authStatus}
        logger={logger}
        machineConfig={machineConfig}
      />
    </React.Fragment>
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
      <Button onPress={() => setIsConfirmingUnconfigure(true)}>
        Delete All Election Data from VxScan
      </Button>
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
                {doubleSheetDetectionToggle}
                {dateTimeButton}
                {audioMuteToggle}
                {isFeatureFlagEnabled(
                  BooleanEnvironmentVariableName.LIVECHECK
                ) && <LiveCheckButton />}
              </React.Fragment>
            ),
          },
        ]}
      />

      {isConfirmingSwitchToTestMode &&
        (() => {
          if (doesUsbDriveRequireCastVoteRecordSync) {
            return (
              <CastVoteRecordSyncReminderModal
                blockedAction="switch_to_test_mode"
                closeModal={() => setIsConfirmingSwitchToTestMode(false)}
              />
            );
          }
          return (
            <Modal
              title="Switch to Test Mode?"
              content={
                <P>
                  Do you want to switch to test mode and clear the ballots
                  scanned at this scanner?
                </P>
              }
              actions={
                <React.Fragment>
                  <Button onPress={switchMode} variant="danger" icon="Danger">
                    Yes, Switch
                  </Button>
                  <Button
                    onPress={() => setIsConfirmingSwitchToTestMode(false)}
                  >
                    Cancel
                  </Button>
                </React.Fragment>
              }
              onOverlayClick={() => setIsConfirmingSwitchToTestMode(false)}
            />
          );
        })()}

      {isConfirmingUnconfigure &&
        (() => {
          if (isUnconfiguring) {
            return <Modal content={<Loading />} />;
          }
          if (doesUsbDriveRequireCastVoteRecordSync && !isTestMode) {
            return (
              <CastVoteRecordSyncReminderModal
                blockedAction="delete_election_data"
                closeModal={() => setIsConfirmingUnconfigure(false)}
              />
            );
          }
          return (
            <Modal
              title="Delete All Election Data?"
              content={
                <P>
                  Do you want to remove all election information and data from
                  this machine?
                </P>
              }
              actions={
                <React.Fragment>
                  <Button onPress={unconfigure} variant="danger" icon="Delete">
                    Yes, Delete All
                  </Button>
                  <Button onPress={() => setIsConfirmingUnconfigure(false)}>
                    Cancel
                  </Button>
                </React.Fragment>
              }
              onOverlayClick={() => setIsConfirmingUnconfigure(false)}
            />
          );
        })()}

      {isExportingResults && (
        <ExportResultsModal
          onClose={() => setIsExportingResults(false)}
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
      }}
      usbDrive={{ status: 'no_drive' }}
      logger={new Logger(LogSource.VxScanFrontend)}
    />
  );
}
