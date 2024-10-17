import { LogEventId } from '@votingworks/logging';
import {
  AdjudicationReason,
  Contest,
  PageInterpretation,
  Side,
  formatBallotHash,
} from '@votingworks/types';
import { Scan } from '@votingworks/api';
import { assert } from '@votingworks/basics';
import { Button, H1, H2, H6, Icons, Main, P, Screen } from '@votingworks/ui';
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

interface EjectInformation {
  header: string;
  body: React.ReactNode;
  allowBallotDuplication: boolean;
}

const SHEET_ADJUDICATION_ERRORS: ReadonlyArray<PageInterpretation['type']> = [
  'InvalidTestModePage',
  'InvalidBallotHashPage',
  'UnreadablePage',
  'BlankPage',
];

export function BallotEjectScreen({ isTestMode }: Props): JSX.Element | null {
  const { auth, logger, electionDefinition } = useContext(AppContext);
  const [reviewInfo, setReviewInfo] =
    useState<Scan.GetNextReviewSheetResponse>();
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
  const highlightedContestIds = new Set<Contest['id']>();

  const styleForContest = useCallback(
    (contestId: Contest['id']): React.CSSProperties =>
      highlightedContestIds.has(contestId)
        ? { backgroundColor: HIGHLIGHTER_COLOR }
        : {},
    [highlightedContestIds]
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

  const { disallowTabulatingOvervotes } = systemSettingsQuery.data;

  let isOvervotedSheet = false;
  let isUndervotedSheet = false;
  let isFrontBlank = false;
  let isBackBlank = false;
  let isInvalidTestModeSheet = false;
  let isInvalidBallotHashSheet = false;

  let actualBallotHash: string | undefined;

  const undervoteContestIds = new Set<Contest['id']>();
  const overvoteContestIds = new Set<Contest['id']>();

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
    } else if (reviewPageInfo.interpretation.type === 'InvalidBallotHashPage') {
      isInvalidBallotHashSheet = true;
      actualBallotHash = reviewPageInfo.interpretation.actualBallotHash;
    } else if (reviewPageInfo.interpretation.type === 'InterpretedHmpbPage') {
      if (reviewPageInfo.interpretation.adjudicationInfo.requiresAdjudication) {
        for (const adjudicationReason of reviewPageInfo.interpretation
          .adjudicationInfo.enabledReasonInfos) {
          if (adjudicationReason.type === AdjudicationReason.Overvote) {
            isOvervotedSheet = true;
            overvoteContestIds.add(adjudicationReason.contestId);
          } else if (adjudicationReason.type === AdjudicationReason.Undervote) {
            isUndervotedSheet = true;
            undervoteContestIds.add(adjudicationReason.contestId);
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
    }
  }

  const backInterpretation = reviewInfo.interpreted.back.interpretation;
  const isBackIntentionallyLeftBlank =
    backInterpretation.type === 'InterpretedHmpbPage' &&
    backInterpretation.markInfo.marks.length === 0;
  const isBlankSheet =
    isFrontBlank && (isBackBlank || isBackIntentionallyLeftBlank);

  if (isOvervotedSheet) {
    for (const contestId of overvoteContestIds) {
      highlightedContestIds.add(contestId);
    }
  } else if (isUndervotedSheet && !isBlankSheet) {
    for (const contestId of undervoteContestIds) {
      highlightedContestIds.add(contestId);
    }
  }

  const ejectInfo: EjectInformation = (() => {
    if (isInvalidTestModeSheet) {
      return isTestMode
        ? {
            header: 'Official Ballot',
            body: (
              <React.Fragment>
                <P>
                  The last scanned ballot was not tabulated because it is an
                  official ballot but the scanner is in test ballot mode.
                </P>
                <P>Remove the ballot before continuing.</P>
              </React.Fragment>
            ),
            allowBallotDuplication: false,
          }
        : {
            header: 'Test Ballot',
            body: (
              <React.Fragment>
                <P>
                  The last scanned ballot was not tabulated because it is a test
                  ballot but the scanner is in official ballot mode.
                </P>
                <P>Remove the ballot before continuing.</P>
              </React.Fragment>
            ),
            allowBallotDuplication: false,
          };
    }

    if (isInvalidBallotHashSheet) {
      return {
        header: 'Wrong Election',
        body: (
          <React.Fragment>
            <P>
              The last scanned ballot was not tabulated because it does not
              match the election this scanner is configured for.
            </P>
            <H6>Ballot Election ID</H6>
            <P>{formatBallotHash(actualBallotHash ?? '')}</P>
            <H6>Scanner Election ID</H6>
            <P>{formatBallotHash(electionDefinition.ballotHash)}</P>
            <br />
            <P>Remove the ballot before continuing.</P>
          </React.Fragment>
        ),
        allowBallotDuplication: false,
      };
    }

    if (isOvervotedSheet) {
      return {
        header: 'Overvote',
        body: (
          <P>
            The last scanned ballot was not tabulated because an overvote was
            detected.
          </P>
        ),
        allowBallotDuplication: !disallowTabulatingOvervotes,
      };
    }

    if (isBlankSheet) {
      return {
        header: 'Blank Ballot',
        body: (
          <P>
            The last scanned ballot was not tabulated because no marks were
            detected.
          </P>
        ),
        allowBallotDuplication: true,
      };
    }

    if (isUndervotedSheet) {
      return {
        header: 'Undervote',
        body: (
          <P>
            The last scanned ballot was not tabulated because an undervote was
            detected.
          </P>
        ),
        allowBallotDuplication: true,
      };
    }

    return {
      header: 'Unreadable',
      body: (
        <React.Fragment>
          <P>
            The last scanned ballot was not tabulated because there was a
            problem reading the ballot.
          </P>
          <P>
            Remove the ballot and reload it into the scanner to try again. If
            the error persists, remove the ballot for manual adjudication.
          </P>
        </React.Fragment>
      ),
      allowBallotDuplication: false,
    };
  })();

  return (
    <Screen>
      <AdjudicationHeader>
        <H1>
          <Icons.Warning /> Ballot Not Counted
        </H1>
      </AdjudicationHeader>
      <Main flexRow>
        <AdjudicationExplanation>
          <H2>{ejectInfo.header}</H2>
          {ejectInfo.body}
          {ejectInfo.allowBallotDuplication ? (
            <React.Fragment>
              <P>
                Remove the ballot for manual adjudication or choose to tabulate
                it anyway.
              </P>
              <P>
                <Button
                  variant="primary"
                  onPress={removeBallotAndContinueScanning}
                  style={{ width: '100%', marginTop: '0.5rem' }}
                >
                  Confirm Ballot Removed
                </Button>
              </P>
              <P>
                <Button
                  variant="primary"
                  onPress={acceptBallotAndContinueScanning}
                  style={{ width: '100%' }}
                >
                  Tabulate Ballot
                </Button>
              </P>
            </React.Fragment>
          ) : (
            <Button
              variant="primary"
              onPress={removeBallotAndContinueScanning}
              style={{ marginTop: '0.5rem', width: '100%' }}
            >
              Confirm Ballot Removed
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
    </Screen>
  );
}
