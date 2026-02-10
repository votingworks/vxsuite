import { useContext } from 'react';
import { useHistory, useLocation } from 'react-router-dom';

import { ReviewPage } from '@votingworks/mark-flow-ui';

import { BallotContext } from '../contexts/ballot_context';

export function ReviewScreen(): JSX.Element {
  const history = useHistory();
  const location = useLocation();
  const { contests, electionDefinition, precinctId, ballotStyleId, votes } =
    useContext(BallotContext);

  const searchParams = new URLSearchParams(location.search);
  const fromContest = searchParams.get('fromContest');
  const isFinalReview = !fromContest;
  const backUrl = !isFinalReview ? `/contests/${fromContest}` : undefined;

  return (
    <ReviewPage
      backUrl={backUrl}
      ballotStyleId={ballotStyleId}
      contests={contests}
      electionDefinition={electionDefinition}
      precinctId={precinctId}
      printScreenUrl="/print"
      returnToContest={(contestId) => {
        const contestIndex = contests.findIndex(({ id }) => id === contestId);
        history.push(
          isFinalReview
            ? `/contests/${contestIndex}#review`
            : `/contests/${contestIndex}`
        );
      }}
      votes={votes}
    />
  );
}
