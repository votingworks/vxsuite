import { useContext } from 'react';
import { useHistory } from 'react-router-dom';

import { ReviewPage } from '@votingworks/mark-flow-ui';

import { BallotContext } from '../contexts/ballot_context';

export function ReviewScreen(): JSX.Element {
  const history = useHistory();
  const { contests, electionDefinition, precinctId, ballotStyleId, votes } =
    useContext(BallotContext);

  return (
    <ReviewPage
      ballotStyleId={ballotStyleId}
      contests={contests}
      electionDefinition={electionDefinition}
      precinctId={precinctId}
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
