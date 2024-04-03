/* istanbul ignore file - tested via Mark/Mark-Scan */
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import styled from 'styled-components';
import {
  Button,
  appStrings,
  AudioOnly,
  Wobble,
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

const ElectionInfoContainer = styled.div`
  @media (orientation: portrait) {
    text-align: center;
  }
`;

const StartVotingButtonContainer = styled.div`
  display: flex;
  justify-content: center;
`;

const StartVotingButton = styled(Button)`
  font-size: 1.2rem;
  line-height: 2rem;
`;

export interface StartPageProps {
  ballotStyleId?: BallotStyleId;
  contests: ContestsWithMsEitherNeither;
  electionDefinition?: ElectionDefinition;
  onStart: () => void;
  precinctId?: PrecinctId;
}

export function StartPage(props: StartPageProps): JSX.Element {
  const { ballotStyleId, contests, electionDefinition, precinctId, onStart } =
    props;

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
    <Wobble>
      <StartVotingButton
        variant="primary"
        onPress={onStart}
        id={PageNavigationButtonId.NEXT}
        rightIcon="Next"
      >
        {appStrings.buttonStartVoting()}
      </StartVotingButton>
    </Wobble>
  );

  return (
    <VoterScreen centerContent padded>
      <ReadOnLoad>
        <ElectionInfoContainer>
          <ElectionInfo
            electionDefinition={electionDefinition}
            ballotStyleId={ballotStyleId}
            precinctSelection={singlePrecinctSelectionFor(precinctId)}
            contestCount={contests.length}
          />
        </ElectionInfoContainer>
        <AudioOnly>{appStrings.instructionsBmdBallotNavigation()}</AudioOnly>
      </ReadOnLoad>
      <StartVotingButtonContainer>
        {startVotingButton}
      </StartVotingButtonContainer>
    </VoterScreen>
  );
}
