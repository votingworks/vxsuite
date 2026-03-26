import React from 'react';

import { ContestPage } from '@votingworks/mark-flow-ui';

import { ContestId } from '@votingworks/types';
import { AccessibilityMode, useIsPatDeviceConnected } from '@votingworks/ui';
import { BallotContext } from '../contexts/ballot_context';

function getContestUrl(contestIndex: number) {
  return `/contests/${contestIndex}`;
}

function getReviewPageUrl(contestId?: ContestId) {
  if (contestId) {
    return `/review#contest-${contestId}`;
  }

  return '/review';
}

export function ContestScreen(): JSX.Element {
  const {
    ballotStyleId,
    contests,
    electionDefinition,
    precinctId,
    selectedPartyId,
    updateVote,
    votes,
  } = React.useContext(BallotContext);

  function getStartPageUrl() {
    return selectedPartyId ? '/party-selection' : '/';
  }

  const isPatDeviceConnected = useIsPatDeviceConnected();

  return (
    <ContestPage
      ballotStyleId={ballotStyleId}
      contests={contests}
      electionDefinition={electionDefinition}
      getContestUrl={getContestUrl}
      getReviewPageUrl={getReviewPageUrl}
      getStartPageUrl={getStartPageUrl}
      isPatDeviceConnected={isPatDeviceConnected}
      precinctId={precinctId}
      updateVote={updateVote}
      votes={votes}
      accessibilityMode={
        // Simultaneous PAT and controller usage is not supported
        isPatDeviceConnected
          ? AccessibilityMode.SWITCH_SCANNING
          : AccessibilityMode.ATI_CONTROLLER
      }
    />
  );
}
