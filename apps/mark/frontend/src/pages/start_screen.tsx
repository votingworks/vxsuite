import { StartPage } from '@votingworks/mark-flow-ui';
import React from 'react';
import { useHistory } from 'react-router-dom';
import { appStrings } from '@votingworks/ui';
import { assertDefined } from '@votingworks/basics';
import { BallotContext } from '../contexts/ballot_context';

export function StartScreen(): JSX.Element {
  const history = useHistory();
  const { ballotStyleId, contests, electionDefinition, precinctId } =
    React.useContext(BallotContext);

  function onStart() {
    if (assertDefined(electionDefinition).election.type === 'open-primary') {
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
      repeatIntroAudioPrompt={appStrings.instructionsBmdIntroRepeatPromptMark()}
      precinctId={precinctId}
    />
  );
}
