import React, { useState, useContext, useCallback, useEffect } from 'react'
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

type OnAllRenderedFunctionType = () => void

interface TestDeckBallotsParams {
  election: Election
  precinct: Precinct
  onAllRendered: OnAllRenderedFunctionType
}

const TestDeckBallots = ({
  election,
  precinct,
  onAllRendered,
}: TestDeckBallotsParams) => {
  console.log('rendering testdeck')

  // generate the possibilities
  const precinctIds: string[] = precinct.id
    ? [precinct.id]
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

  let numRendered = 0
  const onRendered = () => {
    numRendered += 1
    if (numRendered === ballots.length) {
      onAllRendered()
    }
  }

  return (
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
          onRendered={() => onRendered()}
        />
      ))}
    </div>
  )
}

const TestDeckBallotsMemoized = React.memo(TestDeckBallots)

const PrintTestDeckScreen = () => {
  const { election: e } = useContext(AppContext)
  const election = e!
  const { precinctId: p = '' } = useParams<PrecinctReportScreenProps>()
  const precinctId = p.trim()

  const [printEnabled, setPrintEnabled] = useState(false)

  const pageTitle = 'Print Test Deck'
  const precinct =
    precinctId === 'all'
      ? allPrecincts
      : getPrecinctById({ election, precinctId })

  useEffect(() => {
    setPrintEnabled(false)
  }, [precinctId])

  const onAllRendered = useCallback(() => {
    setPrintEnabled(true)
  }, [])

  if (precinct) {
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
              {printEnabled ? (
                <PrintButton primary>Print Test Deck</PrintButton>
              ) : (
                <PrintButton primary disabled>
                  Generating Test Deck...
                </PrintButton>
              )}
            </p>
            <p>
              <LinkButton small to={routerPaths.printTestDecks}>
                back to Test Deck list
              </LinkButton>
            </p>
          </Prose>
        </NavigationScreen>
        <TestDeckBallotsMemoized
          election={election}
          precinct={precinct}
          onAllRendered={onAllRendered}
        />
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
