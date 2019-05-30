import React from 'react'
import styled from 'styled-components'

import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import TestMode from '../components/TestMode'

const Card = styled.div`
  margin: 0 auto 2rem;
  max-width: 300px;
`

interface Props {
  isLiveMode: boolean
}

const ActivationScreen = ({ isLiveMode }: Props) => {
  return (
    <Main>
      <MainChild center>
        <Prose textCenter>
          <TestMode isLiveMode={isLiveMode} />
          <Card>
            <img src="/insert-card.svg" alt="Insert Card Diagram" />
          </Card>
          <h1>Load Ballot</h1>
          <p>Insert voter card to load ballot.</p>
        </Prose>
      </MainChild>
    </Main>
  )
}

export default ActivationScreen
