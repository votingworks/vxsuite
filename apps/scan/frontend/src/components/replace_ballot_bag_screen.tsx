import { useState } from 'react';
import {
  Button,
  Caption,
  CenteredLargeProse,
  FullScreenIconWrapper,
  H1,
  Icons,
  P,
  appStrings,
  useExternalStateChangeListener,
} from '@votingworks/ui';
import { Screen } from './layout';
import { BALLOT_BAG_CAPACITY } from '../config/globals';
import { recordBallotBagReplaced } from '../api';
import { FullScreenPromptLayout } from './full_screen_prompt_layout';

interface Props {
  scannedBallotCount: number;
  pollWorkerAuthenticated: boolean;
}

export function ReplaceBallotBagScreen({
  scannedBallotCount,
  pollWorkerAuthenticated,
}: Props): JSX.Element {
  const recordBallotBagReplacedMutation = recordBallotBagReplaced.useMutation();
  const [confirmed, setConfirmed] = useState(false);

  useExternalStateChangeListener(
    pollWorkerAuthenticated,
    (newPollWorkerAuthenticated) => {
      if (confirmed && !newPollWorkerAuthenticated) {
        recordBallotBagReplacedMutation.mutate();
      }
    }
  );

  const mainContent = (() => {
    if (!confirmed && !pollWorkerAuthenticated) {
      return (
        <FullScreenPromptLayout
          title={appStrings.titleBallotBagFull()}
          image={
            <FullScreenIconWrapper>
              <Icons.Warning color="warning" />
            </FullScreenIconWrapper>
          }
        >
          <P>{appStrings.noteScannerReplaceFullBallotBag()}</P>
          {/* Poll-worker-facing string - not translated: */}
          <Caption>Insert a poll worker card to continue.</Caption>
        </FullScreenPromptLayout>
      );
    }

    if (!confirmed && pollWorkerAuthenticated) {
      return (
        <CenteredLargeProse>
          <H1>Ballot Bag Replaced?</H1>
          <P>
            Has the full ballot bag been replaced with a new empty ballot bag?
          </P>
          <P>
            <Button variant="primary" onPress={() => setConfirmed(true)}>
              Yes, New Ballot Bag is Ready
            </Button>
          </P>
          <Caption>Remove card to go back.</Caption>
        </CenteredLargeProse>
      );
    }

    return (
      <CenteredLargeProse>
        <H1>Resume Voting</H1>
        <Caption>Remove card to resume voting.</Caption>
      </CenteredLargeProse>
    );
  })();

  return (
    <Screen
      centerContent
      ballotCountOverride={scannedBallotCount}
      voterFacing={false}
    >
      {mainContent}
    </Screen>
  );
}

/* istanbul ignore next */
export function BallotBagFullAlertPreview(): JSX.Element {
  return (
    <ReplaceBallotBagScreen
      scannedBallotCount={BALLOT_BAG_CAPACITY}
      pollWorkerAuthenticated={false}
    />
  );
}
/* istanbul ignore next */
export function PollWorkerConfirmationFlowPreview(): JSX.Element {
  return (
    <ReplaceBallotBagScreen
      scannedBallotCount={BALLOT_BAG_CAPACITY}
      pollWorkerAuthenticated
    />
  );
}
