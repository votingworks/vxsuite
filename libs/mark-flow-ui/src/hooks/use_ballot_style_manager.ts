import { assertDefined } from '@votingworks/basics';
import {
  BallotStyleId,
  ElectionDefinition,
  getBallotStyle,
} from '@votingworks/types';
import { useCurrentLanguage, useLanguageControls } from '@votingworks/ui';
import { getRelatedBallotStyle } from '@votingworks/utils';
import React from 'react';

export interface BallotStyleManagerParams {
  currentBallotStyleId?: BallotStyleId;
  electionDefinition?: ElectionDefinition | null;
  updateCardlessVoterBallotStyle: (input: {
    ballotStyleId: BallotStyleId;
  }) => unknown;
}

export function useBallotStyleManager(params: BallotStyleManagerParams): void {
  const {
    currentBallotStyleId,
    electionDefinition,
    updateCardlessVoterBallotStyle,
  } = params;

  const currentLanguage = useCurrentLanguage();
  const { setLanguage } = useLanguageControls();

  const isSessionInProgress = React.useRef(false);

  React.useEffect(() => {
    if (!currentBallotStyleId || !electionDefinition) {
      isSessionInProgress.current = false;
      return;
    }

    const isSessionStart = !isSessionInProgress.current;
    isSessionInProgress.current = true;

    if (isSessionStart) {
      const sessionLanguage = assertDefined(
        getBallotStyle({
          ballotStyleId: currentBallotStyleId,
          election: electionDefinition.election,
        })
      ).languages[0];

      if (sessionLanguage !== currentLanguage) {
        setLanguage(sessionLanguage);
        return;
      }
    }

    const ballotStyleForCurrentLanguage = getRelatedBallotStyle({
      ballotStyles: electionDefinition.election.ballotStyles,
      sourceBallotStyleId: currentBallotStyleId,
      targetBallotStyleLanguage: currentLanguage,
    }).unsafeUnwrap();

    if (ballotStyleForCurrentLanguage.id === currentBallotStyleId) {
      return;
    }

    updateCardlessVoterBallotStyle({
      ballotStyleId: ballotStyleForCurrentLanguage.id,
    });
  }, [
    currentBallotStyleId,
    currentLanguage,
    electionDefinition,
    setLanguage,
    updateCardlessVoterBallotStyle,
  ]);
}
