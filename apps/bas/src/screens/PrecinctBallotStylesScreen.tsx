import React from 'react'

import { ButtonEventFunction, BallotStyle } from '../config/types'

import Button from '../components/Button'
import ButtonList from '../components/ButtonList'
import Heading from '../components/Heading'
import Prose from '../components/Prose'

interface Props {
  precinctBallotStyles: BallotStyle[]
  precinctName: string
  programCard: ButtonEventFunction
}

const PrecinctBallotStylesScreen = ({
  precinctBallotStyles,
  precinctName,
  programCard,
}: Props) => {
  return (
    <React.Fragment>
      <Heading>
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
