import React from 'react';
import { CenteredLargeProse, CenteredScreen } from '../components/layout';
import { IndeterminateProgressBar } from '../components/graphics';

export function LoadingConfigurationScreen(): JSX.Element {
  return (
    <CenteredScreen infoBar={false}>
      <IndeterminateProgressBar />
      <CenteredLargeProse>
        <h1>Loading Configuration…</h1>
      </CenteredLargeProse>
    </CenteredScreen>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <LoadingConfigurationScreen />;
}
