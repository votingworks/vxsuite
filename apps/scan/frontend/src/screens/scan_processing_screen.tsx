import { CenteredLargeProse, IndeterminateProgressBar } from '@votingworks/ui';
import React from 'react';
import { ScreenMainCenterChild } from '../components/layout';

export function ScanProcessingScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      <IndeterminateProgressBar />
      <CenteredLargeProse>
        <h1>Please wait…</h1>
        <p>Scanning the marks on your ballot.</p>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanProcessingScreen />;
}
