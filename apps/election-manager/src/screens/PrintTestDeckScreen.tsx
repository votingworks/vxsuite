import React, { useContext } from 'react'
import { useParams } from 'react-router-dom'
import {
  CandidateContest,
  Election,
  getPrecinctById,
  Precinct,
  VotesDict,
} from '@votingworks/ballot-encoder'
import routerPaths from '../routerPaths'

import AppContext from '../contexts/AppContext'

import PrintButton from '../components/PrintButton'
import ButtonList from '../components/ButtonList'
import Prose from '../components/Prose'

import NavigationScreen from '../components/NavigationScreen'
import LinkButton from '../components/LinkButton'
import { Dictionary, PrecinctReportScreenProps } from '../config/types'

import HandMarkedPaperBallot from '../components/HandMarkedPaperBallot'

interface GenerateTestDeckParams {
  election: Election
  precinctId?: string
}

const allPrecincts: Precinct = {
  id: '',
  name: 'All Precincts',
}

const PrintTestDeckScreen = () => {
  const { election: e } = useContext(AppContext)
  const election = e!
  const { precinctId: p = '' } = useParams<PrecinctReportScreenProps>()
  const precinctId = p.trim()

  const precinct =
    precinctId === 'all'
      ? allPrecincts
      : getPrecinctById({ election, precinctId })

  const pageTitle = 'Print Test Deck'

  if (precinct?.name) {
    // generate the possibilities
    const precinctIds: string[] = precinct.id
      ? [precinctId]
      : election.precincts.map((p) => p.id)
    const ballots: Dictionary<string | VotesDict>[] = []

    precinctIds.forEach((precinctId) => {
      const precinct = election.precincts.find((p) => p.id === precinctId)!
      const precinctBallotStyles = election.ballotStyles.filter((bs) =>
        bs.precincts.includes(precinct.id)
      )

      precinctBallotStyles.forEach((ballotStyle) => {
        const contests = election.contests.filter(
          (c) =>
            ballotStyle.districts.includes(c.districtId) &&
            ballotStyle.partyId === c.partyId
        )

        const numBallots = Math.max(
          ...contests.map((c) =>
            c.type === 'yesno' ? 2 : (c as CandidateContest).candidates.length
          )
        )

        for (let ballotNum = 0; ballotNum < numBallots; ballotNum++) {
          const votes: VotesDict = {}
          contests.forEach((contest) => {
            /* istanbul ignore else */
            if (contest.type === 'yesno') {
              votes[contest.id] = ballotNum % 2 === 0 ? ['yes'] : ['no']
            } else if (
              contest.type === 'candidate' &&
              contest.candidates.length > 0 // safety check
            ) {
              votes[contest.id] = [
                contest.candidates[ballotNum % contest.candidates.length],
              ]
            }
          })
          ballots.push({
            ballotStyleId: ballotStyle.id,
            precinctId,
            votes,
          })
        }
      })
    })

    return (
      <React.Fragment>
        <NavigationScreen>
          <Prose>
            <h1>{pageTitle}</h1>
            <p>
              <strong>Election:</strong> {election.title}
              <br />
              <strong>Precinct:</strong> {precinct.name}
            </p>
            <p>
              <PrintButton primary>Print Test Deck</PrintButton>
            </p>
            <p>
              <LinkButton small to={routerPaths.printTestDecks}>
                back to Test Deck list
              </LinkButton>
            </p>
          </Prose>
        </NavigationScreen>
        <div className="print-only">
          {ballots.map((ballot, i) => (
            <HandMarkedPaperBallot
              key={`ballot-${i}`} // eslint-disable-line react/no-array-index-key
              ballotStyleId={ballot.ballotStyleId as string}
              election={election}
              isLiveMode
              precinctId={ballot.precinctId as string}
              locales={{ primary: 'en-US' }}
              votes={ballot.votes as VotesDict}
            />
          ))}
        </div>
      </React.Fragment>
    )
  }

  return (
    <NavigationScreen>
      <Prose>
        <h1>{pageTitle}</h1>
        <p>
          Select desired precinct for <strong>{election.title}</strong>.
        </p>
      </Prose>
      <p>
        <LinkButton
          to={routerPaths.printOneTestDeck({ precinctId: 'all' })}
          fullWidth
        >
          <strong>All Precincts</strong>
        </LinkButton>
      </p>
      <ButtonList>
        {election.precincts.map((p) => (
          <LinkButton
            key={p.id}
            to={routerPaths.printOneTestDeck({ precinctId: p.id })}
            fullWidth
          >
            {p.name}
          </LinkButton>
        ))}
      </ButtonList>
    </NavigationScreen>
  )
}

export default PrintTestDeckScreen
