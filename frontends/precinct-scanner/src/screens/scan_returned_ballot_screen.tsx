import React from 'react';
import { Text } from '@votingworks/ui';
import { InsertBallot } from '../components/graphics';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';

export function ScanReturnedBallotScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      {/* TODO: make a better graphic for this screen */}
      <InsertBallot />
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
