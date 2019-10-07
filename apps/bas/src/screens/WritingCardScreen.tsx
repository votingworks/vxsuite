import React from 'react'

import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import Screen from '../components/Screen'

interface Props {
  precinctName: string
  ballotStyleId: string
}

const WritingCardScreen = ({ ballotStyleId, precinctName }: Props) => {
  return (
    <Screen>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <p>Programming card with…</p>
            <h1>
              {precinctName} / {ballotStyleId}
            </h1>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  )
}

export default WritingCardScreen
