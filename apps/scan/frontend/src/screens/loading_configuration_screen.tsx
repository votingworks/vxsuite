import React from 'react';
import { CenteredLargeProse, LoadingAnimation } from '@votingworks/ui';
import { ScreenMainCenterChild } from '../components/layout';

export function LoadingConfigurationScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      <LoadingAnimation />
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
