import { DateTime } from 'luxon'
import React, { useCallback, useState } from 'react'

import { OptionalElectionDefinition } from '@votingworks/types'
import { MachineConfig, SelectChangeEventFunction } from '../config/types'

import TestBallotDeckScreen from './TestBallotDeckScreen'

import Button, { SegmentedButton } from '../components/Button'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Text from '../components/Text'
import Sidebar from '../components/Sidebar'
import ElectionInfo from '../components/ElectionInfo'
import Screen from '../components/Screen'
import Select from '../components/Select'
import { formatFullDateTimeZone } from '../utils/date'
import VersionsData from '../components/VersionsData'
import PickDateTimeModal from '../components/PickDateTimeModal'
import useNow from '../hooks/useNow'

interface Props {
  appPrecinctId: string
  ballotsPrintedCount: number
  electionDefinition: OptionalElectionDefinition
  isLiveMode: boolean
  fetchElection: VoidFunction
  updateAppPrecinctId: (appPrecinctId: string) => void
  toggleLiveMode: VoidFunction
  unconfigure: VoidFunction
  machineConfig: MachineConfig
}

const AdminScreen: React.FC<Props> = ({
  appPrecinctId,
  ballotsPrintedCount,
  electionDefinition,
  isLiveMode,
  fetchElection,
  updateAppPrecinctId,
  toggleLiveMode,
  unconfigure,
  machineConfig,
}) => {
  const election = electionDefinition?.election
  const changeAppPrecinctId: SelectChangeEventFunction = (event) => {
    updateAppPrecinctId(event.currentTarget.value)
  }

  const [isFetchingElection, setIsFetchingElection] = useState(false)
  const loadElection = () => {
    setIsFetchingElection(true)
    fetchElection()
  }

  const [isTestDeck, setIsTestDeck] = useState(false)
  const showTestDeck = () => setIsTestDeck(true)
  const hideTestDeck = () => setIsTestDeck(false)

  const [isSystemDateModalActive, setIsSystemDateModalActive] = useState(false)
  const [isSettingClock, setIsSettingClock] = useState(false)
  const systemDate = useNow()

  const setClock = useCallback(
    async (date: DateTime) => {
      setIsSettingClock(true)
      try {
        await window.kiosk?.setClock({
          isoDatetime: date.toISO(),
          IANAZone: date.zoneName,
        })
        setIsSystemDateModalActive(false)
      } finally {
        setIsSettingClock(false)
      }
    },
    [setIsSettingClock, setIsSystemDateModalActive]
  )

  if (isTestDeck && electionDefinition) {
    return (
      <TestBallotDeckScreen
        appPrecinctId={appPrecinctId}
        electionDefinition={electionDefinition}
        hideTestDeck={hideTestDeck}
        machineConfig={machineConfig}
        isLiveMode={false} // always false for Test Mode
      />
    )
  }

  const isTestDecksAvailable = !isLiveMode && machineConfig.appMode.isVxPrint
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
                    value={appPrecinctId}
                    onBlur={changeAppPrecinctId}
                    onChange={changeAppPrecinctId}
                  >
                    <option value="" disabled>
                      Select a precinct for this device…
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
                      Printed and Tallied Ballots:{' '}
                      <strong>{ballotsPrintedCount}</strong>{' '}
                    </Text>
                  </React.Fragment>
                )}
                <h1>Current Date and Time</h1>
                <p>{formatFullDateTimeZone(systemDate, true)}</p>
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
              <p>Loading Election Definition from Clerk Card…</p>
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
                precinctId={appPrecinctId}
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
              Switching Precinct or Live Mode will reset tally and printed
              ballots count.
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
  )
}

export default AdminScreen
