import React, { useCallback } from 'react';

import { ContestPage } from '@votingworks/mark-flow-ui';
import { ContestId } from '@votingworks/types';

import * as api from '../api';
import { BallotContext } from '../contexts/ballot_context';
import { handleKeyboardEvent } from '../lib/assistive_technology';

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

  const isPatDeviceConnected = Boolean(
    api.getIsPatDeviceConnected.useQuery().data
  );

  // handleKeyboardEvent is defined in mark-scan and must be unbound here rather
  // than in libs/ui
  const onOpenWriteInKeyboard = useCallback(() => {
    document.removeEventListener('keydown', handleKeyboardEvent);
    // document.addEventListener('keydown', handleKeyboardEventForVirtualKeyboard);
  }, []);

  const onCloseWriteInKeyboard = useCallback(() => {
    // document.removeEventListener(
    //   'keydown',
    //   handleKeyboardEventForVirtualKeyboard
    // );
    document.addEventListener('keydown', handleKeyboardEvent);
  }, []);

  return (
    <ContestPage
      contests={contests}
      electionDefinition={electionDefinition}
      getContestUrl={getContestUrl}
      getReviewPageUrl={getReviewPageUrl}
      getStartPageUrl={getStartPageUrl}
      isPatDeviceConnected={isPatDeviceConnected}
      precinctId={precinctId}
      updateVote={updateVote}
      votes={votes}
      onOpenWriteInKeyboard={onOpenWriteInKeyboard}
      onCloseWriteInKeyboard={onCloseWriteInKeyboard}
      enableWriteInAtiControllerNavigation
    />
  );
}
