import { LogEventId } from '@votingworks/logging';
import {
  AdjudicationReason,
  Contest,
  PageInterpretation,
  Side,
  getDisplayBallotHash,
} from '@votingworks/types';
import { Scan } from '@votingworks/api';
import { assert } from '@votingworks/basics';
import {
  Button,
  H1,
  H2,
  Icons,
  LabelledText,
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
import { AppContext } from '../contexts/app_context';
import { Header } from '../navigation_screen';
import { continueScanning, getSystemSettings } from '../api';

const AdjudicationHeader = styled(Header)`
  position: static;
  background: ${(p) => p.theme.colors.inverseBackground};
  color: ${(p) => p.theme.colors.onInverse};
  border: none;
`;

const AdjudicationExplanation = styled.div`
  padding: 1rem;
  flex: 1;

  button {
    white-space: nowrap;
  }
`;

const RectoVerso = styled.div`
  background: ${(p) => p.theme.colors.containerHigh};
  padding: 1rem;
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
  isTestMode: boolean;
}

type EjectState = 'removeBallot' | 'acceptBallot';

const SHEET_ADJUDICATION_ERRORS: ReadonlyArray<PageInterpretation['type']> = [
  'InvalidTestModePage',
  'InvalidElectionHashPage',
  'UnreadablePage',
  'BlankPage',
];

export function BallotEjectScreen({ isTestMode }: Props): JSX.Element | null {
  const { auth, logger, electionDefinition } = useContext(AppContext);
  const [reviewInfo, setReviewInfo] =
    useState<Scan.GetNextReviewSheetResponse>();
  const [ballotState, setBallotState] = useState<EjectState>();
  function ResetBallotState() {
    setBallotState(undefined);
  }
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth));
  const userRole = auth.user.role;

  const systemSettingsQuery = getSystemSettings.useQuery();
  const continueScanningMutation = continueScanning.useMutation();

  function removeBallotAndContinueScanning() {
    continueScanningMutation.mutate({ forceAccept: false });
  }

  function acceptBallotAndContinueScanning() {
    continueScanningMutation.mutate({ forceAccept: true });
  }

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
  }

  if (!reviewInfo || !systemSettingsQuery.isSuccess) {
    return null;
  }

  // TODO: since we use this flag here, in the central scanner, rename it to
  // not be "precinct" specific
  const { precinctScanDisallowCastingOvervotes } = systemSettingsQuery.data;

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
    !isUnreadableSheet &&
    !(isOvervotedSheet && precinctScanDisallowCastingOvervotes);

  const backInterpretation = reviewInfo.interpreted.back.interpretation;
  const isBackIntentionallyLeftBlank =
    backInterpretation.type === 'InterpretedHmpbPage' &&
    backInterpretation.markInfo.marks.length === 0;
  const isBlankSheet =
    isFrontBlank && (isBackBlank || isBackIntentionallyLeftBlank);

  const adjudicationTitle = isInvalidTestModeSheet
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
    : 'Unknown Issue';

  return (
    <Screen>
      <AdjudicationHeader>
        <H1>
          <Icons.Warning /> Ballot Not Counted
        </H1>
      </AdjudicationHeader>
      <Main flexRow>
        <AdjudicationExplanation>
          <H2>{adjudicationTitle}</H2>
          {isOvervotedSheet ? (
            <P>
              The last scanned ballot was not tabulated because an overvote was
              detected.
            </P>
          ) : isBlankSheet ? (
            <P>
              The last scanned ballot was not tabulated because no votes were
              detected.
            </P>
          ) : isUndervotedSheet ? (
            <P>
              The last scanned ballot was not tabulated because an undervote was
              detected.
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
                  style={{ width: '100%', marginTop: '0.5rem' }}
                >
                  Remove to adjudicate
                </Button>
              </P>
              <P>
                <Button
                  variant="primary"
                  onPress={() => setBallotState('acceptBallot')}
                  style={{ width: '100%' }}
                >
                  Tabulate as is
                </Button>
              </P>
            </React.Fragment>
          ) : isInvalidTestModeSheet ? (
            isTestMode ? (
              <P>Remove the official ballot before continuing.</P>
            ) : (
              <P>Remove the test ballot before continuing.</P>
            )
          ) : isInvalidElectionHashSheet ? (
            <React.Fragment>
              <P>
                The scanned ballot does not match the election this scanner is
                configured for. Remove the invalid ballot before continuing.
              </P>
              <P>
                <LabelledText label="Ballot Election ID">
                  {getDisplayBallotHash({
                    ballotHash: actualElectionHash ?? '',
                  })}
                </LabelledText>
              </P>
              <P>
                <LabelledText label="Scanner Election ID">
                  {getDisplayBallotHash(electionDefinition)}
                </LabelledText>
              </P>
            </React.Fragment>
          ) : isUnreadableSheet ? (
            <React.Fragment>
              <P>
                There was a problem reading the ballot. Remove ballot and reload
                in the scanner to try again.
              </P>
              <P>
                If the error persists remove ballot and create a duplicate
                ballot for the Resolution Board to review.
              </P>
            </React.Fragment>
          ) : null}
          {!allowBallotDuplication && (
            <Button
              variant="primary"
              onPress={removeBallotAndContinueScanning}
              style={{ marginTop: '0.5rem', width: '100%' }}
            >
              Ballot has been removed
            </Button>
          )}
        </AdjudicationExplanation>
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
      </Main>
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
                onPress={removeBallotAndContinueScanning}
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
                onPress={acceptBallotAndContinueScanning}
              >
                Yes, tabulate ballot as is
              </Button>
              <Button onPress={ResetBallotState}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={ResetBallotState}
        />
      )}
    </Screen>
  );
}
