import React from 'react';
import styled from 'styled-components';

import {
  P,
  ChangePrecinctButton,
  CurrentDateAndTime,
  ElectionInfoBar,
  Main,
  Screen,
  SegmentedButton,
  SetClockButton,
  UsbControllerButton,
  Caption,
  Icons,
  H3,
  H6,
  UnconfigureMachineButton,
  ExportLogsButton,
} from '@votingworks/ui';
import {
  ElectionDefinition,
  PollsState,
  PrecinctSelection,
} from '@votingworks/types';
import type { MachineConfig } from '@votingworks/mark-backend';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { pollWorkerComponents } from '@votingworks/mark-flow-ui';
import {
  ejectUsbDrive,
  logOut,
  setPrecinctSelection,
  setTestMode,
  useApiClient,
} from '../api';
import * as api from '../api';
import { BubbleMarkCalibration } from '../components/bubble_mark_calibration';

const Section = styled.div`
  &:not(:last-child) {
    margin-bottom: 0.35rem;
  }
`;

const { H6SectionSystem } = pollWorkerComponents;

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
}: AdminScreenProps): JSX.Element {
  const { election } = electionDefinition;

  const apiClient = useApiClient();
  const logOutMutation = logOut.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();
  const setPrecinctSelectionMutation = setPrecinctSelection.useMutation();
  const setTestModeMutation = setTestMode.useMutation();
  const systemSettingsQuery = api.getSystemSettings.useQuery();

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
        <H3 as="h1">Election Manager Settings</H3>
        <Caption weight="bold">
          <Icons.Info /> Remove card when finished.
        </Caption>
        {election && (
          <React.Fragment>
            <H6 as="h2">Stats</H6>
            <P>
              Ballots Printed: <strong>{ballotsPrintedCount}</strong>
            </P>
            <H6 as="h2">
              <label htmlFor="selectPrecinct">Precinct</label>
            </H6>
            <Section>
              <ChangePrecinctButton
                appPrecinctSelection={appPrecinct}
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
                  pollsState === 'polls_closed_final' ||
                  election.precincts.length === 1
                    ? 'disabled'
                    : 'default'
                }
              />
              <br />
              <Caption>
                Changing the precinct will reset the Ballots Printed count.
              </Caption>
              {election.precincts.length === 1 && (
                <React.Fragment>
                  <br />
                  <Caption>
                    Precinct cannot be changed because there is only one
                    precinct configured for this election.
                  </Caption>
                </React.Fragment>
              )}
            </Section>
            <H6 as="h2">Ballot Mode</H6>
            <Section>
              <SegmentedButton
                label="Ballot Mode"
                hideLabel
                onChange={() =>
                  setTestModeMutation.mutate({ isTestMode: !isTestMode })
                }
                options={[
                  { id: 'test', label: 'Test Ballot Mode' },
                  { id: 'official', label: 'Official Ballot Mode' },
                ]}
                selectedOptionId={isTestMode ? 'test' : 'official'}
              />
              <br />
              <Caption>
                Switching the mode will reset the Ballots Printed count.
              </Caption>
            </Section>
            {systemSettingsQuery.data &&
              systemSettingsQuery.data.bmdPrintMode ===
                'marks_on_preprinted_ballot' && (
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
        <H6 as="h2">Date and Time</H6>
        <P>
          <Caption>
            <CurrentDateAndTime />
          </Caption>
        </P>
        <P>
          <SetClockButton logOut={() => logOutMutation.mutate()}>
            Set Date and Time
          </SetClockButton>
        </P>
        <H6 as="h2">Configuration</H6>
        <P>
          <Icons.Checkbox color="success" /> Election Definition is loaded.
        </P>
        <UnconfigureMachineButton
          isMachineConfigured
          unconfigureMachine={unconfigureMachineAndEjectUsb}
        />
        <H6 as="h2">Logs</H6>
        <ExportLogsButton usbDriveStatus={usbDriveStatus} />
        <H6 as="h2">USB</H6>
        <UsbControllerButton
          primary
          usbDriveStatus={usbDriveStatus}
          usbDriveEject={() => ejectUsbDriveMutation.mutate()}
          usbDriveIsEjecting={ejectUsbDriveMutation.isLoading}
        />
        <H6SectionSystem apiClient={apiClient} />
      </Main>
      <ElectionInfoBar
        mode="admin"
        electionDefinition={electionDefinition}
        electionPackageHash={electionPackageHash}
        codeVersion={machineConfig.codeVersion}
        machineId={machineConfig.machineId}
        precinctSelection={appPrecinct}
      />
    </Screen>
  );
}
