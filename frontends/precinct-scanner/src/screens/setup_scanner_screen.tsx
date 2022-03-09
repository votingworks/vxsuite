import React from 'react';
import { CenteredScreen, CenteredLargeProse } from '../components/layout';

export function SetupScannerScreen(): JSX.Element {
  return (
    <CenteredScreen infoBar={false}>
      <CenteredLargeProse>
        <h1>Scanner Not Detected</h1>
        <p>Please ask a poll worker to connect scanner.</p>
      </CenteredLargeProse>
    </CenteredScreen>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <SetupScannerScreen />;
}
