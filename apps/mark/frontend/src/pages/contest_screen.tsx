import React from 'react';

import { ContestPage } from '@votingworks/mark-flow-ui';

import { ContestId } from '@votingworks/types';
import { AccessibilityMode, useIsPatDeviceConnected } from '@votingworks/ui';
import { BallotContext } from '../contexts/ballot_context';
import { getSystemSettings } from '../api';

function getContestUrl(contestIndex: number) {
  return `/contests/${contestIndex}`;
}

function getReviewPageUrl(contestId?: ContestId) {
  if (contestId) {
    return `/review#contest-${contestId}`;
  }

  return '/review';
}

function getStartPageUrl() {
  return '/';
}

export function ContestScreen(): JSX.Element {
  const {
    ballotStyleId,
    contests,
    electionDefinition,
    precinctId,
    updateVote,
    votes,
  } = React.useContext(BallotContext);

  const isPatDeviceConnected = useIsPatDeviceConnected();
  const systemSettings = getSystemSettings.useQuery();

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
      allowOvervotes={systemSettings.data?.bmdAllowOvervotes}
    />
  );
}
