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

const Graphic = styled.img`
  margin: 0 auto -1rem;
  height: 300px;
`

interface Props {
  ballotStyleId: string
  election: Election
  isLiveMode: boolean
  isVoterCardPresent: boolean
  markVoterCardPrinted: MarkVoterCardFunction
  precinctId: string
  printer: NullPrinter
  updateTally: () => void
  votes: VotesDict
}

export const printerMessageTimeoutSeconds = 5

const PrintOnlyScreen = ({
  ballotStyleId,
  election,
  isLiveMode,
  isVoterCardPresent,
  markVoterCardPrinted,
  precinctId,
  printer,
  updateTally,
  votes: cardVotes,
}: Props) => {
  let printerTimer = useRef(0)
  const [isPrinted, updateIsPrinted] = useState(false)
  const isCardVotesEmpty = isEmptyObject(cardVotes)

  const printBallot = useCallback(async () => {
    const isUsed = await markVoterCardPrinted()
    /* istanbul ignore else */
    if (isUsed) {
      await printer.print()
      updateTally()
      printerTimer.current = window.setTimeout(() => {
        updateIsPrinted(true)
      }, printerMessageTimeoutSeconds * 1000)
    }
  }, [markVoterCardPrinted, printer, updateTally])

  useEffect(() => {
    if (!isEmptyObject(cardVotes)) {
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
          <p>
            <Graphic
              src="/images/verify-and-cast.svg"
              alt="Printing Ballot"
              aria-hidden
            />
          </p>
          <h1>Verify and Cast Your Printed Ballot</h1>
          <p>Verify your votes on printed ballot are correct.</p>
          <p>Cast your official ballot in the ballot box.</p>
        </React.Fragment>
      )
    }
    if (isReadyToPrint) {
      return (
        <React.Fragment>
          <p>
            <Graphic
              src="/images/printing-ballot.svg"
              alt="Printing Ballot"
              aria-hidden
            />
          </p>
          <h1>
            <Loading>Printing your official ballot</Loading>
          </h1>
        </React.Fragment>
      )
    }
    return (
      <React.Fragment>
        <p>
          <Graphic
            src="/images/insert-card.svg"
            alt="Insert Card"
            aria-hidden
          />
        </p>
        <h1>Insert Card</h1>
        <p>Insert Card to print your official ballot.</p>
      </React.Fragment>
    )
  }

  return (
    <React.Fragment>
      <Screen white>
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
          votes={cardVotes}
        />
      )}
    </React.Fragment>
  )
}

export default PrintOnlyScreen
