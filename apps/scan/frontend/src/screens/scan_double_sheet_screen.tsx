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

export function ScanDoubleSheetScreen({
  scannedBallotCount,
}: Props): JSX.Element {
  return (
    <ScreenMainCenterChild
      infoBar={false}
      ballotCountOverride={scannedBallotCount}
    >
      <FullScreenIconWrapper color="danger">
        <Icons.DangerX />
      </FullScreenIconWrapper>
      <CenteredLargeProse>
        <H1>Ballot Not Counted</H1>
        <P>Multiple sheets detected.</P>
        <Caption>Remove your ballot and insert one sheet at a time.</Caption>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanDoubleSheetScreen scannedBallotCount={42} />;
}
