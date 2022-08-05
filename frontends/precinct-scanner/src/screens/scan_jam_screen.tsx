import React from 'react';
import { Text } from '@votingworks/ui';
import { TimesCircle } from '../components/graphics';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';

export function ScanJamScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      <TimesCircle />
      <CenteredLargeProse>
        <h1>Ballot Not Counted</h1>
        <p>The ballot is jammed in the scanner.</p>
        <Text small italic>
          Ask a poll worker for help.
        </Text>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanJamScreen />;
}
