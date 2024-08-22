/* istanbul ignore file - tested via Mark/Mark-Scan */
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import styled, { keyframes } from 'styled-components';
import {
  Button,
  appStrings,
  AudioOnly,
  ReadOnLoad,
  PageNavigationButtonId,
} from '@votingworks/ui';

import { assert } from '@votingworks/basics';

import {
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
} from '@votingworks/types';
import { ElectionInfo } from '../components/election_info';
import { ContestsWithMsEitherNeither } from '../utils/ms_either_neither_contests';
import { VoterScreen } from '../components/voter_screen';

const wobbleKeyframes = keyframes`
  0%, 93% { transform: rotate(0deg); }
  94% { transform: rotate(-5deg); }
  95% { transform: rotate(10deg); }
  96% { transform: rotate(-3deg); }
  97% { transform: rotate(6deg); }
  98% { transform: rotate(-1deg); }
  99% { transform: rotate(2deg); }
`;

const StartVotingButton = styled(Button)`
  font-size: 1.2rem;
  line-height: 2rem;
  animation: ${wobbleKeyframes} 10s linear infinite;
`;

export interface StartPageProps {
  introAudioText: React.ReactNode;
  ballotStyleId?: BallotStyleId;
  contests: ContestsWithMsEitherNeither;
  electionDefinition?: ElectionDefinition;
  onStart: () => void;
  precinctId?: PrecinctId;
}

export function StartPage(props: StartPageProps): JSX.Element {
  const {
    ballotStyleId,
    contests,
    electionDefinition,
    introAudioText,
    precinctId,
    onStart,
  } = props;

  assert(
    electionDefinition,
    'electionDefinition is required to render StartPage'
  );
  assert(
    typeof precinctId !== 'undefined',
    'precinctId is required to render StartPage'
  );
  assert(
    typeof ballotStyleId !== 'undefined',
    'ballotStyleId is required to render StartPage'
  );

  const startVotingButton = (
    <StartVotingButton
      variant="primary"
      onPress={onStart}
      id={PageNavigationButtonId.NEXT}
      rightIcon="Next"
    >
      {appStrings.buttonStartVoting()}
    </StartVotingButton>
  );

  return (
    <VoterScreen padded>
      <div style={{ margin: 'auto', padding: '0.5rem' }}>
        <ReadOnLoad>
          <ElectionInfo
            electionDefinition={electionDefinition}
            ballotStyleId={ballotStyleId}
            precinctSelection={singlePrecinctSelectionFor(precinctId)}
            contestCount={contests.length}
          />
          <AudioOnly>{introAudioText}</AudioOnly>
        </ReadOnLoad>
        {startVotingButton}
      </div>
    </VoterScreen>
  );
}
