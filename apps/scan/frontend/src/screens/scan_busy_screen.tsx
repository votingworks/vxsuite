import React from 'react';
import {
  Caption,
  CenteredLargeProse,
  FullScreenIconWrapper,
  H1,
  Icons,
  P,
} from '@votingworks/ui';
import { ScreenMainCenterChild } from '../components/layout';

export function ScanBusyScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild>
      <FullScreenIconWrapper color="warning">
        <Icons.Warning />
      </FullScreenIconWrapper>
      <CenteredLargeProse>
        <H1>Remove Your Ballot</H1>
        <P>Another ballot is being scanned.</P>
        <Caption>Ask a poll worker if you need help.</Caption>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanBusyScreen />;
}
