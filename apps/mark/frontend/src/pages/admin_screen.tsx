import React, { useState } from 'react';
import styled from 'styled-components';

import {
  P,
  ElectionInfoBar,
  Main,
  Screen,
  SegmentedButton,
  SetClockButton,
  H3,
  UnconfigureMachineButton,
  ExportLogsButton,
  H2,
  Font,
  SignedHashValidationButton,
  PowerDownButton,
  Button,
  ToggleUsbPortsButton,
} from '@votingworks/ui';
import {
  ElectionDefinition,
  PollsState,
  PrecinctSelection,
} from '@votingworks/types';
import type { MachineConfig } from '@votingworks/mark-backend';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { format } from '@votingworks/utils';
import { LocationPicker } from '@votingworks/mark-flow-ui';
import {
  ejectUsbDrive,
  logOut,
  setPrecinctSelection,
  setTestMode,
  useApiClient,
} from '../api';
import * as api from '../api';
import { BubbleMarkCalibration } from '../components/bubble_mark_calibration';
import { ConfirmSwitchModeModal } from '../components/confirm_switch_mode_modal';
import { DiagnosticsScreen } from './diagnostics_screen';

const Section = styled.div`
  &:not(:last-child) {
    margin-bottom: 0.35rem;
  }
`;

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
  pollingPlaceId?: string;
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
  pollingPlaceId,
  pollsState,
  usbDriveStatus,
}: AdminScreenProps): JSX.Element {
  const { election } = electionDefinition;

  const apiClient = useApiClient();
  const logOutMutation = logOut.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();
  const selectPrecinct = setPrecinctSelection.useMutation().mutateAsync;
  const selectPollingPlace = api.setPollingPlaceId.useMutation().mutateAsync;
  const setTestModeMutation = setTestMode.useMutation();
  const systemSettingsQuery = api.getSystemSettings.useQuery();
  const [isConfirmingModeSwitch, setIsConfirmingModeSwitch] = useState(false);
  const [isDiagnosticsScreenOpen, setIsDiagnosticsScreenOpen] = useState(false);

  if (isDiagnosticsScreenOpen) {
    return (
      <DiagnosticsScreen
        onBackButtonPress={() => setIsDiagnosticsScreenOpen(false)}
      />
    );
  }

  async function unconfigureMachineAndEjectUsb() {
    try {
      // If there is a mounted usb, eject it so that it doesn't auto reconfigure the machine.
      await ejectUsbDriveMutation.mutateAsync();
      await unconfigure();
    } catch {
      // Handled by default query client error handling
    }
  }

  return (
    <Screen>
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
            <LocationPicker
              appPrecinct={appPrecinct}
              election={election}
              pollsState={pollsState}
              pollingPlaceId={pollingPlaceId}
              selectPollingPlace={(id) => selectPollingPlace({ id })}
              selectPrecinct={(p) => selectPrecinct({ precinctSelection: p })}
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
        {systemSettingsQuery.data &&
          systemSettingsQuery.data.bmdPrintMode ===
            'marks_on_preprinted_ballot' && (
            <React.Fragment>
              <H3 as="h2">Bubble Mark Offset Calibration</H3>
              <Section style={{ marginTop: '0.5rem' }}>
                <BubbleMarkCalibration field="offsetMmX" label="X" />
                <BubbleMarkCalibration field="offsetMmY" label="Y" />
              </Section>
            </React.Fragment>
          )}
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
          <ToggleUsbPortsButton onlyShowWhenDisabled />
          <PowerDownButton icon="PowerOff" />
        </ButtonGrid>
      </Main>
      <ElectionInfoBar
        mode="admin"
        electionDefinition={electionDefinition}
        electionPackageHash={electionPackageHash}
        codeVersion={machineConfig.codeVersion}
        machineId={machineConfig.machineId}
        pollingPlaceId={pollingPlaceId}
        precinctSelection={appPrecinct}
      />
      {isConfirmingModeSwitch && (
        <ConfirmSwitchModeModal
          isTestMode={isTestMode}
          onClose={() => setIsConfirmingModeSwitch(false)}
        />
      )}
    </Screen>
  );
}
