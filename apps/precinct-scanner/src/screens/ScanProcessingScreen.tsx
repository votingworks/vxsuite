import React from 'react';
import { IndeterminateProgressBar } from '../components/Graphics';
import { CenteredLargeProse, CenteredScreen } from '../components/Layout';

function ScanProcessingScreen(): JSX.Element {
  return (
    <CenteredScreen>
      <IndeterminateProgressBar />
      <CenteredLargeProse>
        <h1>Scanning Ballot…</h1>
      </CenteredLargeProse>
    </CenteredScreen>
  );
}

export default ScanProcessingScreen;

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanProcessingScreen />;
}
