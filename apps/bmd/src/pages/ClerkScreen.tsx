import React, { useEffect, useState } from 'react'

import { ButtonEventFunction, OptionalElection } from '../config/types'

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
  fetchElection: () => void
  unconfigure: ButtonEventFunction
  toggleLiveMode: () => void
}

const ClerkScreen = ({
  ballotsPrintedCount,
  election,
  isLiveMode,
  fetchElection,
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
  const [isLoadingElection, setIsLoadingElection] = useState(false)
  const loadElection = () => {
    setIsLoadingElection(true)
    fetchElection()
  }
  useEffect(() => {
    setIsLoadingElection(false)
  }, [election])
  return (
    <React.Fragment>
      <Main>
        <MainChild>
          <Prose>
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
                      onClick={showModal}
                      primary={!isLiveMode}
                      disabled={!isLiveMode}
                    >
                      Testing Mode
                    </Button>
                    <Button
                      onClick={showModal}
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
                      <Button small>View Testing Ballots Deck</Button>
                    </p>
                  </React.Fragment>
                )}
              </React.Fragment>
            )}
            <h1>Configuration</h1>
            {isLoadingElection ? (
              <p>Loading Election Definition from Clerk Card…</p>
            ) : election ? (
              <p>
                <Text as="span" voteIcon>
                  Election definition loaded.
                </Text>{' '}
                <Button small onClick={unconfigure}>
                  Remove
                </Button>
              </p>
            ) : (
              <React.Fragment>
                <Text warningIcon>
                  Election definition <strong>not Loaded</strong>.
                </Text>
                <p>
                  <Button onClick={loadElection}>
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
            <Button primary onClick={handleToggleLiveMode}>
              Yes
            </Button>
            <Button onClick={hideModal}>Cancel</Button>
          </>
        }
      />
    </React.Fragment>
  )
}

export default ClerkScreen
