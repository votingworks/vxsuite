import { LogEventId } from '@votingworks/logging';
import {
  AdjudicationReason,
  Contest,
  MarkAdjudications,
  PageInterpretation,
} from '@votingworks/types';
import { Scan } from '@votingworks/api';
import { assert } from '@votingworks/utils';
import {
  ElectionInfoBar,
  isElectionManagerAuth,
  Main,
  Modal,
  Screen,
  Text,
} from '@votingworks/ui';
import React, { useCallback, useContext, useEffect, useState } from 'react';
import styled from 'styled-components';
import { fetchNextBallotSheetToReview } from '../api/hmpb';
import { BallotSheetImage } from '../components/ballot_sheet_image';
import { Button } from '../components/button';
import { MainNav } from '../components/main_nav';
import { Prose } from '../components/prose';
import { AppContext } from '../contexts/app_context';

const MainChildFlexRow = styled.div`
  flex: 1;
  display: flex;
  margin-top: 0.5em;
  > div {
    margin-right: 1em;
    &:first-child {
      flex: 1;
      margin-left: 1em;
    }
    &:last-child {
      margin-right: 0;
    }
  }
`;

const RectoVerso = styled.div`
  display: flex;
  & > * {
    &:first-child {
      margin-right: 1em;
    }
  }
  img {
    max-width: 100%;
    max-height: 82vh;
  }
`;

const HIGHLIGHTER_COLOR = '#fbff0066';

interface Props {
  continueScanning: (request: Scan.ScanContinueRequest) => Promise<void>;
  isTestMode: boolean;
}

type EjectState = 'removeBallot' | 'acceptBallot';

const SHEET_ADJUDICATION_ERRORS: ReadonlyArray<PageInterpretation['type']> = [
  'InvalidTestModePage',
  'InvalidElectionHashPage',
  'UninterpretedHmpbPage',
  'UnreadablePage',
  'BlankPage',
];

export function BallotEjectScreen({
  continueScanning,
  isTestMode,
}: Props): JSX.Element | null {
  const { auth, logger, electionDefinition, machineConfig } =
    useContext(AppContext);
  const [reviewInfo, setReviewInfo] =
    useState<Scan.GetNextReviewSheetResponse>();
  const [ballotState, setBallotState] = useState<EjectState>();
  function ResetBallotState() {
    setBallotState(undefined);
  }
  assert(isElectionManagerAuth(auth));
  const userRole = auth.user.role;

  useEffect(() => {
    void (async () => {
      setReviewInfo(await fetchNextBallotSheetToReview());
    })();
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const contestIdsWithIssues = new Set<Contest['id']>();

  const styleForContest = useCallback(
    (contestId: Contest['id']): React.CSSProperties =>
      contestIdsWithIssues.has(contestId)
        ? { backgroundColor: HIGHLIGHTER_COLOR }
        : {},
    [contestIdsWithIssues]
  );

  const [frontMarkAdjudications, setFrontMarkAdjudications] =
    useState<MarkAdjudications>();
  const [backMarkAdjudications, setBackMarkAdjudications] =
    useState<MarkAdjudications>();

  // with new reviewInfo, mark each side done if nothing to actually adjudicate
  useEffect(() => {
    if (!reviewInfo) {
      return;
    }

    const frontInterpretation = reviewInfo.interpreted.front.interpretation;
    const backInterpretation = reviewInfo.interpreted.back.interpretation;

    const errorInterpretations = SHEET_ADJUDICATION_ERRORS.filter(
      (e) => e === frontInterpretation.type || e === backInterpretation.type
    );
    if (errorInterpretations.length > 0) {
      void logger.log(LogEventId.ScanAdjudicationInfo, userRole, {
        message:
          'Sheet scanned that has unresolvable errors. Sheet must be removed to continue scanning.',
        adjudicationTypes: errorInterpretations.join(', '),
      });
    } else {
      const adjudicationTypes = new Set<AdjudicationReason>();
      if (
        frontInterpretation.type === 'InterpretedHmpbPage' &&
        frontInterpretation.adjudicationInfo.requiresAdjudication
      ) {
        for (const reason of frontInterpretation.adjudicationInfo
          .enabledReasons) {
          adjudicationTypes.add(reason);
        }
      }
      if (
        backInterpretation.type === 'InterpretedHmpbPage' &&
        backInterpretation.adjudicationInfo.requiresAdjudication
      ) {
        for (const reason of backInterpretation.adjudicationInfo
          .enabledReasons) {
          adjudicationTypes.add(reason);
        }
      }
      void logger.log(LogEventId.ScanAdjudicationInfo, userRole, {
        message:
          'Sheet scanned has warnings (ex: undervotes or overvotes). The user can either tabulate it as is or remove the ballot to continue scanning.',
        adjudicationTypes: [...adjudicationTypes].join(', '),
      });
    }

    if (
      !(
        frontInterpretation.type === 'InterpretedHmpbPage' &&
        backInterpretation.type === 'InterpretedHmpbPage'
      )
    ) {
      return;
    }

    const frontAdjudication = frontInterpretation.adjudicationInfo;
    const backAdjudication = backInterpretation.adjudicationInfo;

    // A ballot is blank if both sides are marked blank.
    //
    // One could argue that making this call is the server's job.
    // We leave that consideration to:
    // https://github.com/votingworks/vxsuite/issues/902
    const isBlank =
      frontAdjudication.enabledReasonInfos.some(
        (info) => info.type === AdjudicationReason.BlankBallot
      ) &&
      backAdjudication.enabledReasonInfos.some(
        (info) => info.type === AdjudicationReason.BlankBallot
      );

    if (!isBlank) {
      if (
        !frontAdjudication.enabledReasons.some(
          (reason) =>
            reason !== AdjudicationReason.BlankBallot &&
            frontAdjudication.enabledReasonInfos.some(
              (info) => info.type === reason
            )
        )
      ) {
        setFrontMarkAdjudications([]);
      }
      if (
        !backAdjudication.enabledReasons.some(
          (reason) =>
            reason !== AdjudicationReason.BlankBallot &&
            backAdjudication.enabledReasonInfos.some(
              (info) => info.type === reason
            )
        )
      ) {
        setBackMarkAdjudications([]);
      }
    }
  }, [reviewInfo, logger, userRole]);

  useEffect(() => {
    void (async () => {
      const frontAdjudicationComplete =
        !!frontMarkAdjudications ||
        !!reviewInfo?.interpreted.front.adjudicationFinishedAt;
      const backAdjudicationComplete =
        !!backMarkAdjudications ||
        !!reviewInfo?.interpreted.back.adjudicationFinishedAt;
      if (frontAdjudicationComplete && backAdjudicationComplete) {
        await logger.log(LogEventId.ScanAdjudicationInfo, userRole, {
          message:
            'Sheet does not actually require adjudication, system will automatically accept and continue scanning.',
        });
        await continueScanning({
          forceAccept: true,
          frontMarkAdjudications: frontMarkAdjudications ?? [],
          backMarkAdjudications: backMarkAdjudications ?? [],
        });
      }
    })();
  }, [
    backMarkAdjudications,
    continueScanning,
    frontMarkAdjudications,
    reviewInfo?.interpreted.back.adjudicationFinishedAt,
    reviewInfo?.interpreted.front.adjudicationFinishedAt,
    logger,
    userRole,
  ]);

  if (!reviewInfo) {
    return null;
  }

  let isOvervotedSheet = false;
  let isUndervotedSheet = false;
  let isFrontBlank = false;
  let isBackBlank = false;
  let isUnreadableSheet = false;
  let isInvalidTestModeSheet = false;
  let isInvalidElectionHashSheet = false;

  let actualElectionHash: string | undefined;

  for (const reviewPageInfo of [
    {
      side: 'front' as Scan.Side,
      imageUrl: reviewInfo.interpreted.front.image.url,
      interpretation: reviewInfo.interpreted.front.interpretation,
      layout: reviewInfo.layouts.front,
      contestIds: reviewInfo.definitions.front?.contestIds,
      adjudicationFinishedAt:
        reviewInfo.interpreted.front.adjudicationFinishedAt,
    },
    {
      side: 'back' as Scan.Side,
      imageUrl: reviewInfo.interpreted.back.image.url,
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
      continue;
    }

    if (reviewPageInfo.interpretation.type === 'InvalidTestModePage') {
      isInvalidTestModeSheet = true;
    } else if (
      reviewPageInfo.interpretation.type === 'InvalidElectionHashPage'
    ) {
      isInvalidElectionHashSheet = true;
      actualElectionHash = reviewPageInfo.interpretation.actualElectionHash;
    } else if (reviewPageInfo.interpretation.type === 'InterpretedHmpbPage') {
      if (reviewPageInfo.interpretation.adjudicationInfo.requiresAdjudication) {
        for (const adjudicationReason of reviewPageInfo.interpretation
          .adjudicationInfo.enabledReasonInfos) {
          if (adjudicationReason.type === AdjudicationReason.Overvote) {
            isOvervotedSheet = true;
            contestIdsWithIssues.add(adjudicationReason.contestId);
          } else if (adjudicationReason.type === AdjudicationReason.Undervote) {
            isUndervotedSheet = true;
            contestIdsWithIssues.add(adjudicationReason.contestId);
          } else if (
            adjudicationReason.type === AdjudicationReason.BlankBallot
          ) {
            if (reviewPageInfo.side === 'front') {
              isFrontBlank = true;
            } else {
              isBackBlank = true;
            }
          }
        }
      }
    } else {
      isUnreadableSheet = true;
    }
  }

  const allowBallotDuplication =
    !isInvalidTestModeSheet &&
    !isInvalidElectionHashSheet &&
    !isUnreadableSheet;

  const backInterpretation = reviewInfo.interpreted.back.interpretation;
  const isBackIntentionallyLeftBlank =
    backInterpretation.type === 'InterpretedHmpbPage' &&
    backInterpretation.markInfo.marks.length === 0;
  const isBlankSheet =
    isFrontBlank && (isBackBlank || isBackIntentionallyLeftBlank);

  return (
    <React.Fragment>
      <Screen>
        <MainNav />
        <Main>
          <MainChildFlexRow>
            <Prose maxWidth={false}>
              <h1>
                <span style={{ fontSize: '2em' }}>
                  {isInvalidTestModeSheet
                    ? isTestMode
                      ? 'Live Ballot'
                      : 'Test Ballot'
                    : isInvalidElectionHashSheet
                    ? 'Wrong Election'
                    : isUnreadableSheet
                    ? 'Unreadable'
                    : isOvervotedSheet
                    ? 'Overvote'
                    : isBlankSheet
                    ? 'Blank Ballot'
                    : isUndervotedSheet
                    ? 'Undervote'
                    : 'Unknown Reason'}
                </span>
              </h1>
              {isOvervotedSheet ? (
                <p>
                  The last scanned ballot was not tabulated because an overvote
                  was detected.
                </p>
              ) : isBlankSheet ? (
                <p>
                  The last scanned ballot was not tabulated because no votes
                  were detected.
                </p>
              ) : isUndervotedSheet ? (
                <p>
                  The last scanned ballot was not tabulated because an undervote
                  was detected.
                </p>
              ) : (
                <p>The last scanned ballot was not tabulated.</p>
              )}
              {allowBallotDuplication ? (
                <React.Fragment>
                  <p>
                    <Button
                      fullWidth
                      primary
                      onPress={() => setBallotState('removeBallot')}
                    >
                      Remove to Adjudicate
                    </Button>
                  </p>
                  <p>
                    <Button
                      fullWidth
                      primary
                      onPress={() => setBallotState('acceptBallot')}
                    >
                      Tabulate As Is
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
                    The scanned ballot does not match the election this scanner
                    is configured for. Remove the invalid ballot before
                    continuing.
                  </p>
                  <Text small>
                    Ballot Election Hash: {actualElectionHash?.slice(0, 10)}
                  </Text>
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
              {!allowBallotDuplication && (
                <Button
                  primary
                  fullWidth
                  onPress={() => continueScanning({ forceAccept: false })}
                >
                  The ballot has been removed
                </Button>
              )}
            </Prose>
            <RectoVerso>
              <BallotSheetImage
                imageUrl={reviewInfo.interpreted.front.image.url}
                layout={reviewInfo.layouts.front}
                contestIds={reviewInfo.definitions.front?.contestIds}
                styleForContest={styleForContest}
              />
              <BallotSheetImage
                imageUrl={reviewInfo.interpreted.back.image.url}
                layout={reviewInfo.layouts.back}
                contestIds={reviewInfo.definitions.back?.contestIds}
                styleForContest={styleForContest}
              />
            </RectoVerso>
          </MainChildFlexRow>
        </Main>
        {electionDefinition && (
          <ElectionInfoBar
            mode="admin"
            electionDefinition={electionDefinition}
            codeVersion={machineConfig.codeVersion}
            machineId={machineConfig.machineId}
          />
        )}
      </Screen>
      {ballotState === 'removeBallot' && (
        <Modal
          centerContent
          content={
            <Prose textCenter>
              <h1>Remove the Ballot</h1>
              <p>Remove the ballot and provide it to the resolution board.</p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button
                primary
                onPress={() => continueScanning({ forceAccept: false })}
              >
                Ballot has been removed
              </Button>
              <Button onPress={ResetBallotState}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={ResetBallotState}
        />
      )}
      {ballotState === 'acceptBallot' && (
        <Modal
          centerContent
          content={
            <Prose textCenter>
              <h1>Tabulate Ballot As Is?</h1>
              <p>Please confirm you wish to tabulate this ballot as is.</p>
            </Prose>
          }
          actions={
            <React.Fragment>
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
                Yes, tabulate ballot as is
              </Button>
              <Button onPress={ResetBallotState}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={ResetBallotState}
        />
      )}
    </React.Fragment>
  );
}
