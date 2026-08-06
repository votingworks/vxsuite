import React from 'react';

import { ContestPage, useIsReviewMode } from '@votingworks/mark-flow-ui';
import { ContestId } from '@votingworks/types';

import { AccessibilityMode } from '@votingworks/ui';
import * as api from '../api.js';
import { BallotContext } from '../contexts/ballot_context.js';
import { useVoterHelpScreen } from './use_voter_help_screen.js';

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
  const isReviewMode = useIsReviewMode();
  const VoterHelpScreen = useVoterHelpScreen(
    isReviewMode ? 'ContestReviewScreen' : 'ContestScreen'
  );

  const isPatDeviceConnected = Boolean(
    api.getIsPatDeviceConnected.useQuery().data
  );

  // In combined ballot primaries, Back from the first contest returns to party selection so the
  // voter can change their party. `selectedPartyId` being set implies the
  // voter came from the party selection screen.
  function getStartPageUrl() {
    return selectedPartyId ? '/party-selection' : '/';
  }

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
      VoterHelpScreen={VoterHelpScreen}
    />
  );
}
