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
        <h1>Scanner Busy</h1>
        <p>
          Another ballot is already being scanned.
          <br />
          Take your ballot out of the tray.
        </p>
        <Text italic>Ask a poll worker if you need help.</Text>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanBusyScreen />;
}
