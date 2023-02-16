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
import { assert } from '@votingworks/basics';
import { ScreenReader } from '../config/types';
import { getElectionDefinitionFromCard } from '../api';

export interface AdminScreenProps {
  appPrecinct?: PrecinctSelection;
  ballotsPrintedCount: number;
  electionDefinition?: ElectionDefinition;
  updateElectionDefinition: (electionDefinition: ElectionDefinition) => void;
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
  updateElectionDefinition,
  isLiveMode,
  updateAppPrecinct,
  toggleLiveMode,
  unconfigure,
  machineConfig,
  screenReader,
  pollsState,
  logger,
}: AdminScreenProps): JSX.Element {
  const election = electionDefinition?.election;
  const electionHash = electionDefinition?.electionHash;

  const electionDefinitionFromCardQuery =
    getElectionDefinitionFromCard.useQuery(electionHash, {
      // Disable automatic fetching and only allow manual fetching through .refetch()
      enabled: false,
    });

  async function loadElection() {
    const { data } = await electionDefinitionFromCardQuery.refetch();
    assert(data !== undefined);
    const electionDefinitionFromCard = data.ok();
    // TODO: Handle case that electionDefinitionFromCard is undefined, e.g. because it couldn't be
    // parsed
    if (electionDefinitionFromCard) {
      updateElectionDefinition(electionDefinitionFromCard);
    }
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
          {election ? (
            <p>
              <Text as="span" voteIcon>
                Election Definition is loaded.
              </Text>{' '}
              <Button danger small onPress={unconfigure}>
                Unconfigure Machine
              </Button>
            </p>
          ) : electionDefinitionFromCardQuery.isFetching ? (
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
