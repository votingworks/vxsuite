import React from 'react';
import { Prose } from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { Absolute } from '../components/Absolute';
import { CircleCheck } from '../components/Graphics';
import { Bar } from '../components/Bar';
import { CenteredLargeProse, CenteredScreen } from '../components/Layout';

interface Props {
  scannedBallotCount: number;
}

export function ScanSuccessScreen({ scannedBallotCount }: Props): JSX.Element {
  return (
    <CenteredScreen>
      <CircleCheck />
      <CenteredLargeProse>
        <h1>Your ballot was counted!</h1>
        <p>Thank you for voting.</p>
      </CenteredLargeProse>
      <Absolute top left>
        <Bar>
          <Prose>
            <p>
              Ballots Scanned:{' '}
              <strong data-testid="ballot-count">
                {format.count(scannedBallotCount)}
              </strong>
            </p>
          </Prose>
        </Bar>
      </Absolute>
    </CenteredScreen>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanSuccessScreen scannedBallotCount={1} />;
}
