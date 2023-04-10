import React from 'react';
import { Caption, CenteredLargeProse, H1, P } from '@votingworks/ui';
import { TimesCircle } from '../components/graphics';
import { ScreenMainCenterChild } from '../components/layout';

interface Props {
  scannedBallotCount: number;
}

export function ScanJamScreen({ scannedBallotCount }: Props): JSX.Element {
  return (
    <ScreenMainCenterChild
      infoBar={false}
      ballotCountOverride={scannedBallotCount}
    >
      <TimesCircle />
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
