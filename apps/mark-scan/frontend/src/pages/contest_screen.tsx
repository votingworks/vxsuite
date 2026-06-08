import React from 'react';

import { ContestPage, useIsReviewMode } from '@votingworks/mark-flow-ui';
import { ContestId, isOpenPrimary } from '@votingworks/types';

import { AccessibilityMode } from '@votingworks/ui';
import { assertDefined } from '@votingworks/basics';
import * as api from '../api';
import { BallotContext } from '../contexts/ballot_context';
import { useVoterHelpScreen } from './use_voter_help_screen';

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

  // In open primaries, Back from the first contest returns to party selection
  // so the voter can choose or change their party — including when no party is
  // currently selected.
  function getStartPageUrl() {
    return isOpenPrimary(assertDefined(electionDefinition).election)
      ? '/party-selection'
      : '/';
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
