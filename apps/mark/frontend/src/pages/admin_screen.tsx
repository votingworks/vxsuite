import React, { useEffect } from 'react';

import {
  ElectionDefinition,
  PollsState,
  PrecinctSelection,
} from '@votingworks/types';
import { makeAsync } from '@votingworks/utils';
import {
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
  Text,
} from '@votingworks/ui';
import { Logger } from '@votingworks/logging';
// eslint-disable-next-line vx/gts-no-import-export-type
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
          <h1>
            VxMark{' '}
            <Text as="span" light noWrap>
              Election Manager Actions
            </Text>
          </h1>
          <Text italic>Remove card when finished.</Text>
          {election && (
            <React.Fragment>
              <h2>Stats</h2>
              <p>
                Ballots Printed: <strong>{ballotsPrintedCount}</strong>
              </p>
              <h2>
                <label htmlFor="selectPrecinct">Precinct</label>
              </h2>
              <p>
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
                <Text small italic as="span">
                  Changing the precinct will reset the Ballots Printed count.
                </Text>
                {election.precincts.length === 1 && (
                  <React.Fragment>
                    <br />
                    <Text small italic as="span">
                      Precinct cannot be changed because there is only one
                      precinct configured for this election.
                    </Text>
                  </React.Fragment>
                )}
              </p>
              <h2>Test Ballot Mode</h2>
              <p>
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
                <Text small italic as="span">
                  Switching the mode will reset the Ballots Printed count.
                </Text>
              </p>
            </React.Fragment>
          )}
          <h2>Current Date and Time</h2>
          <p>
            <CurrentDateAndTime />
          </p>
          <p>
            <SetClockButton>Update Date and Time</SetClockButton>
          </p>
          <h2>Configuration</h2>
          <p>
            <Text as="span" voteIcon>
              Election Definition is loaded.
            </Text>{' '}
            <Button variant="danger" small onPress={unconfigure}>
              Unconfigure Machine
            </Button>
          </p>
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
