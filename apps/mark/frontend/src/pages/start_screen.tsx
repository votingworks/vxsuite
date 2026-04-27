import { StartPage } from '@votingworks/mark-flow-ui';
import React from 'react';
import { useHistory } from 'react-router-dom';
import { appStrings } from '@votingworks/ui';
import { isOpenPrimary } from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { BallotContext } from '../contexts/ballot_context';

export function StartScreen(): JSX.Element {
  const history = useHistory();
  const { ballotStyleId, contests, electionDefinition, precinctId } =
    React.useContext(BallotContext);

  function onStart() {
    if (isOpenPrimary(assertDefined(electionDefinition).election)) {
      history.push('/party-selection');
    } else {
      history.push('/contests/0');
    }
  }

  return (
    <StartPage
      contests={contests}
      onStart={onStart}
      ballotStyleId={ballotStyleId}
      electionDefinition={electionDefinition}
      introAudioText={appStrings.instructionsBmdBallotNavigationMark()}
      precinctId={precinctId}
    />
  );
}
