import React, { useEffect } from 'react';

import {
  P,
  Button,
  ChangePrecinctButton,
  CurrentDateAndTime,
  ElectionInfoBar,
  Main,
  Prose,
  Screen,
  SegmentedButton,
  SetClockButton,
  TestMode,
  UsbControllerButton,
  Caption,
  Font,
  Icons,
  H3,
  H6,
} from '@votingworks/ui';
import {
  ElectionDefinition,
  PollsState,
  PrecinctSelection,
} from '@votingworks/types';
import { makeAsync } from '@votingworks/utils';
import { Logger } from '@votingworks/logging';
import type { MachineConfig } from '@votingworks/mark-scan-backend';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { ScreenReader } from '../config/types';
import {
  ejectUsbDrive,
  getPrecinctSelection,
  logOut,
  setPrecinctSelection,
} from '../api';

export interface AdminScreenProps {
  ballotsPrintedCount: number;
  electionDefinition: ElectionDefinition;
  isLiveMode: boolean;
  toggleLiveMode: VoidFunction;
  unconfigure: () => Promise<void>;
  machineConfig: MachineConfig;
  screenReader: ScreenReader;
  pollsState: PollsState;
  logger: Logger;
  usbDriveStatus: UsbDriveStatus;
}

export function AdminScreen({
  ballotsPrintedCount,
  electionDefinition,
  isLiveMode,
  toggleLiveMode,
  unconfigure,
  machineConfig,
  screenReader,
  pollsState,
  logger,
  usbDriveStatus,
}: AdminScreenProps): JSX.Element | null {
  const { election } = electionDefinition;
  const logOutMutation = logOut.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();
  const getPrecinctSelectionQuery = getPrecinctSelection.useQuery();
  const setPrecinctSelectionMutation = setPrecinctSelection.useMutation();
  function updatePrecinctSelection(newPrecinctSelection: PrecinctSelection) {
    setPrecinctSelectionMutation.mutate({
      precinctSelection: newPrecinctSelection,
    });
  }

  // Disable the audiotrack when in admin mode
  useEffect(() => {
    const initialMuted = screenReader.isMuted();
    screenReader.mute();
    return () => screenReader.toggleMuted(initialMuted);
  }, [screenReader]);

  if (!getPrecinctSelectionQuery.isSuccess) {
    return null;
  }

  const precinctSelection = getPrecinctSelectionQuery.data;

  return (
    <Screen>
      {election && !isLiveMode && <TestMode />}
      <Main padded>
        <Prose>
          <H3 as="h1">
            VxMarkScan{' '}
            <Font weight="light" noWrap>
              Election Manager Actions
            </Font>
          </H3>
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
              <P>
                <ChangePrecinctButton
                  appPrecinctSelection={precinctSelection}
                  updatePrecinctSelection={makeAsync(updatePrecinctSelection)}
                  election={election}
                  mode={
                    pollsState === 'polls_closed_final' ||
                    election.precincts.length === 1
                      ? 'disabled'
                      : 'default'
                  }
                  logger={logger}
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
              </P>
              <H6 as="h2">Test Ballot Mode</H6>
              <P>
                <SegmentedButton
                  label="Test Ballot Mode"
                  hideLabel
                  onChange={toggleLiveMode}
                  options={[
                    { id: 'test', label: 'Test Ballot Mode' },
                    { id: 'official', label: 'Official Ballot Mode' },
                  ]}
                  selectedOptionId={isLiveMode ? 'official' : 'test'}
                />
                <br />
                <Caption>
                  Switching the mode will reset the Ballots Printed count.
                </Caption>
              </P>
            </React.Fragment>
          )}
          <H6 as="h2">Current Date and Time</H6>
          <P>
            <Caption>
              <CurrentDateAndTime />
            </Caption>
          </P>
          <P>
            <SetClockButton logOut={() => logOutMutation.mutate()}>
              Update Date and Time
            </SetClockButton>
          </P>
          <H6 as="h2">Configuration</H6>
          <P>
            <Icons.Checkbox color="success" /> Election Definition is loaded.
          </P>
          <Button variant="danger" icon="Delete" onPress={unconfigure}>
            Unconfigure Machine
          </Button>
          <H6 as="h2">USB</H6>
          <UsbControllerButton
            primary
            usbDriveStatus={usbDriveStatus}
            usbDriveEject={() => ejectUsbDriveMutation.mutate()}
            usbDriveIsEjecting={ejectUsbDriveMutation.isLoading}
          />
        </Prose>
      </Main>
      {election && (
        <ElectionInfoBar
          mode="admin"
          electionDefinition={electionDefinition}
          codeVersion={machineConfig.codeVersion}
          machineId={machineConfig.machineId}
          precinctSelection={precinctSelection}
        />
      )}
    </Screen>
  );
}
