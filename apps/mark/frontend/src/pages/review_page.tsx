import React, { useContext } from 'react';
import styled from 'styled-components';
import {
  H2,
  LinkButton,
  Main,
  Prose,
  Screen,
  P,
  H1,
  WithScrollButtons,
} from '@votingworks/ui';

import { singlePrecinctSelectionFor } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { Review } from '@votingworks/mark-flow-ui';
import { useHistory } from 'react-router-dom';

import { BallotContext } from '../contexts/ballot_context';
import { Sidebar } from '../components/sidebar';
import { ElectionInfo } from '../components/election_info';
import { ButtonFooter } from '../components/button_footer';
import { screenOrientation } from '../lib/screen_orientation';
import { DisplaySettingsButton } from '../components/display_settings_button';

const ContentHeader = styled.div`
  padding: 0.5rem 0.75rem 0;
`;

const SidebarSpacer = styled.div`
  height: 90px;
`;

export function ReviewPage(): JSX.Element {
  const history = useHistory();
  const {
    contests,
    ballotStyleId,
    electionDefinition,
    machineConfig,
    precinctId,
    votes,
  } = useContext(BallotContext);
  const { isLandscape, isPortrait } = screenOrientation(machineConfig);

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
    <Screen navRight={isLandscape}>
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
      {isPortrait ? (
        <ButtonFooter>
          {settingsButton}
          {printMyBallotButton}
        </ButtonFooter>
      ) : (
        <Sidebar
          footer={
            <React.Fragment>
              <ButtonFooter>{settingsButton}</ButtonFooter>
              <ElectionInfo
                electionDefinition={electionDefinition}
                ballotStyleId={ballotStyleId}
                precinctSelection={singlePrecinctSelectionFor(precinctId)}
                horizontal
              />
            </React.Fragment>
          }
        >
          <SidebarSpacer />
          <Prose>
            <H2 aria-hidden>Review Votes</H2>
            <P>Confirm your votes are correct.</P>
            <P>{printMyBallotButton}</P>
          </Prose>
        </Sidebar>
      )}
    </Screen>
  );
}
