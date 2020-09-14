import React, { useState, useEffect } from 'react'
import styled from 'styled-components'

import { AdjudicationReason } from '@votingworks/ballot-encoder'
import { fetchNextBallotSheetToReview } from '../api/hmpb'
import { BallotSheetInfo } from '../config/types'

import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Button from '../components/Button'
import MainNav from '../components/MainNav'
import Screen from '../components/Screen'

const Columns = styled.div`
  display: flex;
  > div {
    margin-right: 1em;
    &:first-child {
      flex: 1;
    }
    &:last-child {
      margin-right: 0;
    }
  }
  button {
    margin-top: 0.3rem;
  }
`

const RectoVerso = styled.div`
  display: flex;
  & > * {
    &:first-child {
      margin-right: 1em;
    }
  }
  img {
    max-width: 100%;
    height: 84.5vh;
  }
`

interface Props {
  continueScanning: (override?: boolean) => void
}

type EjectState = undefined | 'removeBallot' | 'acceptBallot'

const doNothing = () => {
  console.log('disabled') // eslint-disable-line no-console
}

const BallotEjectScreen = ({ continueScanning }: Props) => {
  const [sheetInfo, setSheetInfo] = useState<BallotSheetInfo | undefined>()

  const [ballotState, setBallotState] = useState<EjectState>(undefined)

  useEffect(() => {
    ;(async () => {
      setSheetInfo(await fetchNextBallotSheetToReview())
    })()
  }, [setSheetInfo])

  if (!sheetInfo) {
    return null
  }

  let isOvervotedSheet = false
  let isBlankSheet = false
  let isUnreadableSheet = false

  for (const { interpretation } of [sheetInfo.front, sheetInfo.back]) {
    if (interpretation.type === 'InterpretedHmpbPage') {
      if (interpretation.adjudicationInfo.requiresAdjudication) {
        for (const { type } of interpretation.adjudicationInfo.allReasonInfos) {
          if (interpretation.adjudicationInfo.enabledReasons.includes(type)) {
            if (type === AdjudicationReason.Overvote) {
              isOvervotedSheet = true
            } else if (type === AdjudicationReason.BlankBallot) {
              isBlankSheet = true
            }
          }
        }
      }
    } else {
      isUnreadableSheet = true
    }
  }

  return (
    <Screen>
      <MainNav>
        {ballotState === 'removeBallot' ? (
          <Button primary onPress={() => continueScanning()}>
            Confirm Ballot Removed and Continue Scanning
          </Button>
        ) : ballotState === 'acceptBallot' ? (
          <Button primary onPress={() => continueScanning(true)}>
            Tabulate Ballot and Continue Scanning
          </Button>
        ) : (
          <Button disabled onPress={doNothing}>
            Continue Scanning
          </Button>
        )}
      </MainNav>
      <Main>
        <MainChild maxWidth={false}>
          <Columns>
            <Prose maxWidth={false}>
              <h1>Review Required</h1>
              <p>
                This last scanned sheet requires human review and{' '}
                <strong>was not tabulated</strong>.
              </p>
              <h4>Reason</h4>
              <p>
                {isUnreadableSheet ? (
                  <span>
                    This sheet was <strong>unreadable</strong> by the scanner.
                  </span>
                ) : isOvervotedSheet ? (
                  <span>
                    This ballot sheet contains an <strong>overvote</strong>.
                  </span>
                ) : isBlankSheet ? (
                  <span>
                    This ballot sheet is <strong>blank</strong> and has no
                    votes.
                  </span>
                ) : (
                  <span>Reason could not be determined.</span>
                )}
              </p>
              <h4>Original Ballot Scan</h4>
              <p>
                Remove ballot and create a duplicate ballot for the Resolution
                Board to review.
                <br />
                <Button
                  primary={ballotState === 'removeBallot'}
                  onPress={() => setBallotState('removeBallot')}
                >
                  Original Ballot Removed
                </Button>
              </p>
              <h4>Duplicate Ballot Scan</h4>
              <p>
                {isUnreadableSheet ? (
                  <React.Fragment>
                    Confirm sheet was reviewed by the Resolution Board and
                    tabulate as <strong>unreadable</strong>.
                  </React.Fragment>
                ) : isOvervotedSheet ? (
                  <React.Fragment>
                    Confirm ballot sheet was reviewed by the Resolution Board
                    and tabulate as ballot sheet with an{' '}
                    <strong>overvote</strong>.
                  </React.Fragment>
                ) : isBlankSheet ? (
                  <React.Fragment>
                    Confirm ballot sheet was reviewed by the Resolution Board
                    and tabulate as a <strong>blank</strong> ballot sheet and
                    has no votes.
                  </React.Fragment>
                ) : (
                  <React.Fragment>
                    Confirm ballot sheet was reviewed by the Resolution Board
                    and tabulate as ballow with issue which could not be
                    determined.
                  </React.Fragment>
                )}
                <br />
                <Button
                  primary={ballotState === 'acceptBallot'}
                  onPress={() => setBallotState('acceptBallot')}
                >
                  Tabulate Duplicate Ballot
                </Button>
              </p>
            </Prose>
            <RectoVerso>
              <div>
                <img src={sheetInfo.front.image.url} alt="front" />
              </div>
              <div>
                <img src={sheetInfo.back.image.url} alt="back" />
              </div>
            </RectoVerso>
          </Columns>
        </MainChild>
      </Main>
    </Screen>
  )
}
export default BallotEjectScreen
