import React, { useContext, useState } from 'react'
import { RouteComponentProps } from 'react-router-dom'

import BallotContext from '../contexts/ballotContext'

import Button from '../components/Button'
import ButtonBar from '../components/ButtonBar'
import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Modal from '../components/Modal'
import Prose from '../components/Prose'
import { Text } from '../components/Typography'

const SettingsPage = (props: RouteComponentProps) => {
  const { resetVotes, votes } = useContext(BallotContext)
  const [showResetBallotAlert, setResetBallotAlert] = useState(false)
  const cancelResetBallot = () => {
    setResetBallotAlert(false)
  }
  const requestNewBallot = () => {
    Object.keys(votes).length === 0 ? startOver() : setResetBallotAlert(true)
  }
  const startOver = () => {
    resetVotes()
    props.history.push('/')
  }

  return (
    <>
      <Main>
        <MainChild>
          <Prose>
            <h1>Settings</h1>
            <p>Settings will be available here.</p>
            <h2>Clear Selections</h2>
            <p>Clearn all selections and start over.</p>
            <Button onClick={requestNewBallot}>Start Over</Button>
          </Prose>
        </MainChild>
      </Main>
      <ButtonBar secondary>
        <div />
        <LinkButton goBack>Back</LinkButton>
        <div />
        <div />
      </ButtonBar>
      <Modal
        isOpen={showResetBallotAlert}
        content={
          <Prose>
            <Text>
              Are you sure you want to clear all selections and start over?
            </Text>
          </Prose>
        }
        actions={
          <>
            <Button danger onClick={startOver}>
              Yes, Remove All Votes and Start Over
            </Button>
            <Button onClick={cancelResetBallot}>Cancel</Button>
          </>
        }
      />
    </>
  )
}

export default SettingsPage
