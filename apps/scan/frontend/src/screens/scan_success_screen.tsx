import React from 'react';
import {
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

export function ScanSuccessScreen({ scannedBallotCount }: Props): JSX.Element {
  return (
    <ScreenMainCenterChild ballotCountOverride={scannedBallotCount}>
      <FullScreenIconWrapper color="success">
        <Icons.Done />
      </FullScreenIconWrapper>
      <CenteredLargeProse>
        <H1>Your ballot was counted!</H1>
        <P>Thank you for voting.</P>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanSuccessScreen scannedBallotCount={42} />;
}
