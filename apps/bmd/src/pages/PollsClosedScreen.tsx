import React from 'react'

import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'

const ActivationScreen = () => {
  return (
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1>Polls Closed</h1>
          <p>Insert Poll Worker card to open.</p>
        </Prose>
      </MainChild>
    </Main>
  )
}

export default ActivationScreen
