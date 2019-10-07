import React from 'react'

import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Screen from '../components/Screen'
import Button from '../components/Button'

interface Props {
  lockScreen: () => void
}

const InsertCardScreen = ({ lockScreen }: Props) => {
  return (
    <Screen>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <h1>Insert Voter Card</h1>
          </Prose>
        </MainChild>
      </Main>
      <MainNav>
        <Button onClick={lockScreen}>Lock</Button>
      </MainNav>
    </Screen>
  )
}

export default InsertCardScreen
