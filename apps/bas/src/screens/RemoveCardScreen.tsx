import React from 'react'
import styled from 'styled-components'

import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Screen from '../components/Screen'
import Button from '../components/Button'

const RemoveCardImage = styled.img`
  margin: 0 auto -1.75rem;
  height: 40vw;
`

interface Props {
  ballotStyleId: string
  lockScreen: () => void
  precinctName: string
}

const RemoveCardScreen = ({
  ballotStyleId,
  lockScreen,
  precinctName,
}: Props) => {
  return (
    <Screen>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <RemoveCardImage
              src="/images/remove-card.svg"
              alt="Remove Card Diagram"
            />
            <h1>Hand Card to Voter</h1>
            <p>
              {precinctName} / {ballotStyleId}
            </p>
          </Prose>
        </MainChild>
      </Main>
      <MainNav>
        <Button small onClick={lockScreen}>
          Lock
        </Button>
      </MainNav>
    </Screen>
  )
}

export default RemoveCardScreen
