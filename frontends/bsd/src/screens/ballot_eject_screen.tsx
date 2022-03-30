import { LogEventId } from '@votingworks/logging';
import {
  AdjudicationReason,
  Contest,
  MarkAdjudications,
  PageInterpretation,
  WriteInAdjudicationReasonInfo,
} from '@votingworks/types';
import {
  GetNextReviewSheetResponse,
  ScanContinueRequest,
  Side,
} from '@votingworks/types/api/services/scan';
import { assert } from '@votingworks/utils';
import { ElectionInfoBar } from '@votingworks/ui';
import React, { useCallback, useContext, useEffect, useState } from 'react';
import styled from 'styled-components';
import { fetchNextBallotSheetToReview } from '../api/hmpb';
import { BallotSheetImage } from '../components/ballot_sheet_image';
import { Button } from '../components/button';
import { Main } from '../components/main';
import { MainNav } from '../components/main_nav';
import { Prose } from '../components/prose';
import { Screen } from '../components/screen';
import { Text } from '../components/text';
import { AppContext } from '../contexts/app_context';
import { WriteInAdjudicationScreen } from './write_in_adjudication_screen';

const EjectReason = styled.div`
  font-size: 3em;
  font-weight: 900;
`;

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
    max-height: 87vh;
  }
`;

const HIGHLIGHTER_COLOR = '#fbff0066';

interface Props {
  continueScanning: (request: ScanContinueRequest) => Promise<void>;
  isTestMode: boolean;
}

type EjectState = 'removeBallot' | 'acceptBallot';

function doNothing() {
  console.log('disabled'); // eslint-disable-line no-console
}

const SHEET_ADJUDICATION_ERRORS: Array<PageInterpretation['type']> = [
  'InvalidTestModePage',
  'InvalidElectionHashPage',
  'InvalidPrecinctPage',
  'UninterpretedHmpbPage',
  'UnreadablePage',
  'BlankPage',
];

export function BallotEjectScreen({
  continueScanning,
  isTestMode,
}: Props): JSX.Element {
  const {
    currentUserSession,
    logger,
    electionDefinition,
    machineConfig,
  } = useContext(AppContext);
  const [reviewInfo, setReviewInfo] = useState<GetNextReviewSheetResponse>();
  const [ballotState, setBallotState] = useState<EjectState>();
  assert(currentUserSession);
  const currentUserType = currentUserSession.type;

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

  const [
    frontMarkAdjudications,
    setFrontMarkAdjudications,
  ] = useState<MarkAdjudications>();
  const [
    backMarkAdjudications,
    setBackMarkAdjudications,
  ] = useState<MarkAdjudications>();

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
      void logger.log(LogEventId.ScanAdjudicationInfo, currentUserType, {
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
      void logger.log(LogEventId.ScanAdjudicationInfo, currentUserType, {
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

    // A ballot is blank if both sides are marked blank
    // and neither side contains an unmarked write in,
    // because an unmarked write-in is a sign the page isn't blank.
    //
    // One could argue that making this call is the server's job.
    // We leave that consideration to:
    // https://github.com/votingworks/vxsuite/issues/902
    const isBlank =
      frontAdjudication.enabledReasonInfos.some(
        (info) => info.type === AdjudicationReason.BlankBallot
      ) &&
      !frontAdjudication.enabledReasonInfos.some(
        (info) => info.type === AdjudicationReason.UnmarkedWriteIn
      ) &&
      (backAdjudication.enabledReasonInfos.some(
        (info) => info.type === AdjudicationReason.BlankBallot
      ) ||
        backInterpretation.markInfo.marks.length === 0) &&
      !backAdjudication.enabledReasonInfos.some(
        (info) => info.type === AdjudicationReason.UnmarkedWriteIn
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
  }, [reviewInfo, logger, currentUserType]);

  const onAdjudicationComplete = useCallback(
    async (
      sheetId: string,
      side: Side,
      adjudications: MarkAdjudications
    ): Promise<void> => {
      if (side === 'front') {
        setFrontMarkAdjudications(adjudications);
      } else {
        setBackMarkAdjudications(adjudications);
      }
    },
    []
  );

  useEffect(() => {
    void (async () => {
      const frontAdjudicationComplete =
        !!frontMarkAdjudications ||
        !!reviewInfo?.interpreted.front.adjudicationFinishedAt;
      const backAdjudicationComplete =
        !!backMarkAdjudications ||
        !!reviewInfo?.interpreted.back.adjudicationFinishedAt;
      if (frontAdjudicationComplete && backAdjudicationComplete) {
        await logger.log(LogEventId.ScanAdjudicationInfo, currentUserType, {
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
    currentUserType,
  ]);

  if (!reviewInfo) {
    return <React.Fragment />;
  }

  let isOvervotedSheet = false;
  let isUndervotedSheet = false;
  let isFrontBlank = false;
  let isBackBlank = false;
  let isUnreadableSheet = false;
  let isInvalidTestModeSheet = false;
  let isInvalidElectionHashSheet = false;
  let isInvalidPrecinctSheet = false;

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
    } else if (reviewPageInfo.interpretation.type === 'InvalidPrecinctPage') {
      isInvalidPrecinctSheet = true;
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
            adjudicationReason.type === AdjudicationReason.MarkedWriteIn ||
            adjudicationReason.type === AdjudicationReason.UnmarkedWriteIn
          ) {
            if (reviewPageInfo.layout && reviewPageInfo.contestIds) {
              const writeIns = reviewPageInfo.interpretation.adjudicationInfo.enabledReasonInfos.filter(
                (reason): reason is WriteInAdjudicationReasonInfo =>
                  reason.type === AdjudicationReason.MarkedWriteIn ||
                  reason.type === AdjudicationReason.UnmarkedWriteIn
              );
              return (
                <WriteInAdjudicationScreen
                  key={reviewPageInfo.side}
                  sheetId={reviewInfo.interpreted.id}
                  side={reviewPageInfo.side}
                  imageUrl={reviewPageInfo.imageUrl}
                  writeIns={writeIns}
                  layout={reviewPageInfo.layout}
                  allContestIds={reviewPageInfo.contestIds}
                  onAdjudicationComplete={onAdjudicationComplete}
                />
              );
            }
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
    !isInvalidPrecinctSheet &&
    !isUnreadableSheet;

  const backInterpretation = reviewInfo.interpreted.back.interpretation;
  const isBackIntentionallyLeftBlank =
    backInterpretation.type === 'InterpretedHmpbPage' &&
    backInterpretation.markInfo.marks.length === 0;
  const isBlankSheet =
    isFrontBlank && (isBackBlank || isBackIntentionallyLeftBlank);

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
                : isBlankSheet
                ? 'Blank Ballot'
                : isUndervotedSheet
                ? 'Undervote'
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
        </MainChildColumns>
      </Main>
      <ElectionInfoBar
        mode="admin"
        electionDefinition={electionDefinition}
        codeVersion={machineConfig.codeVersion}
        machineId={machineConfig.machineId}
      />
    </Screen>
  );
}
