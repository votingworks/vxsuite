import React from 'react'
import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'

const UnconfiguredScreen = () => (
  <React.Fragment>
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1>Device Not Configured</h1>
          <p>Insert Election Clerk card.</p>
        </Prose>
      </MainChild>
    </Main>
    <MainNav />
  </React.Fragment>
)

export default UnconfiguredScreen
