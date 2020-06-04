import React, { useContext } from 'react'
import { useParams } from 'react-router-dom'
import { getPrecinctById } from '@votingworks/ballot-encoder'
import pluralize from 'pluralize'

import { BallotScreenProps } from '../config/types'
import AppContext from '../contexts/AppContext'

import Button from '../components/Button'
import HandMarkedPaperBallot from '../components/HandMarkedPaperBallot'
import { Monospace } from '../components/Text'
import { getBallotFileName } from '../utils/election'
import NavigationScreen from '../components/NavigationScreen'
import HorizontalRule from '../components/HorizontalRule'

const BallotScreen = () => {
  const { precinctId, ballotStyleId } = useParams<BallotScreenProps>()
  const { election: e, electionHash } = useContext(AppContext)
  const election = e!
  const precinctName = getPrecinctById({ election, precinctId })?.name
  const ballotStyle = getBallotStyle({ ballotStyleId, election })!

  return (
    <React.Fragment>
      <NavigationScreen>
        <h1>
          Ballot Style <strong>{ballotStyleId}</strong> for {precinctName}
        </h1>
        <p>
          <Button primary onPress={window.print}>Print Ballot</Button>
        </p>
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
        <HorizontalRule />
        <p>Ballot style {ballotStyle.id} has {pluralize('contest', election.contests.length, true)}:</p>
        {election.contests
          .filter(
            contest =>
              ballotStyle.districts.includes(contest.districtId) &&
              ballotStyle.partyId === contest.partyId
          )
          .map(contest => (
            <React.Fragment key={contest.id}>
              <h3>{contest.title}</h3>
              {contest.type === 'candidate' ? (
                <ul>
                  {contest.candidates.map(candidate => (
                    <li key={candidate.id}>{candidate.name}</li>
                  ))}
                </ul>
              ) : (
                  <ul>
                    <li>Yes</li>
                    <li>No</li>
                  </ul>
                )}
            </React.Fragment>
          ))}
        <HorizontalRule />
      </NavigationScreen>
      <div className="foobar">
        <HandMarkedPaperBallot
          ballotStyleId={ballotStyleId}
          election={election}
          precinctId={precinctId}
        />
      </div>
    </React.Fragment>
  )
}

export default BallotScreen
