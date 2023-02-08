import React from 'react';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';
import { IndeterminateProgressBar } from '../components/graphics';

export function LoadingConfigurationScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      <IndeterminateProgressBar />
      <CenteredLargeProse>
        <h1>Loading Configuration…</h1>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <LoadingConfigurationScreen />;
}
