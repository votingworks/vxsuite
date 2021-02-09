import React, { useCallback, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { VotesDict, ElectionDefinition } from '@votingworks/types'

import Loading from '../components/Loading'
import Main, { MainChild } from '../components/Main'
import PrintedBallot from '../components/PrintedBallot'
import Prose from '../components/Prose'
import Screen from '../components/Screen'
import { MarkVoterCardFunction } from '../config/types'
import { Printer } from '../utils/printer'
import Text from '../components/Text'

const Graphic = styled.img`
  margin: 0 auto -1rem;
  height: 40vw;
`

const TopLeftContent = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  margin: 0.5rem 0.75rem;
`
const TopRightContent = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  margin: 0.5rem 0.75rem;
`

interface Props {
  ballotStyleId: string
  ballotsPrintedCount: number
  electionDefinition: ElectionDefinition
  isLiveMode: boolean
  isVoterCardPresent: boolean
  markVoterCardPrinted: MarkVoterCardFunction
  precinctId: string
  printer: Printer
  useEffectToggleLargeDisplay: () => void
  showNoChargerAttachedWarning: boolean
  updateTally: () => void
  votes?: VotesDict
}

export const printingMessageTimeoutSeconds = 5

const PrintOnlyScreen: React.FC<Props> = ({
  ballotStyleId,
  ballotsPrintedCount,
  electionDefinition,
  isLiveMode,
  isVoterCardPresent,
  markVoterCardPrinted,
  precinctId,
  printer,
  useEffectToggleLargeDisplay,
  showNoChargerAttachedWarning,
  updateTally,
  votes,
}) => {
  const printerTimer = useRef(0)
  const [okToPrint, setOkToPrint] = useState(true)
  const [isPrinted, updateIsPrinted] = useState(false)
  const isCardVotesEmpty = votes === undefined
  const { election } = electionDefinition

  const isReadyToPrint =
    election &&
    ballotStyleId &&
    precinctId &&
    isVoterCardPresent &&
    !isCardVotesEmpty &&
    !isPrinted

  // Handle Font Size when voter card is present.
  useEffect(useEffectToggleLargeDisplay, [isVoterCardPresent])

  const printBallot = useCallback(async () => {
    const isUsed = await markVoterCardPrinted()
    /* istanbul ignore else */
    if (isUsed) {
      await printer.print()
      updateTally()
      printerTimer.current = window.setTimeout(() => {
        updateIsPrinted(true)
      }, printingMessageTimeoutSeconds * 1000)
    }
  }, [markVoterCardPrinted, printer, updateTally])

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
    return () => {
      clearTimeout(printerTimer.current)
    }
  }, [])

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
        <p>
          Insert Card to print your official ballot.
          {showNoChargerAttachedWarning && (
            <React.Fragment>
              <br />
              <Text as="span" warning small>
                <strong>No Power Detected.</strong> Please ask a poll worker to
                plug in the power cord for this machine.
              </Text>
            </React.Fragment>
          )}
        </p>
      </React.Fragment>
    )
  }

  return (
    <React.Fragment>
      <Screen white>
        <Main>
          <MainChild centerVertical maxWidth={false}>
            <Prose textCenter>{renderContent()}</Prose>
            {!isVoterCardPresent && (
              <React.Fragment>
                {!isLiveMode && (
                  <TopRightContent>
                    <Text as="span" warning warningIcon bold>
                      Testing Mode
                    </Text>
                  </TopRightContent>
                )}
                <TopLeftContent>
                  <small>
                    Ballots Printed: <strong>{ballotsPrintedCount}</strong>
                  </small>
                </TopLeftContent>
              </React.Fragment>
            )}
          </MainChild>
        </Main>
      </Screen>
      {isReadyToPrint && (
        <PrintedBallot
          ballotStyleId={ballotStyleId}
          election={election}
          isLiveMode={isLiveMode}
          precinctId={precinctId}
          votes={votes!} // votes exists because isReadyToPrint implies votes!=undefined , but tsc unable to reason about it
        />
      )}
    </React.Fragment>
  )
}

export default PrintOnlyScreen
