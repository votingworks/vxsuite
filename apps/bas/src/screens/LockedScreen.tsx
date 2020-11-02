import React from 'react'

import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Screen from '../components/Screen'

const LockedScreen = () => {
  return (
    <Screen>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <h1>Screen Locked</h1>
            <p>Insert Poll Worker card.</p>
          </Prose>
        </MainChild>
      </Main>
      <MainNav />
    </Screen>
  )
}

export default LockedScreen
