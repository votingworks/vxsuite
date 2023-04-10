import React from 'react';
import { CenteredLargeProse, H1, LoadingAnimation } from '@votingworks/ui';
import { ScreenMainCenterChild } from '../components/layout';

export function LoadingConfigurationScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      <LoadingAnimation />
      <CenteredLargeProse>
        <H1>Loading Configuration…</H1>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <LoadingConfigurationScreen />;
}
