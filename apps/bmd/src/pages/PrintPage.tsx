import React, {
  useState,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from 'react'
import styled from 'styled-components'
import Loading from '../components/Loading'
import Main, { MainChild } from '../components/Main'
import PrintedBallot from '../components/PrintedBallot'
import Prose from '../components/Prose'
import Screen from '../components/Screen'
import BallotContext from '../contexts/ballotContext'
import isEmptyObject from '../utils/isEmptyObject'

export const printerMessageTimeoutSeconds = 5

const Graphic = styled.img`
  margin: 0 auto -1rem;
  height: 40vw;
`

const PrintPage = () => {
  const {
    ballotStyleId,
    electionDefinition,
    isLiveMode,
    markVoterCardPrinted,
    precinctId,
    printer,
    resetBallot,
    updateTally,
    votes,
  } = useContext(BallotContext)
  const election = electionDefinition.election
  const printerTimer = useRef(0)

  const [isPrinted, setIsPrinted] = useState(false)

  const printBallot = useCallback(async () => {
    const isUsed = await markVoterCardPrinted()
    /* istanbul ignore else */
    if (isUsed) {
      await printer.print()
      updateTally()
      printerTimer.current = window.setTimeout(() => {
        setIsPrinted(true)
        window.setTimeout(resetBallot, printerMessageTimeoutSeconds * 1500) // 50% longer than the printer message
      }, printerMessageTimeoutSeconds * 1000)
    }
  }, [markVoterCardPrinted, printer, resetBallot, updateTally, setIsPrinted])

  useEffect(() => {
    if (!isEmptyObject(votes)) {
      // delay to make sure the content fully loads, specifically the seal.
      // yes, this should be done with a load event.
      window.setTimeout(printBallot, 1000)
    }
    return () => clearTimeout(printerTimer.current)
  }, [])

  const renderContent = () => {
    if (isPrinted) {
      return (
        <React.Fragment>
          <p>
            <Graphic
              src="/images/verify-and-cast.svg"
              alt="Verify and Cast Your Printed Ballot"
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
    } else {
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
      <PrintedBallot
        ballotStyleId={ballotStyleId}
        election={election!}
        isLiveMode={isLiveMode}
        precinctId={precinctId}
        votes={votes}
      />
    </React.Fragment>
  )
}

export default PrintPage
