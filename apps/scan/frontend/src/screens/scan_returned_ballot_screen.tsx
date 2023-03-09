import React from 'react';
import { H1, P, Section } from '@votingworks/ui';
import { ScreenMainCenterChild } from '../components/layout';

export function ScanReturnedBallotScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      {/* TODO: make a graphic for this screen */}
      <Section horizontalAlign="center">
        <H1>Remove Your Ballot</H1>
        <P>Ask a poll worker if you need help.</P>
      </Section>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanReturnedBallotScreen />;
}
