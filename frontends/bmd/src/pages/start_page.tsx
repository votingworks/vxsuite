import { assert, singlePrecinctSelectionFor } from '@votingworks/utils';
import React, { useContext, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useHistory } from 'react-router-dom';
import { getPartyPrimaryAdjectiveFromBallotStyle } from '@votingworks/types';
import { LinkButton, Main, Screen, Prose } from '@votingworks/ui';

import pluralize from 'pluralize';
import { BallotContext } from '../contexts/ballot_context';

import { Wobble } from '../components/animations';
import { ElectionInfo } from '../components/election_info';
import { Sidebar } from '../components/sidebar';
import { SettingsTextSize } from '../components/settings_text_size';
import { screenOrientation } from '../lib/screen_orientation';

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
    setUserSettings,
    userSettings,
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

  return (
    <Screen navRight={isLandscape} ref={audioFocus}>
      <Main centerChild padded>
        {isPortrait && (
          <ElectionInfo
            electionDefinition={electionDefinition}
            ballotStyleId={ballotStyleId}
            precinctSelection={singlePrecinctSelectionFor(precinctId)}
            ariaHidden={false}
            contestCount={contests.length}
          />
        )}
        {isLandscape && (
          <Prose textCenter>
            <h1 aria-label={`${partyPrimaryAdjective} ${title}.`}>
              {partyPrimaryAdjective} {title}
            </h1>
            <hr />
            <p>
              <span>
                Your ballot has{' '}
                <strong>{pluralize('contest', contests.length, true)}</strong>.
              </span>
            </p>
            <SettingsContainer>
              <SettingsTextSize
                userSettings={userSettings}
                setUserSettings={setUserSettings}
              />
            </SettingsContainer>
          </Prose>
        )}
        <p className="screen-reader-only">
          When voting with the text-to-speech audio, use the accessible
          controller to navigate your ballot. To navigate through the contests,
          use the left and right buttons. To navigate through contest choices,
          use the up and down buttons. To select or unselect a contest choice as
          your vote, use the select button.
        </p>
      </Main>
      {isPortrait ? (
        <Footer>
          <Prose textCenter>
            <Wobble as="p">
              <LinkButton
                large
                primary
                fullWidth
                onPress={onStart}
                id="next"
                aria-label="Press the right button to advance to the first contest."
              >
                Start Voting
              </LinkButton>
            </Wobble>
            <h1>Voter Settings</h1>
            <SettingsContainer>
              <SettingsTextSize
                userSettings={userSettings}
                setUserSettings={setUserSettings}
              />
            </SettingsContainer>
          </Prose>
        </Footer>
      ) : (
        <Sidebar
          footer={
            isLandscape && (
              <ElectionInfo
                electionDefinition={electionDefinition}
                ballotStyleId={ballotStyleId}
                precinctSelection={singlePrecinctSelectionFor(precinctId)}
                horizontal
              />
            )
          }
        >
          <Prose>
            <SidebarSpacer />
            <Wobble as="p">
              <LinkButton
                large
                primary
                onPress={onStart}
                id="next"
                aria-label="Press the right button to advance to the first contest."
              >
                Start Voting
              </LinkButton>
            </Wobble>
          </Prose>
        </Sidebar>
      )}
    </Screen>
  );
}
