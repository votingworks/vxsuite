import React from 'react';
import { IndeterminateProgressBar } from '../components/graphics';
import { CenteredLargeProse, CenteredScreen } from '../components/layout';

export function ScanProcessingScreen(): JSX.Element {
  return (
    <CenteredScreen>
      <IndeterminateProgressBar />
      <CenteredLargeProse>
        <h1>Please wait…</h1>
        <p>Checking your ballot for errors.</p>
      </CenteredLargeProse>
    </CenteredScreen>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanProcessingScreen />;
}
