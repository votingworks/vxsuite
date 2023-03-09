import React, { useEffect } from 'react';
import styled from 'styled-components';
import {
  ElectionDefinition,
  PollsState,
  PrecinctSelection,
} from '@votingworks/types';
import {
  Main,
  Screen,
  TestMode,
  ElectionInfoBar,
  P,
  Caption,
  H1,
  InsertCardImage,
  TextSizeSelector,
  ColorModeSelector,
  Section,
} from '@votingworks/ui';

import { throwIllegalValue } from '@votingworks/basics';
import { triggerAudioFocus } from '../utils/trigger_audio_focus';

const SettingsContainer = styled(P)`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
`;

interface Props {
  appPrecinct: PrecinctSelection;
  electionDefinition: ElectionDefinition;
  showNoChargerAttachedWarning: boolean;
  isLiveMode: boolean;
  pollsState: PollsState;
  showNoAccessibleControllerWarning: boolean;
}

export function InsertCardScreen({
  appPrecinct,
  electionDefinition,
  showNoChargerAttachedWarning,
  isLiveMode,
  pollsState,
  showNoAccessibleControllerWarning,
}: Props): JSX.Element {
  useEffect(triggerAudioFocus, []);

  const mainText = (() => {
    switch (pollsState) {
      case 'polls_closed_initial':
        return (
          <React.Fragment>
            <H1 align="center">Polls Closed</H1>
            <P align="center">Insert Poll Worker card to open.</P>
          </React.Fragment>
        );
      case 'polls_open':
        return <H1 align="center">Insert Card</H1>;
      case 'polls_paused':
        return (
          <React.Fragment>
            <H1 align="center">Voting Paused</H1>
            <P align="center">Insert Poll Worker card to resume voting.</P>
          </React.Fragment>
        );
      case 'polls_closed_final':
        return (
          <React.Fragment>
            <H1 align="center">Polls Closed</H1>
            <P align="center">Voting is complete.</P>
          </React.Fragment>
        );
      /* istanbul ignore next - compile time check for completeness */
      default:
        throwIllegalValue(pollsState);
    }
  })();

  return (
    <Screen>
      {!isLiveMode && <TestMode />}
      <Main centerChild>
        <div id="audiofocus">
          {showNoChargerAttachedWarning && (
            <P align="center">
              <Caption color="warning">
                <strong>No Power Detected.</strong> Please ask a poll worker to
                plug in the power cord for this machine.
              </Caption>
            </P>
          )}
          <Section horizontalAlign="center">
            <InsertCardImage />
          </Section>
          <div>
            {mainText}
            {showNoAccessibleControllerWarning && (
              <P align="center">
                <Caption>
                  Voting with an accessible controller is not currently
                  available.
                </Caption>
              </P>
            )}
          </div>
        </div>
      </Main>
      <SettingsContainer>
        <TextSizeSelector />
        <ColorModeSelector />
      </SettingsContainer>
      <ElectionInfoBar
        electionDefinition={electionDefinition}
        precinctSelection={appPrecinct}
      />
    </Screen>
  );
}
