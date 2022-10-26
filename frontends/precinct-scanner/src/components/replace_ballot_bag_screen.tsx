import React, { useEffect, useState } from 'react';
import { Button, Text } from '@votingworks/ui';
import { ScannedBallotCount } from './scanned_ballot_count';
import { CenteredLargeProse, ScreenMainCenterChild } from './layout';
import { BALLOT_BAG_CAPACITY } from '../config/globals';
import { ExclamationTriangle } from './graphics';

interface Props {
  scannedBallotCount: number;
  pollWorkerAuthenticated: boolean;
  onComplete: VoidFunction;
}

export function ReplaceBallotBagScreen({
  scannedBallotCount,
  pollWorkerAuthenticated,
  onComplete,
}: Props): JSX.Element {
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (confirmed && !pollWorkerAuthenticated) {
      onComplete();
    }
  }, [confirmed, pollWorkerAuthenticated, onComplete]);

  const mainContent = (() => {
    if (!confirmed && !pollWorkerAuthenticated) {
      return (
        <React.Fragment>
          <ExclamationTriangle />
          <CenteredLargeProse>
            <h1>Ballot Bag Full</h1>
            <p>
              A poll worker must replace the full ballot bag with a new empty
              ballot bag.
            </p>
            <Text small italic>
              Insert a poll worker card to continue.
            </Text>
          </CenteredLargeProse>
        </React.Fragment>
      );
    }

    if (!confirmed && pollWorkerAuthenticated) {
      return (
        <CenteredLargeProse>
          <h1>Ballot Bag Replaced?</h1>
          <p>
            Has the full ballot bag been replaced with a new empty ballot bag?
          </p>
          <p>
            <Button primary onPress={() => setConfirmed(true)}>
              Yes, New Ballot Bag is Ready
            </Button>
          </p>
          <Text small italic>
            Remove card to go back.
          </Text>
        </CenteredLargeProse>
      );
    }

    return (
      <CenteredLargeProse>
        <h1>Resume Voting</h1>
        <Text small italic>
          Remove card to resume voting.
        </Text>
      </CenteredLargeProse>
    );
  })();

  return (
    <ScreenMainCenterChild infoBar={false}>
      <ScannedBallotCount count={scannedBallotCount} />
      {mainContent}
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function BallotBagFullAlertPreview(): JSX.Element {
  return (
    <ReplaceBallotBagScreen
      scannedBallotCount={BALLOT_BAG_CAPACITY}
      pollWorkerAuthenticated={false}
      onComplete={() => console.log('disabled')} // eslint-disable-line no-console
    />
  );
}
/* istanbul ignore next */
export function PollWorkerConfirmationFlowPreview(): JSX.Element {
  return (
    <ReplaceBallotBagScreen
      scannedBallotCount={BALLOT_BAG_CAPACITY}
      pollWorkerAuthenticated
      onComplete={() => console.log('disabled')} // eslint-disable-line no-console
    />
  );
}
