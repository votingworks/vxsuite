import React from 'react';

import { ContestPage } from '@votingworks/mark-flow-ui';
import { ContestId } from '@votingworks/types';

import { AccessibilityMode } from '@votingworks/ui';
import * as api from '../api';
import { BallotContext } from '../contexts/ballot_context';

/**
 * A cap to ensure that the summary ballot QR code remains readable
 */
const NUM_WRITE_IN_CHARACTERS_ALLOWED_ACROSS_CONTESTS = 60;

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

  const isPatDeviceConnected = Boolean(
    api.getIsPatDeviceConnected.useQuery().data
  );

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
      numWriteInCharactersAllowedAcrossContests={
        NUM_WRITE_IN_CHARACTERS_ALLOWED_ACROSS_CONTESTS
      }
    />
  );
}
