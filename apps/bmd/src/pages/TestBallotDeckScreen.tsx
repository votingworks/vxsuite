import React, { useState } from 'react'
import pluralize from 'pluralize'
import {
  VotesDict,
  CandidateContest,
  Election,
  ElectionDefinition,
} from '@votingworks/types'

import { EventTargetFunction, MachineConfig } from '../config/types'

import Button from '../components/Button'
import ButtonList from '../components/ButtonList'
import ElectionInfo from '../components/ElectionInfo'
import Main, { MainChild } from '../components/Main'
import PrintedBallot from '../components/PrintedBallot'
import Prose from '../components/Prose'
import Sidebar from '../components/Sidebar'
import Screen from '../components/Screen'
import Modal from '../components/Modal'
import Loading from '../components/Loading'
import { TEST_DECK_PRINTING_TIMEOUT_SECONDS } from '../config/globals'

interface Ballot {
  ballotId?: string
  precinctId: string
  ballotStyleId: string
  votes: VotesDict
}

interface GenerateTestDeckParams {
  election: Election
  precinctId?: string
}

const generateTestDeckBallots = ({
  election,
  precinctId,
}: GenerateTestDeckParams) => {
  const precincts: string[] = precinctId
    ? [precinctId]
    : election.precincts.map((p) => p.id)

  const ballots: Ballot[] = []

  precincts.forEach((pId) => {
    const precinct = election.precincts.find((p) => p.id === pId)!
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
        ...contests.map((c) => {
          return c.type === 'yesno'
            ? 2
            : c.type === 'candidate'
            ? (c as CandidateContest).candidates.length
            : c.type === 'ms-either-neither'
            ? 2
            : /* istanbul ignore next */
              0
        })
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
          } else if (contest.type === 'ms-either-neither') {
            votes[contest.eitherNeitherContestId] =
              ballotNum % 2 === 0 ? ['yes'] : ['no']
            votes[contest.pickOneContestId] =
              votes[contest.eitherNeitherContestId]
          }
        })
        ballots.push({
          ballotStyleId: ballotStyle.id,
          precinctId: pId,
          votes,
        })
      }
    })
  })

  return ballots
}

interface Precinct {
  name: string
  id: string
}

interface Props {
  appPrecinctId: string
  electionDefinition: ElectionDefinition
  hideTestDeck: () => void
  isLiveMode: boolean
  machineConfig: MachineConfig
}

const initialPrecinct: Precinct = { id: '', name: '' }

const TestBallotDeckScreen: React.FC<Props> = ({
  appPrecinctId,
  electionDefinition,
  hideTestDeck,
  isLiveMode,
  machineConfig,
}) => {
  const { election } = electionDefinition
  const [ballots, setBallots] = useState<Ballot[]>([])
  const [precinct, setPrecinct] = useState<Precinct>(initialPrecinct)
  const [showPrinterNotConnected, setShowPrinterNotConnected] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)

  const selectPrecinct: EventTargetFunction = (event) => {
    const { id = '', name = '' } = (event.target as HTMLElement).dataset
    setPrecinct({ name, id })
    const selectedBallots = generateTestDeckBallots({
      election,
      precinctId: id,
    })
    setBallots(selectedBallots)
  }

  const resetDeck = () => {
    setBallots([])
    setPrecinct(initialPrecinct)
  }

  const handlePrinting = async () => {
    if (window.kiosk) {
      const printers = await window.kiosk.getPrinterInfo()
      if (!printers.some((p) => p.connected)) {
        setShowPrinterNotConnected(true)
        return
      }
    }
    setIsPrinting(true)

    setTimeout(() => {
      setIsPrinting(false)
    }, (ballots.length + TEST_DECK_PRINTING_TIMEOUT_SECONDS) * 1000)

    if (window.kiosk) {
      await window.kiosk.print({ sides: 'one-sided' })
    } else {
      window.print()
    }
  }

  return (
    <React.Fragment>
      <Screen flexDirection="row-reverse" voterMode={false}>
        <Main padded>
          <MainChild maxWidth={false}>
            {ballots.length ? (
              <Prose className="no-print">
                <h1>Test Ballot Decks</h1>
                <p>
                  Deck containing{' '}
                  <strong>{pluralize('ballot', ballots.length, true)}</strong>{' '}
                  for {precinct.name}.
                </p>
                <p>
                  <Button big primary onPress={handlePrinting}>
                    Print {ballots.length} ballots
                  </Button>
                </p>
                <p>
                  <Button small onPress={resetDeck}>
                    Back to Precincts List
                  </Button>
                </p>
              </Prose>
            ) : (
              <React.Fragment>
                <Prose>
                  <h1>Test Ballot Decks</h1>
                  <p>Select desired precinct.</p>
                </Prose>
                <p>
                  <Button
                    data-id=""
                    data-name="All Precincts"
                    fullWidth
                    key="all-precincts"
                    onPress={selectPrecinct}
                  >
                    <strong>All Precincts</strong>
                  </Button>
                </p>
                <ButtonList data-testid="precincts">
                  {election.precincts.map((p) => (
                    <Button
                      data-id={p.id}
                      data-name={p.name}
                      fullWidth
                      key={p.id}
                      onPress={selectPrecinct}
                    >
                      {p.name}
                    </Button>
                  ))}
                </ButtonList>
              </React.Fragment>
            )}
          </MainChild>
        </Main>
        <Sidebar
          appName={machineConfig.appMode.name}
          centerContent
          title="Election Admin Actions"
          footer={
            election && (
              <ElectionInfo
                electionDefinition={electionDefinition}
                precinctId={appPrecinctId}
                horizontal
              />
            )
          }
        >
          <Button small onPress={hideTestDeck}>
            Back to Admin Dashboard
          </Button>
        </Sidebar>
      </Screen>
      {ballots.length &&
        ballots.map((ballot, i) => (
          <PrintedBallot
            // eslint-disable-next-line react/no-array-index-key
            key={`ballot-${i}`}
            ballotStyleId={ballot.ballotStyleId}
            electionDefinition={electionDefinition}
            isLiveMode={isLiveMode}
            precinctId={ballot.precinctId}
            votes={ballot.votes}
          />
        ))}
      {showPrinterNotConnected && (
        <Modal
          centerContent
          content={
            <Prose>
              <h2>The printer is not connected.</h2>
              <p>Please connect the printer and try again.</p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button onPress={() => setShowPrinterNotConnected(false)}>
                OK
              </Button>
            </React.Fragment>
          }
        />
      )}
      {isPrinting && (
        <Modal
          centerContent
          content={
            <Prose textCenter>
              <Loading as="p">Printing Ballots…</Loading>
            </Prose>
          }
        />
      )}
    </React.Fragment>
  )
}

export default TestBallotDeckScreen
