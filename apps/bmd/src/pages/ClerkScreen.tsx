import React, { useState } from 'react'

import {
  AppMode,
  InputEventFunction,
  OptionalElection,
  VoidFunction,
  VxMarkOnly,
  VxPrintOnly,
  VxMarkPlusVxPrint,
} from '../config/types'

import TestBallotDeckScreen from './TestBallotDeckScreen'

import Button, { SegmentedButton } from '../components/Button'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Modal from '../components/Modal'
import Prose from '../components/Prose'
import Text from '../components/Text'

interface Props {
  appMode: AppMode
  ballotsPrintedCount: number
  election: OptionalElection
  isLiveMode: boolean
  fetchElection: VoidFunction
  isFetchingElection: boolean
  setAppMode: InputEventFunction
  toggleLiveMode: VoidFunction
  unconfigure: VoidFunction
}

const ClerkScreen = ({
  appMode,
  ballotsPrintedCount,
  election,
  isLiveMode,
  fetchElection,
  isFetchingElection,
  setAppMode,
  toggleLiveMode,
  unconfigure,
}: Props) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const showModal = () => setIsModalOpen(true)
  const hideModal = () => setIsModalOpen(false)
  const handleToggleLiveMode = () => {
    hideModal()
    toggleLiveMode()
  }
  const loadElection = () => {
    fetchElection()
  }
  const [isTestDeck, setIsTestDeck] = useState(false)
  const showTestDeck = () => setIsTestDeck(true)
  const hideTestDeck = () => setIsTestDeck(false)
  if (isTestDeck && election) {
    return (
      <TestBallotDeckScreen
        appName={appMode.name}
        election={election}
        hideTestDeck={hideTestDeck}
        isLiveMode={false} // always false for Test Mode
      />
    )
  }
  const isTestDecksAvailable = isLiveMode || (!isLiveMode && appMode.isVxPrint)
  return (
    <React.Fragment>
      <Main>
        <MainChild maxWidth={false}>
          <Prose>
            <p>Remove card when finished making changes.</p>
            {election && (
              <React.Fragment>
                <h1>App Mode</h1>
                <p>This device can operate as multiple apps.</p>
                <SegmentedButton>
                  <Button
                    onPress={setAppMode}
                    data-app-mode="VxMark"
                    primary={appMode === VxMarkOnly}
                    disabled={appMode === VxMarkOnly}
                  >
                    VxMark Only
                  </Button>
                  <Button
                    onPress={setAppMode}
                    data-app-mode="VxPrint"
                    primary={appMode === VxPrintOnly}
                    disabled={appMode === VxPrintOnly}
                  >
                    VxPrint Only
                  </Button>
                  <Button
                    onPress={setAppMode}
                    data-app-mode="VxMark + VxPrint"
                    primary={appMode === VxMarkPlusVxPrint}
                    disabled={appMode === VxMarkPlusVxPrint}
                  >
                    VxMark+Print
                  </Button>
                </SegmentedButton>
                <h1>Testing Mode</h1>
                <p>
                  <SegmentedButton>
                    <Button
                      onPress={showModal}
                      primary={!isLiveMode}
                      disabled={!isLiveMode}
                    >
                      Testing Mode
                    </Button>
                    <Button
                      onPress={showModal}
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
                    disabled={isTestDecksAvailable}
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
                  Printed Ballots: <strong>{ballotsPrintedCount}</strong>{' '}
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
                  <Button onPress={loadElection}>
                    Load Election Definition
                  </Button>
                </p>
              </React.Fragment>
            )}
          </Prose>
        </MainChild>
      </Main>
      <MainNav appName={appMode.name} title="Clerk Actions" />
      <Modal
        isOpen={isModalOpen}
        centerContent
        content={
          <Prose textCenter>
            <p>
              {isLiveMode
                ? 'Switch to Testing Mode and zero Printed Ballots count?'
                : 'Switch to Live Election Mode and zero Printed Ballots count?'}
            </p>
          </Prose>
        }
        actions={
          <>
            <Button primary onPress={handleToggleLiveMode}>
              Yes
            </Button>
            <Button onPress={hideModal}>Cancel</Button>
          </>
        }
      />
    </React.Fragment>
  )
}

export default ClerkScreen
