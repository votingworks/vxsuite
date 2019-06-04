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
  precinctBallotStyles: BallotStyle[]
  precinctName: string
  programCard: ButtonEventFunction
  showPrecincts: () => void
}

const PrecinctBallotStylesScreen = ({
  precinctBallotStyles,
  precinctName,
  programCard,
  showPrecincts,
}: Props) => {
  return (
    <React.Fragment>
      <Heading>
        <ButtonContainer>
          <Button onClick={showPrecincts}>All Precincts</Button>
        </ButtonContainer>
        <Prose>
          <p>{precinctName}</p>
          <h1>Ballot Styles</h1>
        </Prose>
      </Heading>
      <ButtonList>
        {precinctBallotStyles.map(ballotStyle => (
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
