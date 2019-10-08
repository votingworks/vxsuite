import React, { useState } from 'react'

import {
  AppMode,
  AppModeNames,
  EventTargetFunction,
  OptionalElection,
  VoidFunction,
  VxMarkOnly,
  VxPrintOnly,
  VxMarkPlusVxPrint,
} from '../config/types'

import TestBallotDeckScreen from './TestBallotDeckScreen'

import alphaSort from '../utils/alphaSort'

import Button, { SegmentedButton } from '../components/Button'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Text from '../components/Text'
import Sidebar from '../components/Sidebar'
import ElectionInfo from '../components/ElectionInfo'
import Screen from '../components/Screen'
import Select from '../components/Select'

interface Props {
  appMode: AppMode
  appPrecinctId: string
  ballotsPrintedCount: number
  election: OptionalElection
  isLiveMode: boolean
  fetchElection: VoidFunction
  isFetchingElection: boolean
  setAppMode: (appModeName: AppModeNames) => void
  setAppPrecinctId: (appPrecinctId: string) => void
  toggleLiveMode: VoidFunction
  unconfigure: VoidFunction
}

const ClerkScreen = ({
  appMode,
  appPrecinctId,
  ballotsPrintedCount,
  election,
  isLiveMode,
  fetchElection,
  isFetchingElection,
  setAppMode,
  setAppPrecinctId,
  toggleLiveMode,
  unconfigure,
}: Props) => {
  const changeAppMode: EventTargetFunction = event => {
    const currentTarget = event.currentTarget as HTMLInputElement
    const appModeName = currentTarget.dataset.appMode as AppModeNames
    setAppMode(appModeName)
  }

  const changeAppPrecinctId: EventTargetFunction = event => {
    const currentTarget = event.currentTarget as HTMLInputElement
    const appPrecinctId = currentTarget.value
    setAppPrecinctId(appPrecinctId)
  }

  const [isTestDeck, setIsTestDeck] = useState(false)
  const showTestDeck = () => setIsTestDeck(true)
  const hideTestDeck = () => setIsTestDeck(false)
  if (isTestDeck && election) {
    return (
      <TestBallotDeckScreen
        appName={appMode.name}
        appPrecinctId={appPrecinctId}
        election={election}
        hideTestDeck={hideTestDeck}
        isLiveMode={false} // always false for Test Mode
      />
    )
  }

  const isTestDecksAvailable = !isLiveMode && appMode.isVxPrint
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
                    {election.precincts
                      .sort((a, b) =>
                        alphaSort(a.name.toLowerCase(), b.name.toLowerCase())
                      )
                      .map(precinct => (
                        <option key={precinct.id} value={precinct.id}>
                          {precinct.name}
                        </option>
                      ))}
                  </Select>
                </p>
                <h1>App Mode</h1>
                <p>
                  <SegmentedButton>
                    <Button
                      onPress={changeAppMode}
                      data-app-mode="VxMark"
                      primary={appMode === VxMarkOnly}
                      disabled={appMode === VxMarkOnly}
                    >
                      VxMark Only
                    </Button>
                    <Button
                      onPress={changeAppMode}
                      data-app-mode="VxPrint"
                      primary={appMode === VxPrintOnly}
                      disabled={appMode === VxPrintOnly}
                    >
                      VxPrint Only
                    </Button>
                    <Button
                      onPress={changeAppMode}
                      data-app-mode="VxMark + VxPrint"
                      primary={appMode === VxMarkPlusVxPrint}
                      disabled={appMode === VxMarkPlusVxPrint}
                    >
                      VxMark+Print
                    </Button>
                  </SegmentedButton>
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
                  {!isLiveMode && !appMode.isVxPrint && (
                    <Text as="small" muted>
                      (Available with VxPrint or VxMark+Print)
                    </Text>
                  )}
                </p>
                <Text as="h1" muted={!appMode.isVxPrint}>
                  Stats
                </Text>
                <Text muted={!appMode.isVxPrint}>
                  Printed and Tallied Ballots:{' '}
                  <strong>{ballotsPrintedCount}</strong>{' '}
                  {!appMode.isVxPrint && (
                    <small>(Available with VxPrint or VxMark+Print)</small>
                  )}
                </Text>
              </React.Fragment>
            )}
            <h1>Configuration</h1>
            {isFetchingElection ? (
              <p>Loading Election Definition from Clerk Card…</p>
            ) : election ? (
              <p>
                <Text as="span" voteIcon>
                  Election definition is loaded.
                </Text>{' '}
                <Button small onPress={unconfigure}>
                  Remove
                </Button>
              </p>
            ) : (
              <React.Fragment>
                <Text warningIcon>Election definition is not Loaded.</Text>
                <p>
                  <Button onPress={fetchElection}>
                    Load Election Definition
                  </Button>
                </p>
              </React.Fragment>
            )}
          </Prose>
        </MainChild>
      </Main>
      <Sidebar
        appName={election ? appMode.name : ''}
        centerContent
        title="Election Admin Actions"
        footer={
          election && (
            <ElectionInfo
              election={election}
              precinctId={appPrecinctId}
              horizontal
            />
          )
        }
      >
        {election && (
          <Prose>
            <h2>Instructions</h2>
            <p>
              Switching Precinct, App Mode, or Live Mode will reset tally and
              printed ballots count.
            </p>
            <p>Remove card when finished.</p>
          </Prose>
        )}
      </Sidebar>
    </Screen>
  )
}

export default ClerkScreen
