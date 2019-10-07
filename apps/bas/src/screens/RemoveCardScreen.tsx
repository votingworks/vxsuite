import React from 'react'

import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Screen from '../components/Screen'
import Button from '../components/Button'

interface Props {
  ballotStyleId: string
  lockScreen: () => void
  precinctName: string
}

const RemoveCardScreen = ({
  ballotStyleId,
  lockScreen,
  precinctName,
}: Props) => {
  return (
    <Screen>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <p>
              Card programmed with:{' '}
              <strong>
                {precinctName} / {ballotStyleId}
              </strong>
            </p>
            <h1>Remove and Hand Card to Voter</h1>
          </Prose>
        </MainChild>
      </Main>
      <MainNav>
        <Button small onClick={lockScreen}>
          Lock
        </Button>
      </MainNav>
    </Screen>
  )
}

export default RemoveCardScreen
