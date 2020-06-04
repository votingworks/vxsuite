import React, { useContext } from 'react'
import { useParams } from 'react-router-dom'
import { getPrecinctById } from '@votingworks/ballot-encoder'

import { BallotScreenProps } from '../config/types'
import AppContext from '../contexts/AppContext'

import { routerPaths } from '../components/ElectionManager'
import LinkButton from '../components/LinkButton'
import Button from '../components/Button'
import HandMarkedPaperBallot from '../components/HandMarkedPaperBallot'
import { Monospace } from '../components/Text'
import { getBallotFileName } from '../utils/election'
import NavigationScreen from '../components/NavigationScreen'

const BallotScreen = () => {
  const { precinctId, ballotStyleId } = useParams<BallotScreenProps>()
  const { election: e, electionHash } = useContext(AppContext)
  const election = e!
  const precinctName = getPrecinctById({ election, precinctId })?.name

  return (
    <NavigationScreen>
      <LinkButton small to={routerPaths.ballotsList}>
        back to Ballots
      </LinkButton>
      <h1>
        Ballot Style <strong>{ballotStyleId}</strong> for {precinctName}
      </h1>
      <p>
        Filename:{' '}
        <Monospace>
          {getBallotFileName({
            ballotStyleId,
            election,
            electionHash,
            precinctId,
          })}
        </Monospace>
      </p>
      <p>
        <Button onPress={window.print}>Print Ballot</Button>
      </p>
      <HandMarkedPaperBallot
        ballotStyleId={ballotStyleId}
        election={election}
        precinctId={precinctId}
      />
    </NavigationScreen>
  )
}

export default BallotScreen
