import React from 'react'
import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'

const ExpiredCardScreen = () => (
  <Main>
    <MainChild center>
      <Prose textCenter>
        <h1>Expired Card</h1>
        <p>Please see poll worker for assistance.</p>
      </Prose>
    </MainChild>
  </Main>
)

export default ExpiredCardScreen
