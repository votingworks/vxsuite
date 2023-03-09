import { singlePrecinctSelectionFor } from '@votingworks/utils';
import React, { useContext, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useHistory } from 'react-router-dom';
import { getPartyPrimaryAdjectiveFromBallotStyle } from '@votingworks/types';
import {
  Button,
  Main,
  Screen,
  Prose,
  H1,
  P,
  Font,
  H2,
  H3,
  H4,
  TextSizeSelector,
  ColorModeSelector,
  UiThemeManagerContext,
} from '@votingworks/ui';

import pluralize from 'pluralize';
import { assert } from '@votingworks/basics';
import { BallotContext } from '../contexts/ballot_context';

import { Wobble } from '../components/animations';
import { ElectionInfo } from '../components/election_info';
import { Sidebar } from '../components/sidebar';
import { screenOrientation } from '../lib/screen_orientation';

const SidebarSpacer = styled.div`
  height: 90px;
`;

const Footer = styled.nav`
  /* background-color: #333333; */
  border-top: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.foreground};
  /* box-shadow: 0 -0rem 0.5rem ${(p) => p.theme.colors.foreground}; */
  padding: 0.125rem 0.25rem 0.25rem;
`;

const SettingsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.25rem;
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
    votes,
  } = useContext(BallotContext);
  const { setColorMode, setSizeMode } = React.useContext(UiThemeManagerContext);
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

    if (!votes || Object.entries(votes).length === 0) {
      setColorMode('contrastMedium');
      setSizeMode('m');
    } else {
      console.warn(votes);
    }
  }, []);

  const settingsContainer = (
    <SettingsContainer>
      <TextSizeSelector />
      <ColorModeSelector />
    </SettingsContainer>
  );

  const startVotingButton = (
    <Wobble as="p">
      <Button
        fullWidth={isLandscape}
        onPress={onStart}
        aria-label="Press the right button to advance to the first contest."
        variant="next"
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
          <React.Fragment>
            <H1
              align="center"
              aria-label={`${partyPrimaryAdjective} ${title}.`}
            >
              {partyPrimaryAdjective} {title}
            </H1>
            <hr />
            <P align="center">
              Your ballot has{' '}
              <Font weight="bold">
                {pluralize('contest', contests.length, true)}
              </Font>
              .
            </P>
            {settingsContainer}
          </React.Fragment>
        )}
        <P className="screen-reader-only">
          When voting with the text-to-speech audio, use the accessible
          controller to navigate your ballot. To navigate through the contests,
          use the left and right buttons. To navigate through contest choices,
          use the up and down buttons. To select or unselect a contest choice as
          your vote, use the select button.
        </P>
        {isPortrait && <React.Fragment>{startVotingButton}</React.Fragment>}
      </Main>
      {isPortrait ? (
        <Footer>{settingsContainer}</Footer>
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
