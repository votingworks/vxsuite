import React, { useContext } from 'react'
import { useParams } from 'react-router-dom'
import { Election, getPrecinctById } from '@votingworks/ballot-encoder'

import { BallotScreenProps } from '../config/types'
import AppContext from '../contexts/AppContext'

import { MainChild } from '../components/Main'
import { routerPaths } from '../components/ElectionManager'
import LinkButton from '../components/LinkButton'
import HandMarkedPaperBallot from '../components/HandMarkedPaperBallot'

const BallotScreen = () => {
  const { precinctId, ballotStyleId } = useParams<BallotScreenProps>()
  const { election: e } = useContext(AppContext)
  const election = e as Election
  const precinctName = getPrecinctById({ election, precinctId })?.name

  return (
    <MainChild>
      <LinkButton small to={routerPaths.ballotsList}>
        back to Ballots
      </LinkButton>
      <h1>
        Ballot Style <strong>{ballotStyleId}</strong> for {precinctName}
      </h1>
      <p>Print page to view ballot.</p>
      <HandMarkedPaperBallot
        ballotStyleId={ballotStyleId}
        election={election}
        precinctId={precinctId}
      />
    </MainChild>
  )
}

export default BallotScreen
