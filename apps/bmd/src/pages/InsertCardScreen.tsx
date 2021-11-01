import React, { useEffect } from 'react';
import styled from 'styled-components';
import { ElectionDefinition } from '@votingworks/types';
import { Main, MainChild } from '@votingworks/ui';

import { Prose } from '../components/Prose';
import { Screen } from '../components/Screen';
import { Sidebar } from '../components/Sidebar';
import { TestMode } from '../components/TestMode';
import { Text } from '../components/Text';
import { ElectionInfo } from '../components/ElectionInfo';
import { MachineConfig, PrecinctSelection } from '../config/types';
import { VersionsData } from '../components/VersionsData';
import { triggerAudioFocus } from '../utils/triggerAudioFocus';

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
    <Screen flexDirection="row-reverse" white>
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
      <Main>
        <MainChild center>
          <Prose textCenter id="audiofocus">
            <TestMode isLiveMode={isLiveMode} />
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
                <h1 aria-hidden>Insert Card</h1>
                <p>Insert voter card to load ballot.</p>
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
        </MainChild>
      </Main>
    </Screen>
  );
}
