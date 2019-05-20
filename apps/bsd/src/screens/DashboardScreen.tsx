import React from 'react'

import { ButtonEventFunction } from '../config/types'

import Button from '../components/Button'
import Heading from '../components/Heading'
import Prose from '../components/Prose'

interface Props {
  programCard: ButtonEventFunction
}

const PrecinctsScreen = ({ programCard }: Props) => {
  return (
    <React.Fragment>
      <Heading>
        <Prose>
          <h1>Dashboard</h1>
        </Prose>
      </Heading>
      <div>
        <Button onClick={programCard} data-id="admin">
          Program Card
        </Button>
      </div>
    </React.Fragment>
  )
}

export default PrecinctsScreen
