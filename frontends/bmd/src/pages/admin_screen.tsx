import React, { useCallback, useEffect, useState } from 'react';

import { ElectionDefinition } from '@votingworks/types';
import { Printer } from '@votingworks/utils';
import {
  Button,
  CurrentDateAndTime,
  Main,
  Prose,
  Screen,
  SegmentedButton,
  SetClockButton,
  Text,
} from '@votingworks/ui';
import {
  MachineConfig,
  PrecinctSelection,
  PrecinctSelectionKind,
  ScreenReader,
  SelectChangeEventFunction,
} from '../config/types';

import { TestBallotDeckScreen } from './test_ballot_deck_screen';
import { Sidebar } from '../components/sidebar';
import { ElectionInfo } from '../components/election_info';
import { Select } from '../components/select';
import { VersionsData } from '../components/versions_data';
import { AllPrecinctsDisplayName } from '../utils/precinct_selection';

interface Props {
  appPrecinct?: PrecinctSelection;
  ballotsPrintedCount: number;
  electionDefinition?: ElectionDefinition;
  isLiveMode: boolean;
  fetchElection: VoidFunction;
  updateAppPrecinct: (appPrecinct: PrecinctSelection) => void;
  toggleLiveMode: VoidFunction;
  unconfigure: () => Promise<void>;
  machineConfig: MachineConfig;
  printer: Printer;
  screenReader: ScreenReader;
}

const ALL_PRECINCTS_OPTION_VALUE = '_ALL';

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
  printer,
  screenReader,
}: Props): JSX.Element {
  const election = electionDefinition?.election;
  const changeAppPrecinctId: SelectChangeEventFunction = (event) => {
    const precinctId = event.currentTarget.value;

    if (precinctId === ALL_PRECINCTS_OPTION_VALUE) {
      updateAppPrecinct({ kind: PrecinctSelectionKind.AllPrecincts });
    } else if (precinctId) {
      updateAppPrecinct({
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId,
      });
    }
  };

  const [isFetchingElection, setIsFetchingElection] = useState(false);
  const loadElection = useCallback(() => {
    setIsFetchingElection(true);
    fetchElection();
  }, [fetchElection]);

  const [isTestDeck, setIsTestDeck] = useState(false);
  const showTestDeck = useCallback(() => setIsTestDeck(true), []);
  const hideTestDeck = useCallback(() => setIsTestDeck(false), []);

  // Disable the audiotrack when in admin mode
  useEffect(() => {
    const initialMuted = screenReader.isMuted();
    screenReader.mute();
    return () => screenReader.toggleMuted(initialMuted);
  }, [screenReader]);

  if (isTestDeck && electionDefinition) {
    return (
      <TestBallotDeckScreen
        appPrecinct={appPrecinct}
        electionDefinition={electionDefinition}
        hideTestDeck={hideTestDeck}
        machineConfig={machineConfig}
        isLiveMode={false} // always false for Test Mode
        printer={printer}
      />
    );
  }

  const isTestDecksAvailable = !isLiveMode && machineConfig.appMode.isPrint;
  return (
    <Screen navLeft>
      <Main padded>
        <Prose>
          {election && (
            <React.Fragment>
              <h1>
                <label htmlFor="selectPrecinct">Precinct</label>
              </h1>
              <p>
                <Select
                  id="selectPrecinct"
                  value={
                    appPrecinct?.kind === PrecinctSelectionKind.AllPrecincts
                      ? ALL_PRECINCTS_OPTION_VALUE
                      : appPrecinct?.precinctId ?? ''
                  }
                  onBlur={changeAppPrecinctId}
                  onChange={changeAppPrecinctId}
                >
                  <option value="" disabled>
                    Select a precinct for this device…
                  </option>
                  <option value={ALL_PRECINCTS_OPTION_VALUE}>
                    {AllPrecinctsDisplayName}
                  </option>
                  {[...election.precincts]
                    .sort((a, b) =>
                      a.name.localeCompare(b.name, undefined, {
                        ignorePunctuation: true,
                      })
                    )
                    .map((precinct) => (
                      <option key={precinct.id} value={precinct.id}>
                        {precinct.name}
                      </option>
                    ))}
                </Select>
              </p>
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
                  <p>
                    <Button
                      small
                      disabled={!isTestDecksAvailable}
                      onPress={showTestDeck}
                    >
                      View Test Ballot Decks
                    </Button>{' '}
                    {isLiveMode && (
                      <Text as="small" muted>
                        (Available in testing mode)
                      </Text>
                    )}
                  </p>
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
                Election definition is loaded.
              </Text>{' '}
              <Button danger small onPress={unconfigure}>
                Unconfigure Machine
              </Button>
            </p>
          ) : isFetchingElection ? (
            <p>Loading Election Definition from Admin Card…</p>
          ) : (
            <React.Fragment>
              <Text warningIcon>Election definition is not Loaded.</Text>
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
        title="Election Admin Actions"
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
