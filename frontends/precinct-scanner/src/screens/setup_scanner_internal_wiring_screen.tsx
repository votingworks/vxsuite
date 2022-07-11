import React from 'react';
import {
  ScreenMainCenterChild,
  CenteredLargeProse,
} from '../components/layout';

export function SetupScannerInternalWiringScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      <CenteredLargeProse>
        <h1>Scanner Not Detected</h1>
        <p>
          There is an internal connection problem. Please report to election
          clerk.
        </p>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <SetupScannerInternalWiringScreen />;
}
