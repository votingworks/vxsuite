import React from 'react';
import { Caption, Font, Icons, InsertBallotImage, P } from '@votingworks/ui';
import { Screen } from '../components/layout';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';

interface Props {
  isLiveMode: boolean;
  scannedBallotCount: number;
  showNoChargerWarning: boolean;
}

export function InsertBallotScreen({
  isLiveMode,
  scannedBallotCount,
  showNoChargerWarning,
}: Props): JSX.Element {
  return (
    <Screen
      centerContent
      isLiveMode={isLiveMode}
      ballotCountOverride={scannedBallotCount}
    >
      <FullScreenPromptLayout
        title="Insert Your Ballot Above"
        image={<InsertBallotImage ballotFeedLocation="top" />}
      >
        <P>Scan one ballot sheet at a time.</P>
        {showNoChargerWarning && (
          <Caption color="warning">
            <Icons.Warning /> <Font weight="bold">No Power Detected.</Font>{' '}
            Please ask a poll worker to plug in the power cord.
          </Caption>
        )}
      </FullScreenPromptLayout>
    </Screen>
  );
}

/* istanbul ignore next */
export function ZeroBallotsScannedPreview(): JSX.Element {
  return (
    <InsertBallotScreen
      scannedBallotCount={0}
      isLiveMode
      showNoChargerWarning={false}
    />
  );
}

/* istanbul ignore next */
export function ManyBallotsScannedPreview(): JSX.Element {
  return (
    <InsertBallotScreen
      scannedBallotCount={1234}
      isLiveMode
      showNoChargerWarning={false}
    />
  );
}

/* istanbul ignore next */
export function NoPowerConnectedTestModePreview(): JSX.Element {
  return (
    <InsertBallotScreen
      isLiveMode={false}
      scannedBallotCount={1234}
      showNoChargerWarning
    />
  );
}
