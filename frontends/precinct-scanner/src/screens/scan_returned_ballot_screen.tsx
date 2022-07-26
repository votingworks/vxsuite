import React from 'react';
import { Text } from '@votingworks/ui';
import { ExclamationTriangle } from '../components/graphics';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';

export function ScanReturnedBallotScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      {/* TODO: make a better graphic for this screen */}
      <ExclamationTriangle />
      <CenteredLargeProse>
        <h1>Take Your Ballot</h1>
        <p>After you fix it, come back and scan it again.</p>
        <Text italic>Ask a poll worker if you need help.</Text>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanReturnedBallotScreen />;
}
