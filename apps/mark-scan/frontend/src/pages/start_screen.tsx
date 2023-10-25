import { useContext } from 'react';
import { useHistory } from 'react-router-dom';

import { StartPage } from '@votingworks/mark-flow-ui';
import { BallotContext } from '../contexts/ballot_context';

export function StartScreen(): JSX.Element {
  const history = useHistory();
  const {
    ballotStyleId,
    contests,
    electionDefinition,
    precinctId,
    forceSaveVote,
  } = useContext(BallotContext);

  function onStart() {
    forceSaveVote();
    history.push('/contests/0');
  }

  return (
    <StartPage
      contests={contests}
      onStart={onStart}
      ballotStyleId={ballotStyleId}
      electionDefinition={electionDefinition}
      precinctId={precinctId}
    />
  );
}
