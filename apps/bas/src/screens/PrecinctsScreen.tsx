import React from 'react'

import {
  ButtonEventFunction,
  Precinct,
  OptionalVoterCardData,
} from '../config/types'

import Button from '../components/Button'
import ButtonList from '../components/ButtonList'
import Heading from '../components/Heading'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Prose from '../components/Prose'
import Screen from '../components/Screen'

interface Props {
  cardBallotStyleId: string
  cardPrecinctName: string
  lockScreen: () => void
  precincts: Precinct[]
  updatePrecinct: ButtonEventFunction
  voterCardData: OptionalVoterCardData
}

const PrecinctsScreen = ({
  // cardBallotStyleId,
  // cardPrecinctName,
  lockScreen,
  precincts,
  updatePrecinct,
}: Props) => {
  return (
    <Screen>
      <Main>
        <MainChild maxWidth={false}>
          <Heading>
            <Prose>
              <h1>Precincts</h1>
            </Prose>
          </Heading>
          <ButtonList>
            {precincts.map(p => (
              <Button
                data-id={p.id}
                fullWidth
                key={p.id}
                onClick={updatePrecinct}
              >
                {p.name}
              </Button>
            ))}
          </ButtonList>
        </MainChild>
      </Main>
      <MainNav>
        <Button onClick={lockScreen}>Lock</Button>
      </MainNav>
    </Screen>
  )
}

export default PrecinctsScreen
