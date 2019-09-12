import React, { useCallback, useEffect, useRef, useState } from 'react'

import { Election, MarkVoterCardUsedFunction, VotesDict } from '../config/types'
import { NullPrinter } from '../utils/printer'

import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import PrintedBallot from '../components/PrintedBallot'
import Loading from '../components/Loading'

interface Props {
  ballotStyleId: string
  election: Election
  isLiveMode: boolean
  isVoterCardPresent: boolean
  markVoterCardUsed: MarkVoterCardUsedFunction
  precinctId: string
  printer: NullPrinter
  votes: VotesDict
}

const printerTimerTimeoutSeconds = 5
const lastVotesKey = 'lastVotes'

const PrintAppScreen = ({
  ballotStyleId,
  election,
  isLiveMode,
  isVoterCardPresent,
  markVoterCardUsed,
  precinctId,
  printer,
  votes: cardVotes,
}: Props) => {
  let printerTimer = useRef(0)
  const localVotes = JSON.parse(
    window.localStorage.getItem(lastVotesKey) || '{}'
  )
  const [votes, setVotes] = useState(localVotes)
  const [isPrinted, updateIsPrinted] = useState(false)

  const printBallot = useCallback(async () => {
    const isUsed = await markVoterCardUsed({
      pauseProcessingUntilNoCardPresent: true,
    })
    /* istanbul ignore else */
    if (isUsed) {
      await printer.print()
      printerTimer.current = window.setTimeout(() => {
        updateIsPrinted(true) // add timeout here
      }, printerTimerTimeoutSeconds * 1000)
    }
  }, [markVoterCardUsed, printer])

  useEffect(() => {
    if (Object.entries(cardVotes).length !== 0) {
      window.localStorage.setItem(lastVotesKey, JSON.stringify(cardVotes))
      setVotes(cardVotes)
      printBallot()
    }
  }, [cardVotes, printBallot])

  useEffect(() => {
    return () => clearTimeout(printerTimer.current)
  }, [])

  const isReadyToPrint =
    isVoterCardPresent && election && ballotStyleId && precinctId && votes

  return (
    <React.Fragment>
      <Main>
        <MainChild center>
          <Prose textCenter>
            {isReadyToPrint ? (
              isPrinted ? (
                <React.Fragment>
                  <h1>Official Ballot Printed</h1>
                  <p>Review that your official ballot is correct.</p>
                  <p>Cast your ballot in the ballot box.</p>
                </React.Fragment>
              ) : (
                <h1>
                  <Loading>Printing ballot</Loading>
                </h1>
              )
            ) : (
              <h1>Insert Card</h1>
            )}
          </Prose>
        </MainChild>
      </Main>
      {isReadyToPrint && (
        <PrintedBallot
          ballotId={undefined} // TODO: add ballotId here: https://github.com/votingworks/bmd/issues/424
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

export default PrintAppScreen
