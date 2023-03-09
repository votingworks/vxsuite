import React, { useState } from 'react';
import {
  Button,
  Caption,
  Font,
  H1,
  Icons,
  P,
  Section,
  useExternalStateChangeListener,
} from '@votingworks/ui';
import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import styled from 'styled-components';
import { ScreenMainCenterChild } from './layout';
import { BALLOT_BAG_CAPACITY } from '../config/globals';
import { recordBallotBagReplaced } from '../api';

interface Props {
  scannedBallotCount: number;
  pollWorkerAuthenticated: boolean;
  logger: Logger;
}

const StyledIconContainer = styled(Font)`
  font-size: 250px;
`;

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
          <StyledIconContainer color="warning">
            <Icons.Warning />
          </StyledIconContainer>
          <Section horizontalAlign="center">
            <H1>Ballot Bag Full</H1>
            <P>
              A poll worker must replace the full ballot bag with a new empty
              ballot bag.
            </P>
            <Caption>Insert a poll worker card to continue.</Caption>
          </Section>
        </React.Fragment>
      );
    }

    if (!confirmed && pollWorkerAuthenticated) {
      return (
        <Section horizontalAlign="center">
          <H1>Ballot Bag Replaced?</H1>
          <P>
            Has the full ballot bag been replaced with a new empty ballot bag?
          </P>
          <P>
            <Button variant="done" onPress={() => setConfirmed(true)}>
              Yes, New Ballot Bag is Ready
            </Button>
          </P>
          <Caption>Remove card to go back.</Caption>
        </Section>
      );
    }

    return (
      <Section horizontalAlign="center">
        <H1>Resume Voting</H1>
        <Caption>Remove card to resume voting.</Caption>
      </Section>
    );
  })();

  return (
    <ScreenMainCenterChild
      infoBar={false}
      ballotCountOverride={scannedBallotCount}
    >
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
