import React from 'react'
import { MainChild } from '../components/Main'
import { useParams } from 'react-router-dom'

import { BallotScreenProps } from '../config/types'

import { routerPaths } from '../components/ElectionManager'
import LinkButton from '../components/LinkButton'

const BallotScreen = () => {
  const { precinctId, styleId } = useParams<BallotScreenProps>()

  return (
    <MainChild>
      <h1>BallotScreen</h1>
      <LinkButton small to={routerPaths.ballotsList}>
        Ballots
      </LinkButton>
      <p>precinctId: {precinctId}</p>
      <p>styleId: {styleId}</p>
    </MainChild>
  )
}

export default BallotScreen
