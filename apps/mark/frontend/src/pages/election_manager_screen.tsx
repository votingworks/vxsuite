import React, { useState } from 'react';

import {
  P,
  ChangePrecinctButton,
  ElectionInfoBar,
  Main,
  Screen,
  SegmentedButton,
  SetClockButton,
  H6,
  UnconfigureMachineButton,
  ExportLogsButton,
  SegmentedButtonOption,
  H2,
  H3,
  Font,
} from '@votingworks/ui';
import {
  ElectionDefinition,
  PollsState,
  PrecinctSelection,
} from '@votingworks/types';
import type { MachineConfig } from '@votingworks/mark-backend';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import {
  BooleanEnvironmentVariableName,
  format,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { PrintMode } from '@votingworks/mark-backend';
import styled from 'styled-components';
import {
  ejectUsbDrive,
  logOut,
  setPrecinctSelection,
  setTestMode,
} from '../api';
import * as api from '../api';
import { BubbleMarkCalibration } from '../components/bubble_mark_calibration';
import { ConfirmSwitchModeModal } from '../components/confirm_switch_mode_modal';

export interface ElectionManagerScreenProps {
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

const Section = styled.div`
  &:not(:last-child) {
    margin-bottom: 0.35rem;
  }
`;

// [TODO] Finalize copy before turning on this feature.
const PRINT_MODE_OPTIONS: Array<SegmentedButtonOption<PrintMode>> = [
  { id: 'summary', label: 'Summary' },
  { id: 'bubble_marks', label: 'Bubble Marks' },
];

export function ElectionManagerScreen({
  appPrecinct,
  ballotsPrintedCount,
  electionDefinition,
  electionPackageHash,
  isTestMode,
  unconfigure,
  machineConfig,
  pollsState,
  usbDriveStatus,
}: ElectionManagerScreenProps): JSX.Element {
  const { election } = electionDefinition;
  const logOutMutation = logOut.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();
  const setPrecinctSelectionMutation = setPrecinctSelection.useMutation();
  const setTestModeMutation = setTestMode.useMutation();
  const [isConfirmingModeSwitch, setIsConfirmingModeSwitch] = useState(false);

  const printMode = api.getPrintMode.useQuery().data;
  const setPrintMode = api.setPrintMode.useMutation().mutate;

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
            <ChangePrecinctButton
              appPrecinctSelection={appPrecinct}
              updatePrecinctSelection={updatePrecinctSelection}
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
        <H3 as="h2">Print Settings</H3>
        {isFeatureFlagEnabled(
          BooleanEnvironmentVariableName.MARK_ENABLE_BALLOT_PRINT_MODE_TOGGLE
        ) && (
          <React.Fragment>
            <Section>
              <SegmentedButton
                label="Ballot Mode"
                hideLabel
                disabled={!printMode}
                onChange={setPrintMode}
                options={PRINT_MODE_OPTIONS}
                // istanbul ignore next
                selectedOptionId={printMode || 'summary'}
              />
            </Section>
            {/* istanbul ignore next - temporary @preserve */}
            {printMode === 'bubble_marks' && (
              <React.Fragment>
                <H6 as="h2">Bubble Mark Offset Calibration</H6>
                <Section style={{ marginTop: '0.5rem' }}>
                  <BubbleMarkCalibration field="offsetMmX" label="X" />
                  <BubbleMarkCalibration field="offsetMmY" label="Y" />
                </Section>
              </React.Fragment>
            )}
          </React.Fragment>
        )}
        <H3 as="h2">System</H3>
        <ButtonGrid>
          <ExportLogsButton usbDriveStatus={usbDriveStatus} />
          <SetClockButton logOut={() => logOutMutation.mutate()}>
            Set Date and Time
          </SetClockButton>
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
      {isConfirmingModeSwitch && (
        <ConfirmSwitchModeModal
          isTestMode={isTestMode}
          onClose={() => setIsConfirmingModeSwitch(false)}
        />
      )}
    </Screen>
  );
}
