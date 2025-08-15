import React from 'react';

import { ContestPage } from '@votingworks/mark-flow-ui';

import { ContestId, SystemSettings } from '@votingworks/types';
import { PrintMode } from '@votingworks/mark-backend';
import { isIntegrationTest } from '@votingworks/utils';
import { AccessibilityMode } from '@votingworks/ui';
import { BallotContext } from '../contexts/ballot_context';
import { getPrintMode, getSystemSettings } from '../api';

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

export function ContestScreen(): React.ReactNode {
  const { contests, electionDefinition, precinctId, updateVote, votes } =
    React.useContext(BallotContext);

  let printMode: PrintMode | undefined;
  let settings: SystemSettings | undefined;

  /* istanbul ignore next - @preserve */
  if (!isIntegrationTest() && process.env.NODE_ENV !== 'test') {
    printMode = getPrintMode.useQuery().data;
    settings = getSystemSettings.useQuery().data;

    if (!settings || !printMode) return null;
  }

  return (
    <ContestPage
      // [TODO] Conditionally use AccessibilityMode.SWITCH_SCANNING when PAT
      // input is detected.
      accessibilityMode={AccessibilityMode.ATI_CONTROLLER}
      allowCandidateOvervotes={
        // Only allow overvotes when marking pre-printed ballots, since summary
        // ballot QR codes are can't encode overvotes at the moment.
        settings?.bmdAllowOvervotes && printMode === 'bubble_marks'
      }
      contests={contests}
      electionDefinition={electionDefinition}
      getContestUrl={getContestUrl}
      getReviewPageUrl={getReviewPageUrl}
      getStartPageUrl={getStartPageUrl}
      precinctId={precinctId}
      updateVote={updateVote}
      votes={votes}
    />
  );
}
