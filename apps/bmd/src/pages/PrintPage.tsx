import React, { useCallback, useContext, useEffect, useRef } from 'react'
import Loading from '../components/Loading'
import Main, { MainChild } from '../components/Main'
import PrintedBallot from '../components/PrintedBallot'
import Prose from '../components/Prose'
import Screen from '../components/Screen'
import BallotContext from '../contexts/ballotContext'
import buildBallot from '../utils/buildBallot'
import isEmptyObject from '../utils/isEmptyObject'
import printBallotOrCurrentPage from '../utils/printBallotOrCurrentPage'

export const printerMessageTimeoutSeconds = 5

const PrintPage = () => {
  const {
    ballotStyleId,
    election,
    isLiveMode,
    markVoterCardPrinted,
    precinctId,
    printer,
    resetBallot,
    updateTally,
    votes,
  } = useContext(BallotContext)
  const printerTimer = useRef(0)

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
        resetBallot()
      }, printerMessageTimeoutSeconds * 1000)
    }
  }, [
    markVoterCardPrinted,
    printer,
    resetBallot,
    updateTally,
    ballotStyleId,
    election,
    isLiveMode,
    precinctId,
    votes,
  ])

  useEffect(() => {
    if (!isEmptyObject(votes)) {
      printBallot()
    }
  }, [votes, printBallot])

  useEffect(() => {
    return () => clearTimeout(printerTimer.current)
  }, [])

  return (
    <React.Fragment>
      <Screen>
        <Main>
          <MainChild centerVertical maxWidth={false}>
            <Prose textCenter id="audiofocus">
              <h1 aria-label="Printing Official Ballot.">
                <Loading>Printing Official Ballot</Loading>
              </h1>
            </Prose>
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
