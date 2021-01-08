import React from 'react'

import styled from 'styled-components'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Screen from '../components/Screen'

const Graphic = styled.img`
  margin: 0 auto -1rem;
  height: 30vw;
`

const RemoveCardScreen: React.FC = () => (
  <Screen white>
    <Main>
      <MainChild centerVertical maxWidth={false}>
        <Prose textCenter id="audiofocus">
          <p>Your votes have been saved to the card.</p>
          <p>
            <Graphic
              aria-hidden
              src="/images/take-card-to-printer.svg"
              alt="Take Card to Printer"
            />
          </p>
          <h1 aria-label="Remove your card. Take card to the Ballot Printer to print your official ballot.">
            Take your card to the Ballot Printer.
          </h1>
        </Prose>
      </MainChild>
    </Main>
  </Screen>
)

export default RemoveCardScreen
