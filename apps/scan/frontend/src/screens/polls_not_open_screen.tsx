import React from 'react';
import { Section, Caption, Font, H1, Icons, P } from '@votingworks/ui';
import { PollsState } from '@votingworks/types';
import styled from 'styled-components';
import { ScreenMainCenterChild } from '../components/layout';

export interface PollsNotOpenScreenProps {
  isLiveMode: boolean;
  pollsState: Omit<PollsState, 'polls_open'>;
  showNoChargerWarning: boolean;
  scannedBallotCount?: number;
}

const StyledIconContainer = styled(Font)`
  font-size: 250px;
`;

export function PollsNotOpenScreen({
  isLiveMode,
  pollsState,
  showNoChargerWarning,
  scannedBallotCount,
}: PollsNotOpenScreenProps): JSX.Element {
  return (
    <ScreenMainCenterChild
      isLiveMode={isLiveMode}
      infoBarMode="pollworker"
      ballotCountOverride={scannedBallotCount}
    >
      <StyledIconContainer>
        {pollsState === 'polls_paused' ? <Icons.Paused /> : <Icons.Closed />}
      </StyledIconContainer>
      <Section horizontalAlign="center">
        <H1>
          {pollsState === 'polls_paused' ? 'Polls Paused' : 'Polls Closed'}
        </H1>
        {pollsState === 'polls_closed_final' ? (
          <P>Voting is complete.</P>
        ) : (
          <P>Insert a poll worker card to open polls.</P>
        )}
        {showNoChargerWarning && (
          <Caption align="center" color="warning">
            <Icons.Warning /> <Font weight="bold">No Power Detected.</Font>{' '}
            Please ask a poll worker to plug in the power cord.
          </Caption>
        )}
      </Section>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return (
    <PollsNotOpenScreen
      isLiveMode
      pollsState="polls_closed_initial"
      showNoChargerWarning={false}
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function DefaultTestModePreview(): JSX.Element {
  return (
    <PollsNotOpenScreen
      isLiveMode={false}
      pollsState="polls_closed_initial"
      showNoChargerWarning={false}
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function NoPowerConnectedPreview(): JSX.Element {
  return (
    <PollsNotOpenScreen
      isLiveMode
      pollsState="polls_closed_initial"
      showNoChargerWarning
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function PollsPausedPreview(): JSX.Element {
  return (
    <PollsNotOpenScreen
      isLiveMode
      pollsState="polls_paused"
      showNoChargerWarning={false}
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function PollsClosedFinalPreview(): JSX.Element {
  return (
    <PollsNotOpenScreen
      isLiveMode
      pollsState="polls_closed_final"
      showNoChargerWarning={false}
      scannedBallotCount={42}
    />
  );
}
