import { DateTime } from 'luxon';
import React, { useCallback, useEffect, useState } from 'react';

import {
  ElectionDefinition,
  PrecinctIdSchema,
  unsafeParse,
} from '@votingworks/types';
import { formatFullDateTimeZone, Printer } from '@votingworks/utils';
import {
  Button,
  Main,
  MainChild,
  SegmentedButton,
  useNow,
} from '@votingworks/ui';
import {
  MachineConfig,
  PrecinctSelection,
  PrecinctSelectionKind,
  ScreenReader,
  SelectChangeEventFunction,
} from '../config/types';

import { TestBallotDeckScreen } from './test_ballot_deck_screen';

import { Prose } from '../components/prose';
import { Text } from '../components/text';
import { Sidebar } from '../components/sidebar';
import { ElectionInfo } from '../components/election_info';
import { Screen } from '../components/screen';
import { Select } from '../components/select';
import { VersionsData } from '../components/versions_data';
import { PickDateTimeModal } from '../components/pick_date_time_modal';
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
    const precinctIdSelection = event.currentTarget.value;

    if (precinctIdSelection === ALL_PRECINCTS_OPTION_VALUE) {
      updateAppPrecinct({ kind: PrecinctSelectionKind.AllPrecincts });
    } else if (precinctIdSelection) {
      updateAppPrecinct({
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: unsafeParse(PrecinctIdSchema, precinctIdSelection),
      });
    }
  };

  const [isFetchingElection, setIsFetchingElection] = useState(false);
  function loadElection() {
    setIsFetchingElection(true);
    fetchElection();
  }

  const [isTestDeck, setIsTestDeck] = useState(false);
  function showTestDeck() {
    return setIsTestDeck(true);
  }
  function hideTestDeck() {
    return setIsTestDeck(false);
  }

  const [isSystemDateModalActive, setIsSystemDateModalActive] = useState(false);
  const [isSettingClock, setIsSettingClock] = useState(false);
  const systemDate = useNow();

  const setClock = useCallback(
    async (date: DateTime) => {
      setIsSettingClock(true);
      try {
        await window.kiosk?.setClock({
          isoDatetime: date.toISO(),
          // TODO: Rename to `ianaZone` in kiosk-browser and update here.
          // eslint-disable-next-line vx/gts-identifiers
          IANAZone: date.zoneName,
        });
        setIsSystemDateModalActive(false);
      } finally {
        setIsSettingClock(false);
      }
    },
    [setIsSettingClock, setIsSystemDateModalActive]
  );

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

  const isTestDecksAvailable = !isLiveMode && machineConfig.appMode.isVxPrint;
  return (
    <Screen flexDirection="row-reverse" voterMode={false}>
      <Main padded>
        <MainChild maxWidth={false}>
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
                {machineConfig.appMode.isVxPrint && (
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
                <h1>Current Date and Time</h1>
                <p>
                  {formatFullDateTimeZone(systemDate, {
                    includeTimezone: true,
                  })}
                </p>
                <p>
                  <Button onPress={() => setIsSystemDateModalActive(true)}>
                    Update Date and Time
                  </Button>
                </p>
              </React.Fragment>
            )}
            <h1>Configuration</h1>
            {election ? (
              <p>
                <Text as="span" voteIcon>
                  Election definition is loaded.
                </Text>{' '}
                <Button small onPress={unconfigure}>
                  Remove
                </Button>
              </p>
            ) : isFetchingElection ? (
              <p>Loading Election Definition from Admin Card…</p>
            ) : (
              <React.Fragment>
                <Text warningIcon>Election definition is not Loaded.</Text>
                <p>
                  <Button onPress={loadElection}>
                    Load Election Definition
                  </Button>
                </p>
              </React.Fragment>
            )}
          </Prose>
        </MainChild>
      </Main>
      <Sidebar
        appName={election ? machineConfig.appMode.name : ''}
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
      {isSystemDateModalActive && (
        <PickDateTimeModal
          disabled={isSettingClock}
          onCancel={() => setIsSystemDateModalActive(false)}
          onSave={setClock}
          saveLabel={isSettingClock ? 'Saving…' : 'Save'}
          value={systemDate}
        />
      )}
    </Screen>
  );
}
