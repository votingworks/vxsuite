import React, { useEffect } from 'react';
import styled from 'styled-components';
import { ElectionDefinition, PrecinctSelection } from '@votingworks/types';
import { Main, Screen, Prose, TestMode, Text } from '@votingworks/ui';

import { Sidebar } from '../components/sidebar';
import { ElectionInfo } from '../components/election_info';
import { MachineConfig } from '../config/types';
import { VersionsData } from '../components/versions_data';
import { triggerAudioFocus } from '../utils/trigger_audio_focus';

const InsertCardImage = styled.img`
  margin: 0 auto -1rem;
  height: 30vw;
`;

interface Props {
  appPrecinct: PrecinctSelection;
  electionDefinition: ElectionDefinition;
  showNoChargerAttachedWarning: boolean;
  isLiveMode: boolean;
  isPollsOpen: boolean;
  showNoAccessibleControllerWarning: boolean;
  machineConfig: MachineConfig;
}

export function InsertCardScreen({
  appPrecinct,
  electionDefinition,
  showNoChargerAttachedWarning,
  isLiveMode,
  isPollsOpen,
  showNoAccessibleControllerWarning,
  machineConfig,
}: Props): JSX.Element {
  useEffect(triggerAudioFocus, []);
  return (
    <Screen navRight white>
      <Main centerChild>
        {!isLiveMode && <TestMode />}
        <Prose textCenter id="audiofocus">
          {showNoChargerAttachedWarning && (
            <Text warning small>
              <strong>No Power Detected.</strong> Please ask a poll worker to
              plug in the power cord for this machine.
            </Text>
          )}
          <p>
            <InsertCardImage
              aria-hidden
              src="/images/insert-card.svg"
              alt="Insert Card Diagram"
            />
          </p>
          {isPollsOpen ? (
            <React.Fragment>
              <h1>Insert Card</h1>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <h1>Polls Closed</h1>
              <p>Insert Poll Worker card to open.</p>
            </React.Fragment>
          )}
          {showNoAccessibleControllerWarning && (
            <Text muted small>
              Voting with an accessible controller is not currently available.
            </Text>
          )}
        </Prose>
      </Main>
      <Sidebar>
        <ElectionInfo
          electionDefinition={electionDefinition}
          precinctSelection={appPrecinct}
        />
        <VersionsData
          machineConfig={machineConfig}
          electionHash={electionDefinition.electionHash}
        />
      </Sidebar>
    </Screen>
  );
}
