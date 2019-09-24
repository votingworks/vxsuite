import React, { useCallback, useEffect, useRef, useState } from 'react'

import styled from 'styled-components'
import { Election, MarkVoterCardFunction, VotesDict } from '../config/types'
import { NullPrinter } from '../utils/printer'
import isEmptyObject from '../utils/isEmptyObject'

import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import PrintedBallot from '../components/PrintedBallot'
import Loading from '../components/Loading'
import Screen from '../components/Screen'

const GraphicNeeded = styled.div`
  margin: 2rem auto;
  border: 6px solid #ff0000;
  width: 30%;
  padding: 2rem 1rem;
  color: #ff0000;
  font-weight: 900;
`

interface Props {
  ballotStyleId: string
  election: Election
  isLiveMode: boolean
  isVoterCardPresent: boolean
  markVoterCardPrinted: MarkVoterCardFunction
  precinctId: string
  printer: NullPrinter
  votes: VotesDict
}

export const printerMessageTimeoutSeconds = 5
const lastVotesKey = 'lastVotes'

const PrintAppScreen = ({
  ballotStyleId,
  election,
  isLiveMode,
  isVoterCardPresent,
  markVoterCardPrinted,
  precinctId,
  printer,
  votes: cardVotes,
}: Props) => {
  let printerTimer = useRef(0)
  const localVotes = JSON.parse(
    window.localStorage.getItem(lastVotesKey) || '{}'
  )
  const isLocalVotes = !isEmptyObject(localVotes)
  const [isPrinted, updateIsPrinted] = useState(false)
  const isCardVotesEmpty = isEmptyObject(cardVotes)

  const printBallot = useCallback(async () => {
    const isUsed = await markVoterCardPrinted()
    /* istanbul ignore else */
    if (isUsed) {
      await printer.print()
      printerTimer.current = window.setTimeout(() => {
        updateIsPrinted(true)
      }, printerMessageTimeoutSeconds * 1000)
    }
  }, [markVoterCardPrinted, printer])

  useEffect(() => {
    if (!isEmptyObject(cardVotes)) {
      window.localStorage.setItem(lastVotesKey, JSON.stringify(cardVotes))
      printBallot()
    }
  }, [cardVotes, printBallot])

  useEffect(() => {
    if (!isVoterCardPresent) {
      updateIsPrinted(false)
    }
  }, [isVoterCardPresent])

  useEffect(() => {
    return () => clearTimeout(printerTimer.current)
  }, [])

  const isReadyToPrint =
    election &&
    ballotStyleId &&
    precinctId &&
    isLocalVotes &&
    isVoterCardPresent &&
    !isCardVotesEmpty &&
    !isPrinted

  const renderContent = () => {
    if (isVoterCardPresent && isCardVotesEmpty) {
      return (
        <React.Fragment>
          <h1>Empty Card</h1>
          <p>This card does not contain any votes.</p>
        </React.Fragment>
      )
    }
    if (isPrinted) {
      return (
        <React.Fragment>
          <GraphicNeeded>
            “Verify and Cast Printed Ballot” graphic here
          </GraphicNeeded>
          <h1>Verify and Cast Printed Ballot</h1>
          <p>Verify that your votes on printed ballot are correct.</p>
          <p>Cast your official ballot in the ballot box.</p>
        </React.Fragment>
      )
    }
    if (isReadyToPrint) {
      return (
        <React.Fragment>
          <GraphicNeeded>“Printing Ballot” graphic here</GraphicNeeded>
          <h1>
            <Loading>Printing your official ballot</Loading>
          </h1>
        </React.Fragment>
      )
    }
    return (
      <React.Fragment>
        <GraphicNeeded>“Insert Card” graphic here</GraphicNeeded>
        <h1>Insert Card</h1>
        <p>Insert Card to print your official ballot.</p>
      </React.Fragment>
    )
  }

  return (
    <React.Fragment>
      <Screen>
        <Main>
          <MainChild centerVertical maxWidth={false}>
            <Prose textCenter>{renderContent()}</Prose>
          </MainChild>
        </Main>
      </Screen>
      {isReadyToPrint && (
        <PrintedBallot
          ballotStyleId={ballotStyleId}
          election={election}
          isLiveMode={isLiveMode}
          precinctId={precinctId}
          votes={localVotes}
        />
      )}
    </React.Fragment>
  )
}

export default PrintAppScreen
