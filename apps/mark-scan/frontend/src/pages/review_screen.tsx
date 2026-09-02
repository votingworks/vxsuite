import { useContext } from 'react';

import { ReviewPage } from '@votingworks/mark-flow-ui';
import { useHistory, useLocation } from 'react-router-dom';
import { assertDefined } from '@votingworks/basics';

import { BallotContext } from '../contexts/ballot_context.js';
import { useVoterHelpScreen } from './use_voter_help_screen.js';

export function ReviewScreen(): JSX.Element {
  const history = useHistory();
  const location = useLocation();
  const {
    contests,
    electionDefinition,
    ballotStyleId,
    precinctId,
    selectedPartyId,
    votes,
  } = useContext(BallotContext);
  const VoterHelpScreen = useVoterHelpScreen('PrePrintReviewScreen');

  const searchParams = new URLSearchParams(location.search);
  const fromContest = searchParams.get('fromContest');
  const isViewAllMode = !!fromContest;
  const backUrl = fromContest ? `/contests/${fromContest}` : undefined;
  const partySelectionScreenUrl = selectedPartyId
    ? `/party-selection${!isViewAllMode ? '#review' : ''}`
    : undefined;

  return (
    <ReviewPage
      backUrl={backUrl}
      contests={contests}
      electionDefinition={assertDefined(electionDefinition)}
      precinctId={precinctId}
      ballotStyleId={ballotStyleId}
      printScreenUrl="/print"
      returnToContest={(contestId) => {
        const contestIndex = contests.findIndex(({ id }) => id === contestId);
        history.push(
          // @coverage-defer
          isViewAllMode
            ? `/contests/${contestIndex}`
            : `/contests/${contestIndex}#review`
        );
      }}
      votes={votes}
      selectedPartyId={selectedPartyId}
      partySelectionScreenUrl={partySelectionScreenUrl}
      VoterHelpScreen={VoterHelpScreen}
    />
  );
}
