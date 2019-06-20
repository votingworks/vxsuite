import React, { useContext } from 'react'
import { RouteComponentProps } from 'react-router-dom'

import BallotContext from '../contexts/ballotContext'

import Button from '../components/Button'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'

const NotFoundPage = (props: RouteComponentProps) => {
  const { resetBallot } = useContext(BallotContext)
  const { pathname } = props.location
  const requestResetBallot = () => {
    resetBallot()
  }
  return (
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1>Page Not Found.</h1>
          <p>
            No page exists at <code>{pathname}</code>.
          </p>
          <p>
            <Button onPress={requestResetBallot}>Start Over</Button>
          </p>
        </Prose>
      </MainChild>
    </Main>
  )
}

export default NotFoundPage
