import React from 'react';
import { Text } from '@votingworks/ui';
import { ExclamationTriangle } from '../components/graphics';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';

export function ScanBusyScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      <ExclamationTriangle />
      <CenteredLargeProse>
        <h1>Remove Your Ballot</h1>
        <p>Another ballot is being scanned.</p>
        <Text small italic>
          Ask a poll worker if you need help.
        </Text>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanBusyScreen />;
}
