import React from 'react';
import { CenteredLargeProse, H1, P } from '@votingworks/ui';
import { CircleCheck } from '../components/graphics';

import { ScreenMainCenterChild } from '../components/layout';

interface Props {
  scannedBallotCount: number;
}

export function ScanSuccessScreen({ scannedBallotCount }: Props): JSX.Element {
  return (
    <ScreenMainCenterChild ballotCountOverride={scannedBallotCount}>
      <CircleCheck />
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
