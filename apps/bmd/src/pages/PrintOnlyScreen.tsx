import React, { useCallback, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import Loading from '../components/Loading'
import Main, { MainChild } from '../components/Main'
import PrintedBallot from '../components/PrintedBallot'
import Prose from '../components/Prose'
import Screen from '../components/Screen'
import { DEFAULT_FONT_SIZE, LARGE_DISPLAY_FONT_SIZE } from '../config/globals'
import {
  Election,
  MarkVoterCardFunction,
  PartialUserSettings,
  VotesDict,
} from '../config/types'
import buildBallot from '../utils/buildBallot'
import isEmptyObject from '../utils/isEmptyObject'
import printBallotOrCurrentPage from '../utils/printBallotOrCurrentPage'
import { Printer } from '../utils/printer'

const Graphic = styled.img`
  margin: 0 auto -1rem;
  height: 40vw;
`

interface Props {
  ballotStyleId: string
  election: Election
  isLiveMode: boolean
  isVoterCardPresent: boolean
  markVoterCardPrinted: MarkVoterCardFunction
  precinctId: string
  printer: Printer
  setUserSettings: (partial: PartialUserSettings) => void
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
  setUserSettings,
  updateTally,
  votes,
}: Props) => {
  let printerTimer = useRef(0)
  const [okToPrint, setOkToPrint] = useState(true)
  const [isPrinted, updateIsPrinted] = useState(false)
  const isCardVotesEmpty = isEmptyObject(votes)

  const isReadyToPrint =
    election &&
    ballotStyleId &&
    precinctId &&
    isVoterCardPresent &&
    !isCardVotesEmpty &&
    !isPrinted

  const printBallot = useCallback(async () => {
    const isUsed = await markVoterCardPrinted()
    /* istanbul ignore else */
    if (isUsed) {
      await printBallotOrCurrentPage(
        printer,
        buildBallot({
          ballotStyleId,
          election,
          isTestBallot: !isLiveMode,
          precinctId,
          votes,
        })
      )
      updateTally()
      printerTimer.current = window.setTimeout(() => {
        updateIsPrinted(true)
      }, printerMessageTimeoutSeconds * 1000)
    }
  }, [
    markVoterCardPrinted,
    printer,
    updateTally,
    ballotStyleId,
    votes,
    election,
    isLiveMode,
    precinctId,
  ])

  useEffect(() => {
    if (isReadyToPrint && okToPrint) {
      setOkToPrint(false)

      printBallot()
    }
  }, [votes, printBallot, isReadyToPrint, okToPrint, setOkToPrint])

  useEffect(() => {
    if (!isVoterCardPresent) {
      updateIsPrinted(false)

      // once card is taken out, ok to print again
      if (!okToPrint) {
        setOkToPrint(true)
      }
    }
  }, [isVoterCardPresent, okToPrint, setOkToPrint])

  useEffect(() => {
    setUserSettings({ textSize: LARGE_DISPLAY_FONT_SIZE })
    return () => {
      setUserSettings({ textSize: DEFAULT_FONT_SIZE })
      clearTimeout(printerTimer.current)
    }
  }, [setUserSettings])

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
          <p>
            Verify your votes on printed ballot are correct. <br />
            Cast your official ballot in the ballot box.
          </p>
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
          votes={votes}
        />
      )}
    </React.Fragment>
  )
}

export default PrintOnlyScreen
