import React from 'react'
import styled from 'styled-components'

import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Screen from '../components/Screen'
import Button from '../components/Button'

const InsertCardImage = styled.img`
  margin: 0 auto -1.75rem;
  height: 40vw;
`

interface Props {
  lockScreen: () => void
}

const InsertCardScreen = ({ lockScreen }: Props) => {
  return (
    <Screen>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <InsertCardImage
              src="/images/insert-card.svg"
              alt="Insert Card Diagram"
            />
            <h1>Insert Voter Card</h1>
          </Prose>
        </MainChild>
      </Main>
      <MainNav>
        <Button small onPress={lockScreen}>
          Lock
        </Button>
      </MainNav>
    </Screen>
  )
}

export default InsertCardScreen
