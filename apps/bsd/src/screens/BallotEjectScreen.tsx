import React, { useState, useEffect } from 'react'
import styled from 'styled-components'

import { AdjudicationReason } from '@votingworks/types'
import { fetchNextBallotSheetToReview } from '../api/hmpb'
import { BallotSheetInfo } from '../config/types'

import Main from '../components/Main'
import Prose from '../components/Prose'
import Button from '../components/Button'
import Text from '../components/Text'
import MainNav from '../components/MainNav'
import Screen from '../components/Screen'
import StatusFooter from '../components/StatusFooter'

const EjectReason = styled.div`
  font-size: 3em;
  font-weight: 900;
`

const MainChildColumns = styled.div`
  flex: 1;
  display: flex;
  margin-bottom: -1rem;
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
    max-height: 87vh;
  }
`

interface Props {
  continueScanning: (override?: boolean) => void
  isTestMode: boolean
}

type EjectState = undefined | 'removeBallot' | 'acceptBallot'

const doNothing = () => {
  console.log('disabled') // eslint-disable-line no-console
}

const BallotEjectScreen: React.FC<Props> = ({
  continueScanning,
  isTestMode,
}) => {
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
  let isInvalidTestModeSheet = false
  let isInvalidElectionHashSheet = false

  let actualElectionHash: string

  for (const { interpretation } of [sheetInfo.front, sheetInfo.back]) {
    if (interpretation.type === 'InvalidTestModePage') {
      isInvalidTestModeSheet = true
    } else if (interpretation.type === 'InvalidElectionHashPage') {
      isInvalidElectionHashSheet = true
      actualElectionHash = interpretation.actualElectionHash
    } else if (interpretation.type === 'InterpretedHmpbPage') {
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

  const allowBallotDuplication =
    !isInvalidTestModeSheet && !isInvalidElectionHashSheet

  return (
    <Screen>
      <MainNav>
        {!allowBallotDuplication ? (
          <Button primary onPress={() => continueScanning()}>
            Confirm Ballot Removed and Continue Scanning
          </Button>
        ) : ballotState === 'removeBallot' ? (
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
        <MainChildColumns>
          <Prose maxWidth={false}>
            <EjectReason>
              {isInvalidTestModeSheet
                ? isTestMode
                  ? 'Live Ballot'
                  : 'Test Ballot'
                : isUnreadableSheet
                ? 'Unreadable'
                : isOvervotedSheet
                ? 'Overvote'
                : isBlankSheet
                ? 'Blank Ballot'
                : isInvalidElectionHashSheet
                ? 'Wrong Election'
                : 'Unknown Reason'}
            </EjectReason>
            <p>
              This last scanned sheet <strong>was not tabulated</strong>.
            </p>
            {allowBallotDuplication ? (
              <React.Fragment>
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
              </React.Fragment>
            ) : isInvalidTestModeSheet ? (
              isTestMode ? (
                <p>Remove the LIVE ballot before continuing.</p>
              ) : (
                <p>Remove the TEST ballot before continuing.</p>
              )
            ) : (
              <React.Fragment>
                <p>
                  The scanned ballot does not match the election this scanner is
                  configured for. Remove the invalid ballot before continuing.
                </p>
                <Text small>
                  Ballot Election Hash: {actualElectionHash!.slice(0, 10)}
                </Text>
              </React.Fragment>
            )}
          </Prose>
          <RectoVerso>
            <div>
              <img src={sheetInfo.front.image.url} alt="front" />
            </div>
            <div>
              <img src={sheetInfo.back.image.url} alt="back" />
            </div>
          </RectoVerso>
        </MainChildColumns>
      </Main>
      <StatusFooter />
    </Screen>
  )
}
export default BallotEjectScreen
