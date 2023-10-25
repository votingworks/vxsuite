/* istanbul ignore file - tested via Mark/Mark-Scan */
import styled from 'styled-components';
import {
  LinkButton,
  Main,
  Screen,
  H1,
  WithScrollButtons,
  useScreenInfo,
  Prose,
} from '@votingworks/ui';

import { assert } from '@votingworks/basics';

import { ElectionDefinition, PrecinctId, VotesDict } from '@votingworks/types';
import { ButtonFooter } from '../components/button_footer';
import { Review, ReviewProps } from '../components/review';
import { ContestsWithMsEitherNeither } from '../utils/ms_either_neither_contests';
import { DisplaySettingsButton } from '../components/display_settings_button';

const ContentHeader = styled.div`
  padding: 0.5rem 0.75rem 0;
`;

export interface ReviewPageProps {
  contests: ContestsWithMsEitherNeither;
  electionDefinition?: ElectionDefinition;
  precinctId?: PrecinctId;
  printScreenUrl: string;
  returnToContest?: ReviewProps['returnToContest'];
  votes: VotesDict;
}

export function ReviewPage(props: ReviewPageProps): JSX.Element {
  const {
    contests,
    electionDefinition,
    precinctId,
    printScreenUrl,
    returnToContest,
    votes,
  } = props;

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
    <LinkButton to={printScreenUrl} id="next" variant="primary" icon="Done">
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
            returnToContest={returnToContest}
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
