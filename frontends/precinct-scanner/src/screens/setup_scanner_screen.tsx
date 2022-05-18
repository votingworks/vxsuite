import React from 'react';
import {
  ScreenMainCenterChild,
  CenteredLargeProse,
} from '../components/layout';

export function SetupScannerScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      <CenteredLargeProse>
        <h1>Scanner Not Detected</h1>
        <p>Please ask a poll worker to connect scanner.</p>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <SetupScannerScreen />;
}
