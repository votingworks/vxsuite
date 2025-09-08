import { ElectionDefinition } from '@votingworks/types';
import {
  Button,
  Modal,
  SegmentedButton,
  SetClockButton,
  ChangePrecinctButton,
  P,
  TabbedSection,
  ExportLogsButton,
  UnconfigureMachineButton,
  Icons,
  TabConfig,
  PowerDownButton,
  SignedHashValidationButton,
} from '@votingworks/ui';
import React, { useState } from 'react';
import type { PrecinctScannerStatus } from '@votingworks/scan-backend';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import styled from 'styled-components';
import { ExportResultsModal } from '../components/export_results_modal';
import { Screen } from '../components/layout';
import {
  ejectUsbDrive,
  getAuthStatus,
  getConfig,
  getMachineConfig,
  getPollsInfo,
  getPrinterStatus,
  getUsbDriveStatus,
  logOut,
  setIsContinuousExportEnabled,
  setIsSoundMuted,
  setIsDoubleFeedDetectionDisabled,
  setPrecinctSelection,
  setTestMode,
  setEarlyVotingMode,
  unconfigureElection,
  beginDoubleFeedCalibration,
  useApiClient,
} from '../api';
import { ElectionManagerPrinterTabContent } from '../components/printer_management/election_manager_printer_tab_content';
import { DiagnosticsScreen } from './diagnostics_screen';
import { SaveBallotAuditIdSecretKeyButton } from '../components/save_ballot_audit_id_secret_key_button';

const TabPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: start;
`;

export interface ElectionManagerScreenProps {
  // We pass electionDefinition in as a prop because the preview dashboard needs
  // to be able to change it (otherwise we would just use the configQuery
  electionDefinition: ElectionDefinition;
  scannerStatus: PrecinctScannerStatus;
  usbDrive: UsbDriveStatus;
}

export function ElectionManagerScreen({
  electionDefinition,
  scannerStatus,
  usbDrive,
}: ElectionManagerScreenProps): JSX.Element | null {
  const apiClient = useApiClient();
  const configQuery = getConfig.useQuery();
  const pollsInfoQuery = getPollsInfo.useQuery();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const authStatusQuery = getAuthStatus.useQuery();
  const printerStatusQuery = getPrinterStatus.useQuery();
  const machineConfigQuery = getMachineConfig.useQuery();
  const setPrecinctSelectionMutation = setPrecinctSelection.useMutation();
  const setTestModeMutation = setTestMode.useMutation();
  const setIsSoundMutedMutation = setIsSoundMuted.useMutation();
  const setIsDoubleFeedDetectionDisabledMutation =
    setIsDoubleFeedDetectionDisabled.useMutation();
  const beginDoubleFeedCalibrationMutation =
    beginDoubleFeedCalibration.useMutation();
  const unconfigureMutation = unconfigureElection.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();
  const logOutMutation = logOut.useMutation();
  const setIsContinuousExportEnabledMutation =
    setIsContinuousExportEnabled.useMutation();
  const setEarlyVotingModeMutation = setEarlyVotingMode.useMutation();

  const [isConfirmingBallotModeSwitch, setIsConfirmingBallotModeSwitch] =
    useState(false);
  const [isDiagnosticsScreenOpen, setIsDiagnosticsScreenOpen] = useState(false);

  const [isExportingResults, setIsExportingResults] = useState(false);

  if (
    !configQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess ||
    !authStatusQuery.isSuccess ||
    !machineConfigQuery.isSuccess ||
    !pollsInfoQuery.isSuccess ||
    !printerStatusQuery.isSuccess
  ) {
    return null;
  }

  const { election } = electionDefinition;
  const {
    precinctSelection,
    isTestMode,
    isSoundMuted,
    isDoubleFeedDetectionDisabled,
    isContinuousExportEnabled,
    isEarlyVotingMode,
    systemSettings,
  } = configQuery.data;
  const { pollsState } = pollsInfoQuery.data;
  const printerStatus = printerStatusQuery.data;

  const disableConfiguration =
    scannerStatus.state === 'disconnected' || printerStatus.state === 'error';

  const isCvrSyncRequired =
    Boolean(usbDriveStatusQuery.data.doesUsbDriveRequireCastVoteRecordSync) &&
    !isTestMode;

  function switchMode() {
    setTestModeMutation.mutate(
      { isTestMode: !isTestMode },
      {
        onSuccess() {
          setIsConfirmingBallotModeSwitch(false);
        },
      }
    );
  }

  async function unconfigureMachine() {
    try {
      // If there is a mounted usb, eject it so that it doesn't auto reconfigure the machine.
      // TODO move this to the backend?
      await ejectUsbDriveMutation.mutateAsync();
      await unconfigureMutation.mutateAsync();
    } catch {
      // Handled by default query client error handling
    }
  }

  const changePrecinctButton = election.precincts.length > 1 && (
    <ChangePrecinctButton
      appPrecinctSelection={precinctSelection}
      updatePrecinctSelection={async (newPrecinctSelection) => {
        try {
          await setPrecinctSelectionMutation.mutateAsync({
            precinctSelection: newPrecinctSelection,
          });
        } catch {
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
    />
  );

  const ballotMode = (
    <SegmentedButton
      disabled={
        setTestModeMutation.isLoading ||
        isCvrSyncRequired ||
        disableConfiguration
      }
      label="Ballot Mode:"
      hideLabel
      onChange={() => {
        if (scannerStatus.ballotsCounted > 0) {
          setIsConfirmingBallotModeSwitch(true);
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
  );

  const dateTimeButton = (
    <SetClockButton logOut={() => logOutMutation.mutate()}>
      Set Date and Time
    </SetClockButton>
  );

  const dataExportButtons = (
    <React.Fragment>
      <Button onPress={() => setIsExportingResults(true)}>Save CVRs</Button>{' '}
      <Button
        onPress={() =>
          setIsContinuousExportEnabledMutation.mutate({
            isContinuousExportEnabled: !isContinuousExportEnabled,
          })
        }
      >
        {isContinuousExportEnabled ? 'Pause' : 'Resume'} Continuous CVR Export
      </Button>{' '}
      {systemSettings.precinctScanEnableBallotAuditIds && (
        <SaveBallotAuditIdSecretKeyButton />
      )}
      <ExportLogsButton usbDriveStatus={usbDrive} />
    </React.Fragment>
  );

  const doubleSheetDetectionToggle = (
    <Button
      onPress={() =>
        setIsDoubleFeedDetectionDisabledMutation.mutate({
          isDoubleFeedDetectionDisabled: !isDoubleFeedDetectionDisabled,
        })
      }
    >
      {isDoubleFeedDetectionDisabled
        ? 'Enable Double Sheet Detection'
        : 'Disable Double Sheet Detection'}
    </Button>
  );

  const calibrateDoubleSheetDetectionButton = (
    <Button
      disabled={scannerStatus.state === 'disconnected'}
      onPress={() => beginDoubleFeedCalibrationMutation.mutate()}
    >
      Calibrate Double Sheet Detection
    </Button>
  );

  const audioMuteToggle = (
    <Button
      onPress={() =>
        setIsSoundMutedMutation.mutate({
          isSoundMuted: !isSoundMuted,
        })
      }
    >
      {isSoundMuted ? 'Unmute Sounds' : 'Mute Sounds'}
    </Button>
  );

  const earlyVotingModeToggle = (
    <Button
      disabled={
        setEarlyVotingModeMutation.isLoading ||
        isCvrSyncRequired ||
        disableConfiguration ||
        pollsState === 'polls_open' ||
        pollsState === 'polls_closed_final'
      }
      onPress={() =>
        setEarlyVotingModeMutation.mutate({
          isEarlyVotingMode: !isEarlyVotingMode,
        })
      }
    >
      {isEarlyVotingMode
        ? 'Disable Early Voting Mode'
        : 'Enable Early Voting Mode'}
    </Button>
  );

  const unconfigureElectionButton = (
    <UnconfigureMachineButton
      // TODO rename isMachineConfigured -> disabled to be clearer
      isMachineConfigured={!isCvrSyncRequired}
      unconfigureMachine={unconfigureMachine}
    />
  );

  const diagnosticsButton = (
    <Button onPress={() => setIsDiagnosticsScreenOpen(true)}>
      Diagnostics
    </Button>
  );

  const powerDownButton = <PowerDownButton />;

  const cvrSyncRequiredWarning = isCvrSyncRequired ? (
    <div>
      <Icons.Warning color="warning" /> Cast vote records (CVRs) need to be
      synced to the inserted USB drive before you can modify the machine
      configuration. Remove your election manager card to sync.
    </div>
  ) : null;

  const tabs: TabConfig[] = [
    {
      paneId: 'managerSettingsConfiguration',
      label: 'Configuration',
      content: (
        <TabPanel>
          {cvrSyncRequiredWarning}
          {changePrecinctButton}
          {ballotMode}
          {earlyVotingModeToggle}
          {unconfigureElectionButton}
        </TabPanel>
      ),
    },
  ];

  const showWarningIcon = printerStatus.state !== 'idle';

  tabs.push({
    paneId: 'managerSettingsPrinter',
    label: 'Printer',
    icon: showWarningIcon ? 'Warning' : undefined,
    content: <ElectionManagerPrinterTabContent />,
  });

  tabs.push({
    paneId: 'managerSettingsScanner',
    label: 'Scanner',
    content: (
      <TabPanel>
        {calibrateDoubleSheetDetectionButton}
        {doubleSheetDetectionToggle}
      </TabPanel>
    ),
  });

  tabs.push(
    {
      paneId: 'managerSettingsData',
      label: 'CVRs and Logs',
      content: <TabPanel>{dataExportButtons}</TabPanel>,
    },
    {
      paneId: 'managerSettingsMore',
      label: 'More',
      content: (
        <TabPanel>
          {dateTimeButton}
          {audioMuteToggle}
          <SignedHashValidationButton apiClient={apiClient} />
          {diagnosticsButton}
          {powerDownButton}
        </TabPanel>
      ),
    }
  );

  if (isDiagnosticsScreenOpen) {
    return (
      <DiagnosticsScreen onClose={() => setIsDiagnosticsScreenOpen(false)} />
    );
  }

  return (
    <Screen
      infoBarMode="admin"
      ballotCountOverride={scannerStatus.ballotsCounted}
      title="Election Manager Menu"
      voterFacing={false}
      showModeBanner={false}
    >
      <TabbedSection aria-label="Election Manager Menu" tabs={tabs} />

      {isConfirmingBallotModeSwitch &&
        (() => (
          <Modal
            title={`Switch to ${isTestMode ? 'Official' : 'Test'} Ballot Mode`}
            content={
              <P>
                Switching to {isTestMode ? 'official' : 'test'} ballot mode will
                clear all scanned ballot data and reset the polls.
              </P>
            }
            actions={
              <React.Fragment>
                <Button
                  onPress={switchMode}
                  variant={isTestMode ? 'primary' : 'danger'}
                  icon={isTestMode ? undefined : 'Danger'}
                  disabled={setTestModeMutation.isLoading}
                >
                  Switch to {isTestMode ? 'Official' : 'Test'} Ballot Mode
                </Button>
                <Button
                  onPress={() => setIsConfirmingBallotModeSwitch(false)}
                  disabled={setTestModeMutation.isLoading}
                >
                  Cancel
                </Button>
              </React.Fragment>
            }
          />
        ))()}

      {isExportingResults && (
        <ExportResultsModal
          onClose={() => setIsExportingResults(false)}
          usbDrive={usbDrive}
        />
      )}
    </Screen>
  );
}

/* istanbul ignore next - @preserve */
export function DefaultPreview(): JSX.Element {
  const configQuery = getConfig.useQuery();
  const electionDefinition = configQuery.data?.electionDefinition;

  if (!electionDefinition) {
    return <div>Loading…</div>;
  }

  return (
    <ElectionManagerScreen
      electionDefinition={electionDefinition}
      scannerStatus={{
        state: 'no_paper',
        ballotsCounted: 1234,
      }}
      usbDrive={{ status: 'no_drive' }}
    />
  );
}
