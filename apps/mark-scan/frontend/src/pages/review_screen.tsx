import { useContext } from 'react';

import { ReviewPage } from '@votingworks/mark-flow-ui';
import { useHistory } from 'react-router-dom';

import { BallotContext } from '../contexts/ballot_context';

export function ReviewScreen(): JSX.Element {
  const history = useHistory();
  const { contests, electionDefinition, ballotStyleId, precinctId, votes } =
    useContext(BallotContext);

  return (
    <ReviewPage
      contests={contests}
      electionDefinition={electionDefinition}
      precinctId={precinctId}
      ballotStyleId={ballotStyleId}
      printScreenUrl="/print"
      returnToContest={(contestId) => {
        history.push(
          `/contests/${contests.findIndex(({ id }) => id === contestId)}#review`
        );
      }}
      votes={votes}
    />
  );
}
