import { useContext } from 'react';

import { ReviewPage } from '@votingworks/mark-flow-ui';
import { useHistory } from 'react-router-dom';

import { BallotContext } from '../contexts/ballot_context';
import { uiStringsApi } from '../api';

export function ReviewScreen(): JSX.Element {
  const history = useHistory();
  const { contests, electionDefinition, precinctId, votes } =
    useContext(BallotContext);

  return (
    <ReviewPage
      contests={contests}
      electionDefinition={electionDefinition}
      precinctId={precinctId}
      printScreenUrl="/print"
      returnToContest={(contestId) => {
        history.push(
          `/contests/${contests.findIndex(({ id }) => id === contestId)}#review`
        );
      }}
      uiStringsApi={uiStringsApi}
      votes={votes}
    />
  );
}
