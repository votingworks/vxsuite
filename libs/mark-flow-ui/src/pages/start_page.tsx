/* istanbul ignore file - tested via Mark/Mark-Scan */
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import styled from 'styled-components';
import {
  Screen,
  Button,
  appStrings,
  AudioOnly,
  Wobble,
  ReadOnLoad,
} from '@votingworks/ui';

import { assert } from '@votingworks/basics';

import {
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
} from '@votingworks/types';
import { ElectionInfo } from '../components/election_info';
import { DisplaySettingsButton } from '../components/display_settings_button';
import { ContestsWithMsEitherNeither } from '../utils/ms_either_neither_contests';

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

const StartVotingButton = styled(Button)`
  font-size: 1.2rem;
  line-height: 2rem;
`;

const Footer = styled.div`
  align-items: center;
  border-top: ${(p) => p.theme.sizes.bordersRem.thick}rem solid
    ${(p) => p.theme.colors.outline};
  display: flex;
  gap: 1rem;
  justify-content: center;
  padding: 0.5rem;
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
        id="next"
        rightIcon="Next"
      >
        {appStrings.buttonStartVoting()}
      </StartVotingButton>
    </Wobble>
  );

  return (
    <Screen>
      <Body>
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
      </Body>
      <Footer>
        <DisplaySettingsButton />
      </Footer>
    </Screen>
  );
}
