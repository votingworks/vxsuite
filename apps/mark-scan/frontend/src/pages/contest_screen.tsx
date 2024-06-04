import React from 'react';

import { ContestPage } from '@votingworks/mark-flow-ui';
import { ContestId } from '@votingworks/types';

import * as api from '../api';
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

function getStartPageUrl() {
  return '/';
}

export function ContestScreen(): JSX.Element {
  const { contests, electionDefinition, precinctId, updateVote, votes } =
    React.useContext(BallotContext);

  const isPathDeviceConnected = Boolean(
    api.getIsPatDeviceConnected.useQuery().data
  );

  return (
    <ContestPage
      contests={contests}
      electionDefinition={electionDefinition}
      getContestUrl={getContestUrl}
      getReviewPageUrl={getReviewPageUrl}
      getStartPageUrl={getStartPageUrl}
      isPatDeviceConnected={isPathDeviceConnected}
      precinctId={precinctId}
      updateVote={updateVote}
      votes={votes}
    />
  );
}
