import { ok } from 'assert'
import React, { useCallback, useContext, useEffect, useRef } from 'react'
import styled from 'styled-components'

import { ProgressEllipsis, Main, MainChild } from '@votingworks/ui'

import PrintedBallot from '../components/PrintedBallot'
import Prose from '../components/Prose'
import Screen from '../components/Screen'
import { BALLOT_PRINTING_TIMEOUT_SECONDS } from '../config/globals'
import BallotContext from '../contexts/ballotContext'

export const printingMessageTimeoutSeconds = 5

const Graphic = styled.img`
  margin: 0 auto -1rem;
  height: 40vw;
`

const PrintPage: React.FC = () => {
  const {
    ballotStyleId,
    electionDefinition,
    isCardlessVoter,
    isLiveMode,
    markVoterCardPrinted,
    precinctId,
    printer,
    resetBallot,
    updateTally,
    votes,
  } = useContext(BallotContext)
  ok(electionDefinition, 'electionDefinition is required to render PrintPage')
  ok(ballotStyleId, 'ballotStyleId is required to render PrintPage')
  ok(precinctId, 'precinctId is required to render PrintPage')
  const printerTimer = useRef(0)

  const printBallot = useCallback(async () => {
    const isUsed = await markVoterCardPrinted()
    /* istanbul ignore else */
    if (isUsed) {
      await printer.print({ sides: 'one-sided' })
      updateTally()
      printerTimer.current = window.setTimeout(() => {
        resetBallot(isCardlessVoter ? 'cardless' : 'card')
      }, BALLOT_PRINTING_TIMEOUT_SECONDS * 1000)
    }
  }, [isCardlessVoter, markVoterCardPrinted, printer, resetBallot, updateTally])

  useEffect(() => {
    const printedBallotSealImage = document
      .getElementById('printedBallotSealContainer')
      ?.getElementsByTagName('img')[0] // for proper type: HTMLImageElement
    if (!printedBallotSealImage || printedBallotSealImage.complete) {
      printBallot()
    } else {
      printedBallotSealImage.addEventListener('load', () => {
        printBallot()
      })
    }
    return () => {
      clearTimeout(printerTimer.current)
    }
  }, [printBallot, votes])

  return (
    <React.Fragment>
      <Screen white>
        <Main>
          <MainChild centerVertical maxWidth={false}>
            <Prose textCenter id="audiofocus">
              <p>
                <Graphic
                  src="/images/printing-ballot.svg"
                  alt="Printing Ballot"
                  aria-hidden
                />
              </p>
              <h1>
                <ProgressEllipsis aria-label="Printing your official ballot.">
                  Printing Official Ballot
                </ProgressEllipsis>
              </h1>
            </Prose>
          </MainChild>
        </Main>
      </Screen>
      <PrintedBallot
        ballotStyleId={ballotStyleId}
        electionDefinition={electionDefinition}
        isLiveMode={isLiveMode}
        precinctId={precinctId}
        votes={votes}
      />
    </React.Fragment>
  )
}

export default PrintPage
