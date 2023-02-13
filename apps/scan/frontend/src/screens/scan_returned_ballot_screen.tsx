import React from 'react';
import { Text } from '@votingworks/shared-frontend';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';

export function ScanReturnedBallotScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      {/* TODO: make a graphic for this screen */}
      <CenteredLargeProse>
        <h1>Remove Your Ballot</h1>
        <Text small italic>
          Ask a poll worker if you need help.
        </Text>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanReturnedBallotScreen />;
}
