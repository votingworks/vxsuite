import { singlePrecinctSelectionFor } from '@votingworks/utils';
import { useContext } from 'react';
import styled from 'styled-components';
import { useHistory } from 'react-router-dom';
import { Screen, Button, Icons, appStrings, AudioOnly } from '@votingworks/ui';

import { assert } from '@votingworks/basics';
import { BallotContext } from '../contexts/ballot_context';

import { Wobble } from '../components/animations';
import { ElectionInfo } from '../components/election_info';
import { DisplaySettingsButton } from '../components/display_settings_button';

const Body = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 1rem;
  justify-content: center;
  padding: 0.5rem;
`;

const ElectionInfoContainer = styled.div`
  @media (orientation: portrait) {
    text-align: center;
  }
`;

const StartVotingButtonContainer = styled.div`
  display: flex;
  justify-content: center;
`;

const Footer = styled.div`
  align-items: center;
  border-top: ${(p) => p.theme.sizes.bordersRem.thick}rem solid
    ${(p) => p.theme.colors.foreground};
  display: flex;
  gap: 1rem;
  justify-content: center;
  padding: 0.5rem;
`;

const LargeButtonText = styled.span`
  font-size: 50px;
  line-height: 2;
  padding: 0 1rem;
`;

export function StartPage(): JSX.Element {
  const history = useHistory();
  const {
    ballotStyleId,
    contests,
    electionDefinition,
    precinctId,
    forceSaveVote,
  } = useContext(BallotContext);
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

  function onStart() {
    forceSaveVote();
    history.push('/contests/0');
  }

  const startVotingButton = (
    <Wobble>
      <Button variant="primary" onPress={onStart} id="next">
        <LargeButtonText>
          <Icons.Next /> {appStrings.buttonStartVoting()}
        </LargeButtonText>
      </Button>
    </Wobble>
  );

  return (
    <Screen>
      <Body>
        {/* TODO(kofi): Create a component for this 'audiofocus' functionality */}
        <div id="audiofocus">
          <ElectionInfoContainer>
            <ElectionInfo
              electionDefinition={electionDefinition}
              ballotStyleId={ballotStyleId}
              precinctSelection={singlePrecinctSelectionFor(precinctId)}
              contestCount={contests.length}
            />
          </ElectionInfoContainer>
          <AudioOnly>{appStrings.instructionsBmdBallotNavigation()}</AudioOnly>
        </div>
        <StartVotingButtonContainer>
          {startVotingButton}
        </StartVotingButtonContainer>
      </Body>
      <Footer>
        <DisplaySettingsButton />
      </Footer>
    </Screen>
  );
}
