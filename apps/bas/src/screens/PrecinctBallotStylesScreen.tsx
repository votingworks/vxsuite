import React from 'react'
import styled from 'styled-components'

import { ButtonEventFunction, BallotStyle } from '../config/types'

import Button from '../components/Button'
import ButtonList from '../components/ButtonList'
import Heading from '../components/Heading'
import Prose from '../components/Prose'

const ButtonContainer = styled.div`
  float: right;
`

interface Props {
  isSinglePrecinctMode: boolean
  partyId: string
  precinctBallotStyles: BallotStyle[]
  precinctName: string
  programCard: ButtonEventFunction
  showPrecincts: () => void
}

const PrecinctBallotStylesScreen = ({
  isSinglePrecinctMode,
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
    <React.Fragment>
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
    </React.Fragment>
  )
}

export default PrecinctBallotStylesScreen
