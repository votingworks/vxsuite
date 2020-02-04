import React, { useState } from 'react'
import { OptionalElection } from '@votingworks/ballot-encoder'

import { AppMode, EventTargetFunction, VoidFunction } from '../config/types'

import TestBallotDeckScreen from './TestBallotDeckScreen'

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
  setAppPrecinctId,
  toggleLiveMode,
  unconfigure,
}: Props) => {
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
                        a.name.localeCompare(b.name, undefined, {
                          ignorePunctuation: true,
                        })
                      )
                      .map(precinct => (
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
                {appMode.isVxPrint && (
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
              Switching Precinct or Live Mode will reset tally and printed
              ballots count.
            </p>
            <p>Remove card when finished.</p>
          </Prose>
        )}
      </Sidebar>
    </Screen>
  )
}

export default ClerkScreen
