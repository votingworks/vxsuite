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
  UsbDrive,
  Caption,
  Font,
  Icons,
  H4,
  H1,
} from '@votingworks/ui';
import {
  ElectionDefinition,
  PollsState,
  PrecinctSelection,
} from '@votingworks/types';
import { makeAsync } from '@votingworks/utils';
import { Logger } from '@votingworks/logging';
import type { MachineConfig } from '@votingworks/mark-backend';
import { ScreenReader } from '../config/types';

export interface AdminScreenProps {
  appPrecinct?: PrecinctSelection;
  ballotsPrintedCount: number;
  electionDefinition: ElectionDefinition;
  isLiveMode: boolean;
  updateAppPrecinct: (appPrecinct: PrecinctSelection) => void;
  toggleLiveMode: VoidFunction;
  unconfigure: () => Promise<void>;
  machineConfig: MachineConfig;
  screenReader: ScreenReader;
  pollsState: PollsState;
  logger: Logger;
  usbDrive: UsbDrive;
}

export function AdminScreen({
  appPrecinct,
  ballotsPrintedCount,
  electionDefinition,
  isLiveMode,
  updateAppPrecinct,
  toggleLiveMode,
  unconfigure,
  machineConfig,
  screenReader,
  pollsState,
  logger,
  usbDrive,
}: AdminScreenProps): JSX.Element {
  const { election } = electionDefinition;

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
          <H1 as="h1">
            VxMark{' '}
            <Font weight="light" noWrap>
              Election Manager Actions
            </Font>
          </H1>
          <P weight="bold">
            <Icons.Info /> Remove card when finished.
          </P>
          {election && (
            <React.Fragment>
              <H4 as="h2">Stats</H4>
              <P>
                Ballots Printed: <strong>{ballotsPrintedCount}</strong>
              </P>
              <H4 as="h2">
                <label htmlFor="selectPrecinct">Precinct</label>
              </H4>
              <P>
                <ChangePrecinctButton
                  appPrecinctSelection={appPrecinct}
                  updatePrecinctSelection={makeAsync(updateAppPrecinct)}
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
              <H4 as="h2">Test Ballot Mode</H4>
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
          <H4 as="h2">Current Date and Time</H4>
          <P>
            <Caption>
              <CurrentDateAndTime />
            </Caption>
          </P>
          <P>
            <SetClockButton>Update Date and Time</SetClockButton>
          </P>
          <H4 as="h2">Configuration</H4>
          <P>
            <Font color="success">
              <Icons.Checkbox />
            </Font>{' '}
            Election Definition is loaded.{' '}
            <Button variant="danger" small onPress={unconfigure}>
              Unconfigure Machine
            </Button>
          </P>
          <H4 as="h2">USB</H4>
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
          precinctSelection={appPrecinct}
        />
      )}
    </Screen>
  );
}
