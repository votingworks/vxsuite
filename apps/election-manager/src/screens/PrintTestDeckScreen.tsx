import React, { useState, useContext, useCallback, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Election, getPrecinctById, VotesDict } from '@votingworks/types'
import { sleep } from '@votingworks/utils'
import routerPaths from '../routerPaths'

import AppContext from '../contexts/AppContext'

import Button from '../components/Button'
import ButtonList from '../components/ButtonList'
import Prose from '../components/Prose'
import Modal from '../components/Modal'
import Loading from '../components/Loading'

import NavigationScreen from '../components/NavigationScreen'
import LinkButton from '../components/LinkButton'
import { PrecinctReportScreenProps } from '../config/types'

import HandMarkedPaperBallot from '../components/HandMarkedPaperBallot'

import { generateTestDeckBallots } from '../utils/election'

interface TestDeckBallotsParams {
  election: Election
  electionHash: string
  precinctId: string
  onAllRendered: (numBallots: number) => void
}

const TestDeckBallots = ({
  election,
  electionHash,
  precinctId,
  onAllRendered
}: TestDeckBallotsParams) => {
  const ballots = generateTestDeckBallots({ election, precinctId })

  let numRendered = 0
  const onRendered = async () => {
    numRendered += 1
    if (numRendered === ballots.length) {
      onAllRendered(ballots.length)
    }
  }

  return (
    <div className='print-only'>
      {ballots.map((ballot, i) => (
        <HandMarkedPaperBallot
          key={`ballot-${i}`} // eslint-disable-line react/no-array-index-key
          ballotStyleId={ballot.ballotStyleId as string}
          election={election}
          electionHash={electionHash}
          isLiveMode={false}
          isAbsentee={false}
          precinctId={ballot.precinctId as string}
          locales={{ primary: 'en-US' }}
          votes={ballot.votes as VotesDict}
          onRendered={async () => await onRendered()}
        />
      ))}
    </div>
  )
}

const TestDeckBallotsMemoized = React.memo(TestDeckBallots)

const PrintTestDeckScreen: React.FC = () => {
  const { electionDefinition, printer } = useContext(AppContext)
  const { election, electionHash } = electionDefinition!
  const [precinctIds, setPrecinctIds] = useState<string[]>([])
  const [precinctIndex, setPrecinctIndex] = useState<number>()

  const { precinctId: p = '' } = useParams<PrecinctReportScreenProps>()
  const precinctId = p.trim()

  const pageTitle = 'Test Deck'
  const precinctName =
    precinctId === 'all'
      ? 'All Precincts'
      : getPrecinctById({ election, precinctId })?.name

  useEffect(() => {
    if (precinctId) {
      const sortedPrecincts = [...election.precincts].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          ignorePunctuation: true
        })
      )
      const precinctIds =
        precinctId === 'all' ? sortedPrecincts.map((p) => p.id) : [precinctId]
      setPrecinctIds(precinctIds)
    } else {
      setPrecinctIds([])
      setPrecinctIndex(undefined)
    }
  }, [precinctId, election.precincts])

  const startPrint = async () => {
    if (window.kiosk != null) {
      const printers = await window.kiosk.getPrinterInfo()
      if (printers.some((p) => p.connected)) {
        setPrecinctIndex(0)
      } else {
        // eslint-disable-next-line no-alert
        window.alert('please connect the printer.')
      }
    } else {
      setPrecinctIndex(0)
    }
  }

  const onAllRendered = useCallback(
    async (pIndex, numBallots) => {
      await printer.print({ sides: 'two-sided-long-edge' })

      if (pIndex < precinctIds.length - 1) {
        // wait 5s per ballot printed
        // that's how long printing takes in duplex, no reason to get ahead of it.
        await sleep(numBallots * 5000)
        setPrecinctIndex(pIndex + 1)
      } else {
        await sleep(3000)
        setPrecinctIndex(undefined)
      }
    },
    [setPrecinctIndex, precinctIds]
  )

  const currentPrecinct =
    precinctIndex === undefined
      ? undefined
      : getPrecinctById({ election, precinctId: precinctIds[precinctIndex] })

  if (precinctIds.length > 0) {
    return (
      <>
        {precinctIndex !== undefined && currentPrecinct && (
          <Modal
            centerContent
            content={
              <Loading as='p'>
                Printing Test Deck
                {precinctIds.length > 1
                  ? ` (${precinctIndex + 1} of ${precinctIds.length})`
                  : ''}
                : {currentPrecinct.name}
              </Loading>
            }
          />
        )}
        <NavigationScreen>
          <Prose>
            <h1>{pageTitle}</h1>
            <p>
              <strong>Election:</strong> {election.title}
              <br />
              <strong>Precinct:</strong> {precinctName}
            </p>
            <p>
              <Button onPress={startPrint} primary>
                Print Test Deck
              </Button>
            </p>
            <p>
              <LinkButton small to={routerPaths.printTestDecks}>
                Back to Test Deck list
              </LinkButton>
            </p>
          </Prose>
        </NavigationScreen>
        {precinctIndex !== undefined && (
          <TestDeckBallotsMemoized
            election={election}
            electionHash={electionHash}
            precinctId={precinctIds[precinctIndex]}
            onAllRendered={async (numBallots) =>
              await onAllRendered(precinctIndex, numBallots)}
          />
        )}
      </>
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
        {[...election.precincts]
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, {
              ignorePunctuation: true
            })
          )
          .map((p) => (
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
