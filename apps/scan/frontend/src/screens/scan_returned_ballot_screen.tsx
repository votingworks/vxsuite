import React from 'react';
import { Caption, CenteredLargeProse, H1 } from '@votingworks/ui';
import { ScreenMainCenterChild } from '../components/layout';

export function ScanReturnedBallotScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild>
      {/* TODO: make a graphic for this screen */}
      <CenteredLargeProse>
        <H1>Remove Your Ballot</H1>
        <Caption>Ask a poll worker if you need help.</Caption>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanReturnedBallotScreen />;
}
