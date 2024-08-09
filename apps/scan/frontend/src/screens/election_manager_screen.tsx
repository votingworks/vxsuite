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
} from '@votingworks/ui';
import React, { useState } from 'react';
import type { PrecinctScannerStatus } from '@votingworks/scan-backend';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
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
  setIsSoundMuted,
  setIsDoubleFeedDetectionDisabled,
  setPrecinctSelection,
  setTestMode,
  unconfigureElection,
  beginDoubleFeedCalibration,
} from '../api';
import { usePreviewContext } from '../preview_dashboard';
import { SignedHashValidationButton } from '../components/signed_hash_validation_button';
import { ElectionManagerPrinterTabContent } from '../components/printer_management/election_manager_printer_tab_content';

export const SELECT_PRECINCT_TEXT = 'Select a precinct for this device…';

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

  const [isConfirmingSwitchToTestMode, setIsConfirmingSwitchToTestMode] =
    useState(false);

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
  } = configQuery.data;
  const { pollsState } = pollsInfoQuery.data;
  const printerStatus = printerStatusQuery.data;

  const isCvrSyncRequired =
    Boolean(usbDriveStatusQuery.data.doesUsbDriveRequireCastVoteRecordSync) &&
    !isTestMode;

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

  async function unconfigureMachine() {
    try {
      // If there is a mounted usb, eject it so that it doesn't auto reconfigure the machine.
      // TODO move this to the backend?
      await ejectUsbDriveMutation.mutateAsync();
      await unconfigureMutation.mutateAsync();
    } catch (error) {
      // Handled by default query client error handling
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
      />
    </P>
  );

  const ballotMode = (
    <P>
      <SegmentedButton
        disabled={setTestModeMutation.isLoading || isCvrSyncRequired}
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
      <SetClockButton logOut={() => logOutMutation.mutate()}>
        Set Date and Time
      </SetClockButton>
    </P>
  );

  const dataExportButtons = (
    <React.Fragment>
      <P>
        <Button onPress={() => setIsExportingResults(true)}>Save CVRs</Button>{' '}
      </P>
      <P>
        <ExportLogsButton usbDriveStatus={usbDrive} />
      </P>
    </React.Fragment>
  );

  const doubleSheetDetectionToggle = (
    <P>
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
    </P>
  );

  const calibrateDoubleSheetDetectionButton = (
    <P>
      <Button onPress={() => beginDoubleFeedCalibrationMutation.mutate()}>
        Calibrate Double Sheet Detection
      </Button>
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
      <UnconfigureMachineButton
        // TODO rename isMachineConfigured -> disabled to be clearer
        isMachineConfigured={!isCvrSyncRequired}
        unconfigureMachine={unconfigureMachine}
      />
    </P>
  );

  const cvrSyncRequiredWarning = isCvrSyncRequired ? (
    <P>
      <Icons.Warning color="warning" /> Cast vote records (CVRs) need to be
      synced to the inserted USB drive before you can modify the machine
      configuration. Remove your election manager card to sync.
    </P>
  ) : null;

  const tabs: TabConfig[] = [
    {
      paneId: 'managerSettingsConfiguration',
      label: 'Configuration',
      content: (
        <React.Fragment>
          {cvrSyncRequiredWarning}
          {changePrecinctButton}
          {ballotMode}
          {unconfigureElectionButton}
        </React.Fragment>
      ),
    },
  ];

  if (printerStatus.scheme === 'hardware-v4') {
    const showWarningIcon = printerStatus.state !== 'idle';

    tabs.push({
      paneId: 'managerSettingsPrinter',
      label: 'Printer',
      icon: showWarningIcon ? 'Warning' : undefined,
      content: <ElectionManagerPrinterTabContent />,
    });
  }

  tabs.push(
    {
      paneId: 'managerSettingsData',
      label: 'CVRs and Logs',
      content: <React.Fragment>{dataExportButtons}</React.Fragment>,
    },
    {
      paneId: 'managerSettingsSystem',
      label: 'System Settings',
      content: (
        <React.Fragment>
          {doubleSheetDetectionToggle}
          {calibrateDoubleSheetDetectionButton}
          {dateTimeButton}
          {audioMuteToggle}
          <SignedHashValidationButton />
        </React.Fragment>
      ),
    }
  );

  return (
    <Screen
      infoBarMode="admin"
      ballotCountOverride={scannerStatus.ballotsCounted}
      title="Election Manager Settings"
      voterFacing={false}
    >
      <TabbedSection ariaLabel="Election Manager Settings" tabs={tabs} />

      {isConfirmingSwitchToTestMode &&
        (() => {
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
    />
  );
}
