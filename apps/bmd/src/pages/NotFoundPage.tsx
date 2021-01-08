import React, { useContext } from 'react'
import { RouteComponentProps } from 'react-router-dom'

import BallotContext from '../contexts/ballotContext'

import Button from '../components/Button'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Screen from '../components/Screen'

const NotFoundPage: React.FC<RouteComponentProps> = (props) => {
  const { resetBallot } = useContext(BallotContext)
  const { pathname } = props.location
  const requestResetBallot = () => {
    resetBallot()
  }
  return (
    <Screen>
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
    </Screen>
  )
}

export default NotFoundPage
