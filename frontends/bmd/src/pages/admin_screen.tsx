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
  Main,
  Prose,
  Screen,
  SegmentedButton,
  SetClockButton,
  Text,
} from '@votingworks/ui';
import { Logger } from '@votingworks/logging';
import { MachineConfig, ScreenReader } from '../config/types';

import { Sidebar } from '../components/sidebar';
import { ElectionInfo } from '../components/election_info';
import { VersionsData } from '../components/versions_data';

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
    <Screen navLeft>
      <Main padded>
        <Prose>
          {election && (
            <React.Fragment>
              <h1>
                <label htmlFor="selectPrecinct">Precinct</label>
              </h1>
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
              {election.precincts.length === 1 && (
                <p>
                  <em>
                    There is only one precinct in this election, so the precinct
                    cannot be changed.
                  </em>
                </p>
              )}
              <h1>Testing Mode</h1>
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
              </p>
              {machineConfig.appMode.isPrint && (
                <React.Fragment>
                  <Text as="h1">Stats</Text>
                  <Text>
                    Printed Ballots: <strong>{ballotsPrintedCount}</strong>{' '}
                  </Text>
                </React.Fragment>
              )}
            </React.Fragment>
          )}
          <h1>Current Date and Time</h1>
          <p>
            <CurrentDateAndTime />
          </p>
          <p>
            <SetClockButton>Update Date and Time</SetClockButton>
          </p>
          <h1>Configuration</h1>
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
      <Sidebar
        appName={election ? machineConfig.appMode.productName : ''}
        centerContent
        title="Election Manager Actions"
        footer={
          <React.Fragment>
            {electionDefinition && (
              <ElectionInfo
                electionDefinition={electionDefinition}
                precinctSelection={appPrecinct}
                horizontal
              />
            )}
            <VersionsData
              machineConfig={machineConfig}
              electionHash={electionDefinition?.electionHash}
            />
          </React.Fragment>
        }
      >
        {election && (
          <Prose>
            <h2>Instructions</h2>
            <p>
              Switching Precinct or Live Mode will reset printed ballots count.
            </p>
            <p>Remove card when finished.</p>
          </Prose>
        )}
      </Sidebar>
    </Screen>
  );
}
