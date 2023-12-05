import { ElectionDefinition } from '@votingworks/types';
import { useCurrentLanguage } from '@votingworks/ui';
import { getRelatedBallotStyle } from '@votingworks/utils';
import React from 'react';

export interface BallotStyleManagerParams {
  currentBallotStyleId?: string;
  electionDefinition?: ElectionDefinition | null;
  updateCardlessVoterBallotStyle: (input: { ballotStyleId: string }) => unknown;
}

export function useBallotStyleManager(params: BallotStyleManagerParams): void {
  const {
    currentBallotStyleId,
    electionDefinition,
    updateCardlessVoterBallotStyle,
  } = params;

  const currentLanguage = useCurrentLanguage();
  React.useEffect(() => {
    if (!currentBallotStyleId || !electionDefinition) {
      return;
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
    updateCardlessVoterBallotStyle,
  ]);
}
