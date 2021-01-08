import React from 'react'
import styled from 'styled-components'

import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Screen from '../components/Screen'

const Instructions = styled.ol`
  display: inline-block;
  margin: auto;
  border-top: 1px solid #9a9a9a;
  border-bottom: 1px solid #9a9a9a;
  padding: 1rem 1rem 1rem 2rem;
  text-align: left;
`

const CastBallotPage: React.FC = () => (
  <Screen white>
    <Main>
      <MainChild center maxWidth={false}>
        <Prose textCenter id="audiofocus">
          <h1 aria-label="You’re almost done.">You’re Almost Done…</h1>
          <p>Your official paper ballot is printing. To finish voting:</p>
          <Instructions>
            <li>Review the votes on your printed ballot.</li>
            <li>Place your ballot in the ballot box.</li>
            <li>Return card to poll worker.</li>
          </Instructions>
          <p>Need help? Ask a poll worker.</p>
        </Prose>
      </MainChild>
    </Main>
  </Screen>
)

export default CastBallotPage
