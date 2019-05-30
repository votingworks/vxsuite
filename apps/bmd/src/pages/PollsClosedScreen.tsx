import React from 'react'

import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import TestMode from '../components/TestMode'

interface Props {
  isLiveMode: boolean
}

const ActivationScreen = ({ isLiveMode }: Props) => {
  return (
    <Main>
      <MainChild center>
        <Prose textCenter>
          <TestMode isLiveMode={isLiveMode} />
          <h1>Polls Closed</h1>
          <p>Insert Poll Worker card to open.</p>
        </Prose>
      </MainChild>
    </Main>
  )
}

export default ActivationScreen
