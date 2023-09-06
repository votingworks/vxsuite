import { useContext } from 'react';
import styled from 'styled-components';
import {
  LinkButton,
  Main,
  Prose,
  Screen,
  H1,
  WithScrollButtons,
  useScreenInfo,
} from '@votingworks/ui';

import { assert } from '@votingworks/basics';
import { Review } from '@votingworks/mark-flow-ui';
import { useHistory } from 'react-router-dom';

import { BallotContext } from '../contexts/ballot_context';
import { ButtonFooter } from '../components/button_footer';
import { DisplaySettingsButton } from '../components/display_settings_button';

const ContentHeader = styled.div`
  padding: 0.5rem 0.75rem 0;
`;

export function ReviewPage(): JSX.Element {
  const history = useHistory();
  const { contests, electionDefinition, precinctId, votes } =
    useContext(BallotContext);

  const screenInfo = useScreenInfo();

  assert(
    electionDefinition,
    'electionDefinition is required to render ReviewPage'
  );
  assert(
    typeof precinctId !== 'undefined',
    'precinctId is required to render ReviewPage'
  );

  const printMyBallotButton = (
    <LinkButton to="/print" id="next" variant="done">
      Print My Ballot
    </LinkButton>
  );

  const settingsButton = <DisplaySettingsButton />;

  return (
    <Screen navRight={!screenInfo.isPortrait}>
      <Main flexColumn>
        <ContentHeader>
          <Prose id="audiofocus">
            <H1>
              <span aria-label="Review Your Votes.">Review Your Votes</span>
              <span className="screen-reader-only">
                To review your votes, advance through the ballot contests using
                the up and down buttons. To change your vote in any contest, use
                the select button to navigate to that contest. When you are
                finished making your ballot selections and ready to print your
                ballot, use the right button to print your ballot.
              </span>
            </H1>
          </Prose>
        </ContentHeader>
        <WithScrollButtons>
          <Review
            election={electionDefinition.election}
            contests={contests}
            precinctId={precinctId}
            votes={votes}
            returnToContest={(contestId) => {
              history.push(
                `/contests/${contests.findIndex(
                  ({ id }) => id === contestId
                )}#review`
              );
            }}
          />
        </WithScrollButtons>
      </Main>
      <ButtonFooter>
        {settingsButton}
        {printMyBallotButton}
      </ButtonFooter>
    </Screen>
  );
}
