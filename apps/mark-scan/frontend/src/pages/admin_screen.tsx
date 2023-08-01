import React, { useCallback, useEffect } from 'react';

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
  UsbDrive,
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
import { ScreenReader } from '../config/types';
import { getPrecinctSelection, logOut, setPrecinctSelection } from '../api';

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
  usbDrive: UsbDrive;
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
  usbDrive,
}: AdminScreenProps): JSX.Element {
  const { election } = electionDefinition;
  const logOutMutation = logOut.useMutation();
  const getPrecinctSelectionQuery = getPrecinctSelection.useQuery();
  const precinctSelection = getPrecinctSelectionQuery.data?.ok();

  const setPrecinctSelectionMutation = setPrecinctSelection.useMutation();
  const updatePrecinctSelection = useCallback(
    (newPrecinctSelection: PrecinctSelection) => {
      setPrecinctSelectionMutation.mutate({
        precinctSelection: newPrecinctSelection,
      });
    },
    [setPrecinctSelectionMutation]
  );

  // Disable the audiotrack when in admin mode
  useEffect(() => {
    const initialMuted = screenReader.isMuted();
    screenReader.mute();
    return () => screenReader.toggleMuted(initialMuted);
  }, [screenReader]);

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
            <Font color="success">
              <Icons.Checkbox />
            </Font>{' '}
            Election Definition is loaded.{' '}
          </P>
          <Button variant="danger" small onPress={unconfigure}>
            Unconfigure Machine
          </Button>
          <H6 as="h2">USB</H6>
          <UsbControllerButton
            small={false}
            primary
            usbDriveStatus={usbDrive.status}
            usbDriveEject={() => usbDrive.eject('election_manager')}
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
