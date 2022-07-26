import React, { useEffect } from 'react';
import { CircleCheck } from '../components/graphics';
import { ScannedBallotCount } from '../components/scanned_ballot_count';

import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';
import * as scanner from '../api/scan';
import { TIME_TO_DISMISS_SUCCESS_SCREEN_MS } from '../config/globals';

interface Props {
  scannedBallotCount: number;
}

export function ScanSuccessScreen({ scannedBallotCount }: Props): JSX.Element {
  // Go back to the Insert Ballot screen after a bit
  useEffect(() => {
    const timeout = window.setTimeout(
      scanner.waitForPaper,
      TIME_TO_DISMISS_SUCCESS_SCREEN_MS
    );
    return () => window.clearTimeout(timeout);
  }, []);

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
  return <ScanSuccessScreen scannedBallotCount={1} />;
}
