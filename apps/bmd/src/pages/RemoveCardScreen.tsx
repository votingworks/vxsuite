import React from 'react'

import styled from 'styled-components'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Text from '../components/Text'
import Screen from '../components/Screen'

const GraphicNeeded = styled.div`
  margin: 2rem auto;
  border: 6px solid #ff0000;
  width: 30%;
  padding: 2rem 1rem;
  color: #ff0000;
  font-weight: 900;
`

const RemoveCardScreen = () => (
  <Screen>
    <Main>
      <MainChild centerVertical maxWidth={false}>
        <Prose textCenter id="audiofocus">
          <Text voteIcon>Your votes have been saved to the card.</Text>
          <GraphicNeeded>“Remove Card” graphic here</GraphicNeeded>
          <h1 aria-label="Take card to the Ballot Printer.">
            Take your card to the Ballot Printer.
          </h1>
        </Prose>
      </MainChild>
    </Main>
  </Screen>
)

export default RemoveCardScreen
