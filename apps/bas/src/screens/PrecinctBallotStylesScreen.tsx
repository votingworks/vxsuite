import React from 'react'
import styled from 'styled-components'

import { ButtonEventFunction, BallotStyle } from '../config/types'

import Button from '../components/Button'
import ButtonList from '../components/ButtonList'
import Heading from '../components/Heading'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Prose from '../components/Prose'
import Screen from '../components/Screen'
import CurrentVoterCard from '../components/CurrentVoterCard'

const ButtonContainer = styled.div`
  float: right;
`

interface Props {
  cardBallotStyleId: string
  cardPrecinctName: string
  isSinglePrecinctMode: boolean
  lockScreen: () => void
  partyId: string
  precinctBallotStyles: BallotStyle[]
  precinctName: string
  programCard: ButtonEventFunction
  showPrecincts: () => void
}

const PrecinctBallotStylesScreen = ({
  cardBallotStyleId,
  cardPrecinctName,
  isSinglePrecinctMode,
  lockScreen,
  partyId,
  precinctBallotStyles,
  precinctName,
  programCard,
  showPrecincts,
}: Props) => {
  const ballotStyles = partyId
    ? precinctBallotStyles.filter(bs => bs.partyId === partyId)
    : precinctBallotStyles
  return (
    <Screen>
      <Main>
        <MainChild maxWidth={false}>
          <Heading>
            {!isSinglePrecinctMode && (
              <ButtonContainer>
                <Button onClick={showPrecincts}>All Precincts</Button>
              </ButtonContainer>
            )}
            <Prose>
              <p>{precinctName}</p>
              <h1>Ballot Styles</h1>
            </Prose>
          </Heading>
          <ButtonList>
            {ballotStyles.map(ballotStyle => (
              <Button
                fullWidth
                data-ballot-style-id={ballotStyle.id}
                key={ballotStyle.id}
                onClick={programCard}
              >
                {ballotStyle.id}
              </Button>
            ))}
          </ButtonList>
        </MainChild>
      </Main>
      <MainNav>
        <Button onClick={lockScreen}>Lock</Button>
      </MainNav>
      <CurrentVoterCard
        cardBallotStyleId={cardBallotStyleId}
        cardPrecinctName={cardPrecinctName}
      />
    </Screen>
  )
}

export default PrecinctBallotStylesScreen
