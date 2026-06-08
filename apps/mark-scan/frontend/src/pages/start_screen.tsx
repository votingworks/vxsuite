import { useContext } from 'react';
import { useHistory } from 'react-router-dom';

import { StartPage } from '@votingworks/mark-flow-ui';
import { AssistiveTechInstructions, appStrings } from '@votingworks/ui';
import { isOpenPrimary } from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { BallotContext } from '../contexts/ballot_context';
import { useVoterHelpScreen } from './use_voter_help_screen';

export function StartScreen(): JSX.Element {
  const history = useHistory();
  const { ballotStyleId, electionDefinition, precinctId } =
    useContext(BallotContext);
  const VoterHelpScreen = useVoterHelpScreen('StartScreen');

  function onStart() {
    if (isOpenPrimary(assertDefined(electionDefinition).election)) {
      history.push('/party-selection');
    } else {
      history.push('/contests/0');
    }
  }

  return (
    <StartPage
      onStart={onStart}
      ballotStyleId={ballotStyleId}
      electionDefinition={electionDefinition}
      introAudioText={
        <AssistiveTechInstructions
          controllerString={appStrings.instructionsBmdBallotNavigationMarkScan()}
          patDeviceString={appStrings.instructionsBmdBallotNavigationMarkScanPatDevice()}
        />
      }
      repeatIntroAudioPrompt={
        <AssistiveTechInstructions
          controllerString={appStrings.instructionsBmdIntroRepeatPromptMarkScan()}
          patDeviceString={appStrings.instructionsBmdIntroRepeatPromptMarkScanPatDevice()}
        />
      }
      precinctId={precinctId}
      VoterHelpScreen={VoterHelpScreen}
    />
  );
}
