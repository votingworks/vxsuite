import React from 'react'

import { ButtonEventFunction, Precinct } from '../config/types'

import Button from '../components/Button'
import ButtonList from '../components/ButtonList'
import Heading from '../components/Heading'
import Prose from '../components/Prose'

interface Props {
  precincts: Precinct[]
  updatePrecinct: ButtonEventFunction
}

const PrecinctsScreen = ({ precincts, updatePrecinct }: Props) => {
  return (
    <React.Fragment>
      <Heading>
        <Prose>
          <h1>Precincts</h1>
        </Prose>
      </Heading>
      <ButtonList>
        {precincts.map(p => (
          <Button data-id={p.id} fullWidth key={p.id} onClick={updatePrecinct}>
            {p.name}
          </Button>
        ))}
      </ButtonList>
    </React.Fragment>
  )
}

export default PrecinctsScreen
