import { singlePrecinctSelectionFor } from '@votingworks/utils';
import React, { useContext, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useHistory } from 'react-router-dom';
import { getPartyPrimaryAdjectiveFromBallotStyle } from '@votingworks/types';
import { Main, Screen, Prose, Button, H1, P } from '@votingworks/ui';

import pluralize from 'pluralize';
import { assert } from '@votingworks/basics';
import { BallotContext } from '../contexts/ballot_context';

import { Wobble } from '../components/animations';
import { ElectionInfo } from '../components/election_info';
import { Sidebar } from '../components/sidebar';
import { screenOrientation } from '../lib/screen_orientation';
import { DisplaySettingsButton } from '../components/display_settings_button';

const SidebarSpacer = styled.div`
  height: 90px;
`;

const Footer = styled.nav`
  background-color: #333333;
  padding: 60px 40px;
  color: #ffffff;
`;

const SettingsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  border: 1px solid #808080;
  border-width: 1px 0;
  padding: 1rem 0;
  gap: 2em;
`;

export function StartPage(): JSX.Element {
  const history = useHistory();
  const {
    ballotStyleId,
    contests,
    electionDefinition,
    machineConfig,
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
  const audioFocus = useRef<HTMLDivElement>(null);
  const { isLandscape, isPortrait } = screenOrientation(machineConfig);
  const { election } = electionDefinition;
  const { title } = election;
  const partyPrimaryAdjective = getPartyPrimaryAdjectiveFromBallotStyle({
    election,
    ballotStyleId,
  });

  function onStart() {
    forceSaveVote();
    history.push('/contests/0');
  }

  useEffect(() => {
    /* istanbul ignore next */
    audioFocus.current?.click();
  }, []);

  const settingsContainer = (
    <React.Fragment>
      <H1>Voter Settings</H1>
      <SettingsContainer>
        <DisplaySettingsButton />
      </SettingsContainer>
    </React.Fragment>
  );

  const startVotingButton = (
    <Wobble as="p">
      <Button
        large
        variant="primary"
        fullWidth={isLandscape}
        onPress={onStart}
        id="next"
        aria-label="Press the right button to advance to the first contest."
      >
        Start Voting
      </Button>
    </Wobble>
  );

  return (
    <Screen navRight={isLandscape} ref={audioFocus}>
      <Main centerChild padded>
        {isPortrait ? (
          <ElectionInfo
            electionDefinition={electionDefinition}
            ballotStyleId={ballotStyleId}
            precinctSelection={singlePrecinctSelectionFor(precinctId)}
            ariaHidden={false}
            contestCount={contests.length}
          />
        ) : (
          <Prose textCenter>
            <H1 aria-label={`${partyPrimaryAdjective} ${title}.`}>
              {partyPrimaryAdjective} {title}
            </H1>
            <hr />
            <P>
              <span>
                Your ballot has{' '}
                <strong>{pluralize('contest', contests.length, true)}</strong>.
              </span>
            </P>
            {settingsContainer}
          </Prose>
        )}
        <P className="screen-reader-only">
          When voting with the text-to-speech audio, use the accessible
          controller to navigate your ballot. To navigate through the contests,
          use the left and right buttons. To navigate through contest choices,
          use the up and down buttons. To select or unselect a contest choice as
          your vote, use the select button.
        </P>
      </Main>
      {isPortrait ? (
        <Footer>
          <Prose textCenter>
            {startVotingButton}
            {settingsContainer}
          </Prose>
        </Footer>
      ) : (
        <Sidebar
          footer={
            <ElectionInfo
              electionDefinition={electionDefinition}
              ballotStyleId={ballotStyleId}
              precinctSelection={singlePrecinctSelectionFor(precinctId)}
              horizontal
            />
          }
        >
          <Prose>
            <SidebarSpacer />
            {startVotingButton}
          </Prose>
        </Sidebar>
      )}
    </Screen>
  );
}
