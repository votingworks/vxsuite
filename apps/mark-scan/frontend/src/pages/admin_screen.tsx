import React, { useState } from 'react';

import {
  P,
  ChangePrecinctButton,
  ElectionInfoBar,
  Main,
  Screen,
  SegmentedButton,
  SetClockButton,
  TestMode,
  Font,
  H3,
  UnconfigureMachineButton,
  ExportLogsButton,
  SignedHashValidationButton,
  Button,
  H2,
} from '@votingworks/ui';
import {
  ElectionDefinition,
  PollsState,
  PrecinctSelection,
} from '@votingworks/types';
import type { MachineConfig } from '@votingworks/mark-scan-backend';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { format } from '@votingworks/utils';
import styled from 'styled-components';
import {
  ejectUsbDrive,
  logOut,
  setPrecinctSelection,
  setTestMode,
  useApiClient,
} from '../api';
import { DiagnosticsScreen } from './diagnostics/diagnostics_screen';
import { ConfirmChangePrecinctModal } from '../components/confirm_change_precinct_modal';
import { ConfirmSwitchModeModal } from '../components/confirm_switch_mode_modal';

const ButtonGrid = styled.div`
  display: grid;
  grid-auto-rows: 1fr;
  grid-gap: max(${(p) => p.theme.sizes.minTouchAreaSeparationPx}px, 0.25rem);
  grid-template-columns: 1fr 1fr;

  button {
    flex-wrap: nowrap;
    white-space: nowrap;
  }

  margin-bottom: 0.5rem;
`;

export interface AdminScreenProps {
  appPrecinct?: PrecinctSelection;
  ballotsPrintedCount: number;
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
  isTestMode: boolean;
  unconfigure: () => Promise<void>;
  machineConfig: MachineConfig;
  pollsState: PollsState;
  usbDriveStatus: UsbDriveStatus;
}

export function AdminScreen({
  appPrecinct,
  ballotsPrintedCount,
  electionDefinition,
  electionPackageHash,
  isTestMode,
  unconfigure,
  machineConfig,
  pollsState,
  usbDriveStatus,
}: AdminScreenProps): JSX.Element | null {
  const { election } = electionDefinition;
  const apiClient = useApiClient();
  const logOutMutation = logOut.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();
  const setPrecinctSelectionMutation = setPrecinctSelection.useMutation();
  const setTestModeMutation = setTestMode.useMutation();
  const [isDiagnosticsScreenOpen, setIsDiagnosticsScreenOpen] =
    React.useState(false);
  const [isConfirmingModeSwitch, setIsConfirmingModeSwitch] = useState(false);
  const [isConfirmingPrecinctChange, setIsConfirmingPrecinctChange] =
    useState<PrecinctSelection>();

  async function unconfigureMachineAndEjectUsb() {
    try {
      // If there is a mounted usb, eject it so that it doesn't auto reconfigure the machine.
      await ejectUsbDriveMutation.mutateAsync();
      await unconfigure();
    } catch {
      // Handled by default query client error handling
    }
  }

  async function updatePrecinctSelection(
    newPrecinctSelection: PrecinctSelection
  ) {
    try {
      await setPrecinctSelectionMutation.mutateAsync({
        precinctSelection: newPrecinctSelection,
      });
    } catch {
      // Handled by default query client error handling
    }
  }

  if (isDiagnosticsScreenOpen) {
    return (
      <DiagnosticsScreen
        onBackButtonPress={() => setIsDiagnosticsScreenOpen(false)}
      />
    );
  }

  return (
    <Screen>
      {isTestMode && <TestMode />}
      <Main padded>
        <H2 as="h1">Election Manager Menu</H2>
        <P>Remove the election manager card to leave this screen.</P>
        <P style={{ fontSize: '1.2em' }}>
          <Font weight="bold"> Ballots Printed: </Font>{' '}
          {format.count(ballotsPrintedCount)}
        </P>
        <H3 as="h2">Configuration</H3>
        {election.precincts.length > 1 && (
          <P>
            <ChangePrecinctButton
              appPrecinctSelection={appPrecinct}
              updatePrecinctSelection={async (newPrecinctSelection) => {
                if (ballotsPrintedCount > 0) {
                  setIsConfirmingPrecinctChange(newPrecinctSelection);
                } else {
                  await updatePrecinctSelection(newPrecinctSelection);
                }
              }}
              election={election}
              mode={
                pollsState === 'polls_closed_final' ? 'disabled' : 'default'
              }
            />
          </P>
        )}
        <P>
          <SegmentedButton
            label="Ballot Mode"
            hideLabel
            onChange={() => {
              if (ballotsPrintedCount > 0) {
                setIsConfirmingModeSwitch(true);
              } else {
                setTestModeMutation.mutate({ isTestMode: !isTestMode });
              }
            }}
            options={[
              { id: 'test', label: 'Test Ballot Mode' },
              { id: 'official', label: 'Official Ballot Mode' },
            ]}
            selectedOptionId={isTestMode ? 'test' : 'official'}
          />
        </P>
        <P>
          <UnconfigureMachineButton
            isMachineConfigured
            unconfigureMachine={unconfigureMachineAndEjectUsb}
          />
        </P>
        <H3 as="h2">System</H3>
        <ButtonGrid>
          <ExportLogsButton usbDriveStatus={usbDriveStatus} />
          <SetClockButton logOut={() => logOutMutation.mutate()}>
            Set Date and Time
          </SetClockButton>
          <Button onPress={() => setIsDiagnosticsScreenOpen(true)}>
            Diagnostics
          </Button>
          <SignedHashValidationButton apiClient={apiClient} />
        </ButtonGrid>
      </Main>
      <ElectionInfoBar
        mode="admin"
        electionDefinition={electionDefinition}
        electionPackageHash={electionPackageHash}
        codeVersion={machineConfig.codeVersion}
        machineId={machineConfig.machineId}
        precinctSelection={appPrecinct}
      />
      {isConfirmingPrecinctChange && (
        <ConfirmChangePrecinctModal
          election={election}
          precinctSelection={isConfirmingPrecinctChange}
          onClose={() => setIsConfirmingPrecinctChange(undefined)}
        />
      )}
      {isConfirmingModeSwitch && (
        <ConfirmSwitchModeModal
          isTestMode={isTestMode}
          onClose={() => setIsConfirmingModeSwitch(false)}
        />
      )}
    </Screen>
  );
}
