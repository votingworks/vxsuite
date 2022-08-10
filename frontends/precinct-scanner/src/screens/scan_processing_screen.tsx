import React from 'react';
import { IndeterminateProgressBar } from '../components/graphics';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';

export function ScanProcessingScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      <IndeterminateProgressBar />
      <CenteredLargeProse>
        <h1>Please wait…</h1>
        <p>Checking your ballot for errors.</p>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanProcessingScreen />;
}
