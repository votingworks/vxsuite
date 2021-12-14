import { assert } from '@votingworks/utils';
import React, { useContext, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useHistory } from 'react-router-dom';
import { getPartyPrimaryAdjectiveFromBallotStyle } from '@votingworks/types';
import { LinkButton, Main, MainChild } from '@votingworks/ui';

import pluralize from 'pluralize';
import { BallotContext } from '../contexts/ballot_context';

import { Wobble } from '../components/animations';
import { ElectionInfo } from '../components/election_info';
import { Prose } from '../components/prose';
import { Sidebar } from '../components/sidebar';
import { Screen } from '../components/screen';
import { SettingsTextSize } from '../components/settings_text_size';
import { PrecinctSelectionKind } from '../config/types';

const SidebarSpacer = styled.div`
  height: 90px;
`;

export function StartPage(): JSX.Element {
  const history = useHistory();
  const {
    ballotStyleId,
    contests,
    electionDefinition,
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
    audioFocus.current?.click();
  }, []);

  return (
    <Screen ref={audioFocus}>
      <Main>
        <MainChild center>
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
              <span className="screen-reader-only">
                When voting with the text-to-speech audio, use the accessible
                controller to navigate your ballot. To navigate through the
                contests, use the left and right buttons. To navigate through
                contest choices, use the up and down buttons. To select or
                unselect a contest choice as your vote, use the select button.
              </span>
            </p>
          </Prose>
        </MainChild>
      </Main>
      <Sidebar
        footer={
          <React.Fragment>
            <SettingsTextSize
              userSettings={userSettings}
              setUserSettings={setUserSettings}
            />
            <ElectionInfo
              electionDefinition={electionDefinition}
              ballotStyleId={ballotStyleId}
              precinctSelection={{
                kind: PrecinctSelectionKind.SinglePrecinct,
                precinctId,
              }}
              horizontal
            />
          </React.Fragment>
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
    </Screen>
  );
}
