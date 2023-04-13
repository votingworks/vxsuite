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

interface Props {
  scannedBallotCount: number;
}

export function ScanJamScreen({ scannedBallotCount }: Props): JSX.Element {
  return (
    <ScreenMainCenterChild ballotCountOverride={scannedBallotCount}>
      <FullScreenIconWrapper color="danger">
        <Icons.DangerX />
      </FullScreenIconWrapper>
      <CenteredLargeProse>
        <H1>Ballot Not Counted</H1>
        <P>The ballot is jammed in the scanner.</P>
        <Caption>Ask a poll worker for help.</Caption>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanJamScreen scannedBallotCount={42} />;
}
