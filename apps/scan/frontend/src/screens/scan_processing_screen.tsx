import { H1, LoadingAnimation, P, Section } from '@votingworks/ui';
import React from 'react';
import { ScreenMainCenterChild } from '../components/layout';

export function ScanProcessingScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      <H1 aria-hidden>
        <LoadingAnimation />
      </H1>
      <Section horizontalAlign="center">
        <H1>Please wait…</H1>
        <P>Scanning the marks on your ballot.</P>
      </Section>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanProcessingScreen />;
}
