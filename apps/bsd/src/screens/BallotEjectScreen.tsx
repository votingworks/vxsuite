import {
  AdjudicationReason,
  Contest,
  MarkAdjudications,
} from '@votingworks/types'
import {
  GetNextReviewSheetResponse,
  ScanContinueRequest,
  Side,
} from '@votingworks/types/api/module-scan'
import { strict as assert } from 'assert'
import React, { useCallback, useEffect, useState } from 'react'
import styled from 'styled-components'
import { fetchNextBallotSheetToReview } from '../api/hmpb'
import BallotSheetImage from '../components/BallotSheetImage'
import Button from '../components/Button'
import Main from '../components/Main'
import MainNav from '../components/MainNav'
import Prose from '../components/Prose'
import Screen from '../components/Screen'
import StatusFooter from '../components/StatusFooter'
import Text from '../components/Text'
import WriteInAdjudicationScreen from './WriteInAdjudicationScreen'

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

const HIGHLIGHTER_COLOR = '#fbff0066'

interface Props {
  continueScanning: (request: ScanContinueRequest) => Promise<void>
  isTestMode: boolean
}

type EjectState = 'removeBallot' | 'acceptBallot'

const doNothing = () => {
  console.log('disabled') // eslint-disable-line no-console
}

const BallotEjectScreen = ({
  continueScanning,
  isTestMode,
}: Props): JSX.Element => {
  const [reviewInfo, setReviewInfo] = useState<GetNextReviewSheetResponse>()
  const [ballotState, setBallotState] = useState<EjectState>()

  useEffect(() => {
    void (async () => {
      setReviewInfo(await fetchNextBallotSheetToReview())
    })()
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const contestIdsWithIssues = new Set<Contest['id']>()

  const styleForContest = useCallback(
    (contestId: Contest['id']): React.CSSProperties =>
      contestIdsWithIssues.has(contestId)
        ? { backgroundColor: HIGHLIGHTER_COLOR }
        : {},
    [contestIdsWithIssues]
  )

  const [
    frontMarkAdjudications,
    setFrontMarkAdjudications,
  ] = useState<MarkAdjudications>()
  const [
    backMarkAdjudications,
    setBackMarkAdjudications,
  ] = useState<MarkAdjudications>()

  const onAdjudicationComplete = useCallback(
    async (
      sheetId: string,
      side: Side,
      adjudications: MarkAdjudications
    ): Promise<void> => {
      if (side === 'front') {
        setFrontMarkAdjudications(adjudications)
      } else {
        setBackMarkAdjudications(adjudications)
      }
    },
    []
  )

  useEffect(() => {
    void (async () => {
      const frontAdjudicationComplete =
        !!frontMarkAdjudications ||
        !!reviewInfo?.interpreted.front.adjudicationFinishedAt
      const backAdjudicationComplete =
        !!backMarkAdjudications ||
        !!reviewInfo?.interpreted.back.adjudicationFinishedAt
      if (frontAdjudicationComplete && backAdjudicationComplete) {
        await continueScanning({
          forceAccept: true,
          frontMarkAdjudications: frontMarkAdjudications ?? [],
          backMarkAdjudications: backMarkAdjudications ?? [],
        })
      }
    })()
  }, [
    backMarkAdjudications,
    continueScanning,
    frontMarkAdjudications,
    reviewInfo?.interpreted.back.adjudicationFinishedAt,
    reviewInfo?.interpreted.front.adjudicationFinishedAt,
  ])

  if (!reviewInfo) {
    return <React.Fragment />
  }

  let isOvervotedSheet = false
  let isUndervotedSheet = false
  let frontIsBlank = false
  let backIsBlank = false
  let isUnreadableSheet = false
  let isInvalidTestModeSheet = false
  let isInvalidElectionHashSheet = false
  let isInvalidPrecinctSheet = false

  let actualElectionHash: string | undefined

  for (const reviewPageInfo of [
    {
      side: 'front' as Side,
      imageURL: reviewInfo.interpreted.front.image.url,
      interpretation: reviewInfo.interpreted.front.interpretation,
      layout: reviewInfo.layouts.front,
      contestIds: reviewInfo.definitions.front?.contestIds,
      adjudicationFinishedAt:
        reviewInfo.interpreted.front.adjudicationFinishedAt,
    },
    {
      side: 'back' as Side,
      imageURL: reviewInfo.interpreted.back.image.url,
      interpretation: reviewInfo.interpreted.back.interpretation,
      layout: reviewInfo.layouts.back,
      contestIds: reviewInfo.definitions.back?.contestIds,
      adjudicationFinishedAt:
        reviewInfo.interpreted.back.adjudicationFinishedAt,
    },
  ]) {
    if (
      reviewPageInfo.adjudicationFinishedAt ||
      (reviewPageInfo.side === 'front' && frontMarkAdjudications) ||
      (reviewPageInfo.side === 'back' && backMarkAdjudications)
    ) {
      continue
    }

    if (reviewPageInfo.interpretation.type === 'InvalidTestModePage') {
      isInvalidTestModeSheet = true
    } else if (
      reviewPageInfo.interpretation.type === 'InvalidElectionHashPage'
    ) {
      isInvalidElectionHashSheet = true
      actualElectionHash = reviewPageInfo.interpretation.actualElectionHash
    } else if (reviewPageInfo.interpretation.type === 'InvalidPrecinctPage') {
      isInvalidPrecinctSheet = true
    } else if (reviewPageInfo.interpretation.type === 'InterpretedHmpbPage') {
      if (reviewPageInfo.interpretation.adjudicationInfo.requiresAdjudication) {
        for (const adjudicationReason of reviewPageInfo.interpretation
          .adjudicationInfo.allReasonInfos) {
          if (
            reviewPageInfo.interpretation.adjudicationInfo.enabledReasons.includes(
              adjudicationReason.type
            )
          ) {
            if (adjudicationReason.type === AdjudicationReason.Overvote) {
              isOvervotedSheet = true
              contestIdsWithIssues.add(adjudicationReason.contestId)
            } else if (
              adjudicationReason.type === AdjudicationReason.Undervote
            ) {
              isUndervotedSheet = true
              contestIdsWithIssues.add(adjudicationReason.contestId)
            } else if (
              adjudicationReason.type === AdjudicationReason.WriteIn ||
              adjudicationReason.type === AdjudicationReason.UnmarkedWriteIn
            ) {
              assert(reviewPageInfo.layout)
              assert(reviewPageInfo.contestIds)
              return (
                <WriteInAdjudicationScreen
                  sheetId={reviewInfo.interpreted.id}
                  side={reviewPageInfo.side}
                  imageURL={reviewPageInfo.imageURL}
                  interpretation={reviewPageInfo.interpretation}
                  layout={reviewPageInfo.layout}
                  contestIds={reviewPageInfo.contestIds}
                  onAdjudicationComplete={onAdjudicationComplete}
                />
              )
            } else if (
              adjudicationReason.type === AdjudicationReason.BlankBallot
            ) {
              if (reviewPageInfo.side === 'front') {
                frontIsBlank = true
              } else {
                backIsBlank = true
              }
            }
          }
        }
      }
    } else {
      isUnreadableSheet = true
    }
  }

  const allowBallotDuplication =
    !isInvalidTestModeSheet &&
    !isInvalidElectionHashSheet &&
    !isInvalidPrecinctSheet &&
    !isUnreadableSheet

  const isBlankSheet = frontIsBlank && backIsBlank

  return (
    <Screen>
      <MainNav>
        {!allowBallotDuplication ? (
          <Button
            primary
            onPress={() => continueScanning({ forceAccept: false })}
          >
            Confirm Ballot Removed and Continue Scanning
          </Button>
        ) : ballotState === 'removeBallot' ? (
          <Button
            primary
            onPress={() => continueScanning({ forceAccept: false })}
          >
            Confirm Ballot Removed and Continue Scanning
          </Button>
        ) : ballotState === 'acceptBallot' ? (
          <Button
            primary
            onPress={() =>
              continueScanning({
                forceAccept: true,
                frontMarkAdjudications: [],
                backMarkAdjudications: [],
              })
            }
          >
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
                : isInvalidElectionHashSheet
                ? 'Wrong Election'
                : isInvalidPrecinctSheet
                ? 'Wrong Precinct'
                : isUnreadableSheet
                ? 'Unreadable'
                : isOvervotedSheet
                ? 'Overvote'
                : isUndervotedSheet
                ? 'Undervote'
                : isBlankSheet
                ? 'Blank Ballot'
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
                  {isOvervotedSheet ? (
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
                      and tabulate as ballot with issue which could not be
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
            ) : isInvalidElectionHashSheet ? (
              <React.Fragment>
                <p>
                  The scanned ballot does not match the election this scanner is
                  configured for. Remove the invalid ballot before continuing.
                </p>
                <Text small>
                  Ballot Election Hash: {actualElectionHash?.slice(0, 10)}
                </Text>
              </React.Fragment>
            ) : isInvalidPrecinctSheet ? (
              <React.Fragment>
                <p>
                  The scanned ballot does not match the precinct this scanner is
                  configured for. Remove the invalid ballot before continuing.
                </p>
              </React.Fragment>
            ) : (
              // Unreadable
              <React.Fragment>
                <p>
                  There was a problem reading the ballot. Remove ballot and
                  reload in the scanner to try again.
                </p>
                <p>
                  If the error persists remove ballot and create a duplicate
                  ballot for the Resolution Board to review.
                </p>
              </React.Fragment>
            )}
          </Prose>
          <RectoVerso>
            <BallotSheetImage
              imageURL={reviewInfo.interpreted.front.image.url}
              layout={reviewInfo.layouts.front}
              contestIds={reviewInfo.definitions.front?.contestIds}
              styleForContest={styleForContest}
            />
            <BallotSheetImage
              imageURL={reviewInfo.interpreted.back.image.url}
              layout={reviewInfo.layouts.back}
              contestIds={reviewInfo.definitions.back?.contestIds}
              styleForContest={styleForContest}
            />
          </RectoVerso>
        </MainChildColumns>
      </Main>
      <StatusFooter />
    </Screen>
  )
}
export default BallotEjectScreen
