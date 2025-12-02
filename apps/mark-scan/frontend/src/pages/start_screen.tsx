import { useContext } from 'react';
import { useHistory } from 'react-router-dom';

import { StartPage } from '@votingworks/mark-flow-ui';
import { AssistiveTechInstructions, appStrings } from '@votingworks/ui';
import { BallotContext } from '../contexts/ballot_context';
import { useVoterHelpScreen } from './use_voter_help_screen';

export function StartScreen(): JSX.Element {
  const history = useHistory();
  const { ballotStyleId, contests, electionDefinition, precinctId } =
    useContext(BallotContext);
  const VoterHelpScreen = useVoterHelpScreen('StartScreen');

  function onStart() {
    history.push('/contests/0');
  }

  return (
    <StartPage
      contests={contests}
      onStart={onStart}
      ballotStyleId={ballotStyleId}
      electionDefinition={electionDefinition}
      introAudioText={
        <AssistiveTechInstructions
          controllerString={appStrings.instructionsBmdBallotNavigationMarkScan()}
          patDeviceString={appStrings.instructionsBmdBallotNavigationMarkScanPatDevice()}
        />
      }
      precinctId={precinctId}
      VoterHelpScreen={VoterHelpScreen}
    />
  );
}
