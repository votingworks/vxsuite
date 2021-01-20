import React from 'react'
import styled from 'styled-components'
import { BallotStyle } from '@votingworks/ballot-encoder'

import { EventTargetFunction } from '../config/types'

import Button from '../components/Button'
import ButtonList from '../components/ButtonList'
import Heading from '../components/Heading'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Prose from '../components/Prose'
import Screen from '../components/Screen'
import Text from '../components/Text'

const ButtonContainer = styled.div`
  float: right;
`

interface Props {
  cardBallotStyleId: string
  cardPrecinctName: string
  isSinglePrecinctMode: boolean
  lockScreen: () => void
  partyId: string
  precinctBallotStyles: readonly BallotStyle[]
  precinctName: string
  programCard: EventTargetFunction
  showPrecincts: () => void
}

const PrecinctBallotStylesScreen: React.FC<Props> = ({
  // cardBallotStyleId,
  // cardPrecinctName,
  isSinglePrecinctMode,
  lockScreen,
  partyId,
  precinctBallotStyles,
  precinctName,
  programCard,
  showPrecincts,
}) => {
  const ballotStyles = partyId
    ? precinctBallotStyles.filter((bs) => bs.partyId === partyId)
    : precinctBallotStyles
  const ballotStylesColumns = ballotStyles.length > 4 ? 3 : 2
  return (
    <Screen>
      <Main>
        <MainChild maxWidth={false}>
          <Heading>
            {!isSinglePrecinctMode && (
              <ButtonContainer>
                <Button small onPress={showPrecincts}>
                  All Precincts
                </Button>
              </ButtonContainer>
            )}
            <Prose>
              <h1>
                Ballot Styles{' '}
                <Text as="span" light>
                  for {precinctName}
                </Text>
              </h1>
            </Prose>
          </Heading>
          <ButtonList columns={ballotStylesColumns}>
            {ballotStyles.map((ballotStyle) => (
              <Button
                fullWidth
                data-ballot-style-id={ballotStyle.id}
                key={ballotStyle.id}
                onPress={programCard}
              >
                {ballotStyle.id}
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

export default PrecinctBallotStylesScreen
