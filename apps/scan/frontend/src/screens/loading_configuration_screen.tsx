import React from 'react';
import { H1, LoadingAnimation, Section } from '@votingworks/ui';
import { ScreenMainCenterChild } from '../components/layout';

export function LoadingConfigurationScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      <H1 aria-hidden>
        <LoadingAnimation />
      </H1>
      <Section horizontalAlign="center">
        <H1>Loading Configuration…</H1>
      </Section>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <LoadingConfigurationScreen />;
}
