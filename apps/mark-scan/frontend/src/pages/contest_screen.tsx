import React, { useCallback, useState } from 'react';

import { ContestPage } from '@votingworks/mark-flow-ui';
import { ContestId } from '@votingworks/types';

import { AccessibilityMode } from '@votingworks/ui';
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
  const [keyEventListenerWasUnbound, setKeyEventListenerWasUnbound] =
    useState(false);
  const { contests, electionDefinition, precinctId, updateVote, votes } =
    React.useContext(BallotContext);

  const isPatDeviceConnected = Boolean(
    api.getIsPatDeviceConnected.useQuery().data
  );

  // handleKeyboardEvent is defined in mark-scan and must be unbound here rather
  // than in libs/ui
  const onOpenWriteInKeyboard = useCallback(() => {
    /* istanbul ignore next - @preserve */
    if (!isPatDeviceConnected) {
      document.removeEventListener('keydown', handleKeyboardEvent);
      setKeyEventListenerWasUnbound(true);
    }
  }, [isPatDeviceConnected]);

  const onCloseWriteInKeyboard = useCallback(() => {
    // Use state instead of `isPatDeviceConnected` because the
    // PAT may have been disconnected mid-voting, but we still need to rebind
    /* istanbul ignore next - @preserve */
    if (keyEventListenerWasUnbound) {
      document.addEventListener('keydown', handleKeyboardEvent);
    }
  }, [keyEventListenerWasUnbound]);

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
      accessibilityMode={
        // Simultaneous PAT and controller usage is not supported
        isPatDeviceConnected
          ? AccessibilityMode.SWITCH_SCANNING
          : AccessibilityMode.ATI_CONTROLLER
      }
    />
  );
}
