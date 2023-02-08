import React, { useState } from 'react';
import { Button, Text, useExternalStateChangeListener } from '@votingworks/ui';
import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { ScannedBallotCount } from './scanned_ballot_count';
import { CenteredLargeProse, ScreenMainCenterChild } from './layout';
import { BALLOT_BAG_CAPACITY } from '../config/globals';
import { ExclamationTriangle } from './graphics';
import { recordBallotBagReplaced } from '../api';

interface Props {
  scannedBallotCount: number;
  pollWorkerAuthenticated: boolean;
  logger: Logger;
}

export function ReplaceBallotBagScreen({
  scannedBallotCount,
  pollWorkerAuthenticated,
  logger,
}: Props): JSX.Element {
  const recordBallotBagReplacedMutation = recordBallotBagReplaced.useMutation();
  const [confirmed, setConfirmed] = useState(false);

  useExternalStateChangeListener(
    pollWorkerAuthenticated,
    (newPollWorkerAuthenticated) => {
      if (confirmed && !newPollWorkerAuthenticated) {
        recordBallotBagReplacedMutation.mutate(undefined, {
          onSuccess: async () => {
            await logger.log(LogEventId.BallotBagReplaced, 'poll_worker', {
              disposition: 'success',
              message:
                'Poll worker confirmed that they replaced the ballot bag.',
            });
          },
        });
      }
    }
  );

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
      logger={new Logger(LogSource.VxScanFrontend)}
    />
  );
}
/* istanbul ignore next */
export function PollWorkerConfirmationFlowPreview(): JSX.Element {
  return (
    <ReplaceBallotBagScreen
      scannedBallotCount={BALLOT_BAG_CAPACITY}
      pollWorkerAuthenticated
      logger={new Logger(LogSource.VxScanFrontend)}
    />
  );
}
