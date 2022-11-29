import React, { useEffect } from 'react';
import { CircleCheck } from '../components/graphics';
import { ScannedBallotCount } from '../components/scanned_ballot_count';

import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';
import { useSound } from '../hooks/use_sound';

interface Props {
  scannedBallotCount: number;
}

export function ScanSuccessScreen({ scannedBallotCount }: Props): JSX.Element {
  const playSuccess = useSound('success');
  useEffect(playSuccess, [playSuccess]);

  return (
    <ScreenMainCenterChild>
      <CircleCheck />
      <CenteredLargeProse>
        <h1>Your ballot was counted!</h1>
        <p>Thank you for voting.</p>
      </CenteredLargeProse>
      <ScannedBallotCount count={scannedBallotCount} />
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanSuccessScreen scannedBallotCount={42} />;
}
