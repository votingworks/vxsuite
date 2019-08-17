import React, { useState } from 'react'

import { OptionalElection, VoidFunction } from '../config/types'

import TestBallotDeckScreen from './TestBallotDeckScreen'

import Button, { SegmentedButton } from '../components/Button'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Modal from '../components/Modal'
import Prose from '../components/Prose'
import Text from '../components/Text'

interface Props {
  ballotsPrintedCount: number
  election: OptionalElection
  isLiveMode: boolean
  fetchElection: VoidFunction
  isFetchingElection: boolean
  unconfigure: VoidFunction
  toggleLiveMode: VoidFunction
}

const ClerkScreen = ({
  ballotsPrintedCount,
  election,
  isLiveMode,
  fetchElection,
  isFetchingElection,
  unconfigure,
  toggleLiveMode,
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
        election={election}
        hideTestDeck={hideTestDeck}
        isLiveMode={false} // always false for Test Mode
      />
    )
  }
  return (
    <React.Fragment>
      <Main>
        <MainChild maxWidth={false}>
          <Prose>
            <p>Remove card when finished making changes.</p>
            {election && (
              <React.Fragment>
                <h1>Stats</h1>
                <p>
                  Printed Ballots: <strong>{ballotsPrintedCount}</strong>
                </p>
                <h1>Mode</h1>
                <p>Switching modes will zero printed ballots count.</p>
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
                {!isLiveMode && (
                  <React.Fragment>
                    <h2>Testing Mode Options</h2>
                    <p>
                      <Button small onPress={showTestDeck}>
                        View Test Ballot Decks
                      </Button>
                    </p>
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
                  <Button onPress={loadElection}>
                    Load Election Definition
                  </Button>
                </p>
              </React.Fragment>
            )}
          </Prose>
        </MainChild>
      </Main>
      <MainNav title="Clerk Actions" />
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
