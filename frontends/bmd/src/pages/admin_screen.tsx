import React, { useEffect, useState } from 'react';

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
import { MachineConfig, ScreenReader } from '../config/types';

export interface AdminScreenProps {
  appPrecinct?: PrecinctSelection;
  ballotsPrintedCount: number;
  electionDefinition?: ElectionDefinition;
  isLiveMode: boolean;
  fetchElection: VoidFunction;
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
  fetchElection,
  updateAppPrecinct,
  toggleLiveMode,
  unconfigure,
  machineConfig,
  screenReader,
  pollsState,
  logger,
}: AdminScreenProps): JSX.Element {
  const election = electionDefinition?.election;

  const canPrintBallots = machineConfig.appMode.isPrint;

  const [isFetchingElection, setIsFetchingElection] = useState(false);
  function loadElection() {
    setIsFetchingElection(true);
    fetchElection();
  }

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
              {canPrintBallots && (
                <React.Fragment>
                  <h2>Stats</h2>
                  <p>
                    Ballots Printed: <strong>{ballotsPrintedCount}</strong>
                  </p>
                </React.Fragment>
              )}
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
                {canPrintBallots && (
                  <React.Fragment>
                    <br />
                    <Text small italic as="span">
                      Changing the precinct will reset the Ballots Printed
                      count.
                    </Text>
                  </React.Fragment>
                )}
                {election.precincts.length === 1 && (
                  <React.Fragment>
                    <br />
                    <Text small italic as="span">
                      Precinct can not be changed because there is only one
                      precinct configured for this election.
                    </Text>
                  </React.Fragment>
                )}
              </p>
              <h2>Testing Mode</h2>
              <p>
                <SegmentedButton>
                  <Button
                    onPress={toggleLiveMode}
                    primary={!isLiveMode}
                    disabled={!isLiveMode}
                  >
                    Testing Mode
                  </Button>
                  <Button
                    onPress={toggleLiveMode}
                    primary={isLiveMode}
                    disabled={isLiveMode}
                  >
                    Live Election Mode
                  </Button>
                </SegmentedButton>
                {canPrintBallots && (
                  <React.Fragment>
                    <br />
                    <Text small italic as="span">
                      Switching the mode will reset the Ballots Printed count.
                    </Text>
                  </React.Fragment>
                )}
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
          {election ? (
            <p>
              <Text as="span" voteIcon>
                Election Definition is loaded.
              </Text>{' '}
              <Button danger small onPress={unconfigure}>
                Unconfigure Machine
              </Button>
            </p>
          ) : isFetchingElection ? (
            <p>Loading Election Definition from Election Manager card…</p>
          ) : (
            <React.Fragment>
              <Text warningIcon>Election Definition is not loaded.</Text>
              <p>
                <Button onPress={loadElection}>Load Election Definition</Button>
              </p>
            </React.Fragment>
          )}
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
