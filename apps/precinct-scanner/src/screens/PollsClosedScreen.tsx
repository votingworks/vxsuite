import React from 'react';
import { TestMode, Text } from '@votingworks/ui';
import { DoNotEnter } from '../components/Graphics';
import { CenteredLargeProse, CenteredScreen } from '../components/Layout';

interface Props {
  isLiveMode: boolean;
  showNoChargerWarning: boolean;
}

export function PollsClosedScreen({
  isLiveMode,
  showNoChargerWarning,
}: Props): JSX.Element {
  return (
    <CenteredScreen>
      <TestMode isLiveMode={isLiveMode} />
      {showNoChargerWarning && (
        <Text warning small center>
          <strong>No Power Detected.</strong> Please ask a poll worker to plug
          in the power cord for this machine.
        </Text>
      )}
      <DoNotEnter />
      <CenteredLargeProse>
        <h1>Polls Closed</h1>
        <p>Insert a Poll Worker Card to Open Polls.</p>
      </CenteredLargeProse>
    </CenteredScreen>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <PollsClosedScreen isLiveMode showNoChargerWarning={false} />;
}

/* istanbul ignore next */
export function DefaultTestModePreview(): JSX.Element {
  return <PollsClosedScreen isLiveMode={false} showNoChargerWarning={false} />;
}

/* istanbul ignore next */
export function NoPowerConnectedLivePreview(): JSX.Element {
  return <PollsClosedScreen isLiveMode showNoChargerWarning />;
}

/* istanbul ignore next */
export function NoPowerConnectedTestModePreview(): JSX.Element {
  return <PollsClosedScreen isLiveMode={false} showNoChargerWarning />;
}
