import { LogEventId } from '@votingworks/logging';
import {
  AdjudicationReason,
  Contest,
  PageInterpretation,
  Side,
} from '@votingworks/types';
import { Scan } from '@votingworks/api';
import { assert } from '@votingworks/basics';
import {
  Button,
  Caption,
  ElectionInfoBar,
  H4,
  Main,
  Modal,
  P,
  Screen,
} from '@votingworks/ui';
import { isElectionManagerAuth } from '@votingworks/utils';
import React, { useCallback, useContext, useEffect, useState } from 'react';
import styled from 'styled-components';
import { fetchNextBallotSheetToReview } from '../api/hmpb';
import { BallotSheetImage } from '../components/ballot_sheet_image';
import { MainNav } from '../components/main_nav';
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

  let isFrontAdjudicationDone = false;
  let isBackAdjudicationDone = false;

  // with new reviewInfo, mark each side done if nothing to actually adjudicate
  if (reviewInfo) {
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
      frontInterpretation.type === 'InterpretedHmpbPage' &&
      backInterpretation.type === 'InterpretedHmpbPage'
    ) {
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
          isFrontAdjudicationDone = true;
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
          isBackAdjudicationDone = true;
        }
      }
    }
  }

  useEffect(() => {
    void (async () => {
      const frontAdjudicationComplete =
        isFrontAdjudicationDone ||
        !!reviewInfo?.interpreted.front.adjudicationFinishedAt;
      const backAdjudicationComplete =
        isBackAdjudicationDone ||
        !!reviewInfo?.interpreted.back.adjudicationFinishedAt;
      if (frontAdjudicationComplete && backAdjudicationComplete) {
        await logger.log(LogEventId.ScanAdjudicationInfo, userRole, {
          message:
            'Sheet does not actually require adjudication, system will automatically accept and continue scanning.',
        });
        await continueScanning({
          forceAccept: true,
        });
      }
    })();
  }, [
    isBackAdjudicationDone,
    continueScanning,
    isFrontAdjudicationDone,
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
      side: 'front' as Side,
      imageUrl: reviewInfo.interpreted.front.image.url,
      interpretation: reviewInfo.interpreted.front.interpretation,
      layout: reviewInfo.layouts.front,
      contestIds: reviewInfo.definitions.front?.contestIds,
      adjudicationFinishedAt:
        reviewInfo.interpreted.front.adjudicationFinishedAt,
    },
    {
      side: 'back' as Side,
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
      (reviewPageInfo.side === 'front' && isFrontAdjudicationDone) ||
      (reviewPageInfo.side === 'back' && isBackAdjudicationDone)
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
            <div>
              <H4 as="h1">
                <span style={{ fontSize: '2em' }}>
                  {isInvalidTestModeSheet
                    ? isTestMode
                      ? 'Official Ballot'
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
              </H4>
              {isOvervotedSheet ? (
                <P>
                  The last scanned ballot was not tabulated because an overvote
                  was detected.
                </P>
              ) : isBlankSheet ? (
                <P>
                  The last scanned ballot was not tabulated because no votes
                  were detected.
                </P>
              ) : isUndervotedSheet ? (
                <P>
                  The last scanned ballot was not tabulated because an undervote
                  was detected.
                </P>
              ) : (
                <P>The last scanned ballot was not tabulated.</P>
              )}
              {allowBallotDuplication ? (
                <React.Fragment>
                  <P>
                    <Button
                      variant="primary"
                      onPress={() => setBallotState('removeBallot')}
                    >
                      Remove to Adjudicate
                    </Button>
                  </P>
                  <P>
                    <Button
                      variant="primary"
                      onPress={() => setBallotState('acceptBallot')}
                    >
                      Tabulate As Is
                    </Button>
                  </P>
                </React.Fragment>
              ) : isInvalidTestModeSheet ? (
                isTestMode ? (
                  <P>Remove the OFFICIAL ballot before continuing.</P>
                ) : (
                  <P>Remove the TEST ballot before continuing.</P>
                )
              ) : isInvalidElectionHashSheet ? (
                <React.Fragment>
                  <P>
                    The scanned ballot does not match the election this scanner
                    is configured for. Remove the invalid ballot before
                    continuing.
                  </P>
                  <Caption>
                    Ballot Election Hash: {actualElectionHash?.slice(0, 10)}
                  </Caption>
                </React.Fragment>
              ) : (
                // Unreadable
                <React.Fragment>
                  <P>
                    There was a problem reading the ballot. Remove ballot and
                    reload in the scanner to try again.
                  </P>
                  <P>
                    If the error persists remove ballot and create a duplicate
                    ballot for the Resolution Board to review.
                  </P>
                </React.Fragment>
              )}
              {!allowBallotDuplication && (
                <Button
                  variant="primary"
                  onPress={() => continueScanning({ forceAccept: false })}
                >
                  The ballot has been removed
                </Button>
              )}
            </div>
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
          title="Remove the Ballot"
          content={
            <P>Remove the ballot and provide it to the resolution board.</P>
          }
          actions={
            <React.Fragment>
              <Button
                variant="primary"
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
          title="Tabulate Ballot As Is?"
          content={
            <P>Please confirm you wish to tabulate this ballot as is.</P>
          }
          actions={
            <React.Fragment>
              <Button
                variant="primary"
                onPress={() =>
                  continueScanning({
                    forceAccept: true,
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
