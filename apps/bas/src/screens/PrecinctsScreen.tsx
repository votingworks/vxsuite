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
import Text from '../components/Text'

interface Props {
  cardBallotStyleId: string
  cardPrecinctName: string
  countyName: string
  lockScreen: () => void
  precincts: Precinct[]
  updatePrecinct: ButtonEventFunction
  voterCardData: OptionalVoterCardData
}

const PrecinctsScreen = ({
  // cardBallotStyleId,
  // cardPrecinctName,
  countyName,
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
              <h1>
                Precincts{' '}
                <Text as="span" light>
                  for {countyName}
                </Text>
              </h1>
            </Prose>
          </Heading>
          <ButtonList columns={2}>
            {precincts.map(p => (
              <Button
                data-id={p.id}
                fullWidth
                key={p.id}
                onPress={updatePrecinct}
              >
                {p.name}
              </Button>
            ))}
          </ButtonList>
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

export default PrecinctsScreen
