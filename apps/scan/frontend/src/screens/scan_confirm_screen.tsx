import React from 'react';
import {
  BallotStyleId,
  ElectionDefinition,
  VotesDict,
} from '@votingworks/types';
import {
  Button,
  FullScreenIconWrapper,
  Icons,
  P,
  PageNavigationButtonId,
  appStrings,
} from '@votingworks/ui';

import { Screen } from '../components/layout';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';
import { acceptBallot } from '../api';
import { BallotReviewScreen } from './ballot_review_screen';

export interface ScanConfirmScreenProps {
  electionDefinition: ElectionDefinition;
  ballotStyleId: BallotStyleId;
  votes: VotesDict;
  isTestMode: boolean;
}

/**
 * Shown once a ballot has scanned successfully and is held in the scanner. The
 * voter can cast the ballot immediately or choose to review their selections as
 * read by the scanner before casting.
 */
export function ScanConfirmScreen(props: ScanConfirmScreenProps): JSX.Element {
  const { isTestMode } = props;
  const [showBallotReviewScreen, setShowBallotReviewScreen] =
    React.useState(false);
  const acceptBallotMutation = acceptBallot.useMutation();
  const [hasCastBallot, setHasCastBallot] = React.useState(false);

  function onCastBallot() {
    setHasCastBallot(true);
    acceptBallotMutation.mutate();
  }

  if (showBallotReviewScreen) {
    return (
      <BallotReviewScreen
        {...props}
        hasCastBallot={hasCastBallot}
        onCastBallot={onCastBallot}
      />
    );
  }

  return (
    <Screen
      actionButtons={
        <React.Fragment>
          <Button
            id={PageNavigationButtonId.PREVIOUS_AFTER_CONFIRM}
            onPress={() => setShowBallotReviewScreen(true)}
            disabled={hasCastBallot}
          >
            {appStrings.buttonReviewChoices()}
          </Button>
          <Button
            id={PageNavigationButtonId.NEXT_AFTER_CONFIRM}
            variant="primary"
            onPress={onCastBallot}
            disabled={hasCastBallot}
          >
            {appStrings.buttonCastBallot()}
          </Button>
        </React.Fragment>
      }
      centerContent
      padded
      voterFacing
      showTestModeBanner={isTestMode}
    >
      <FullScreenPromptLayout
        title={appStrings.titleScannerConfirmScreen()}
        image={
          <FullScreenIconWrapper>
            <Icons.Done color="success" />
          </FullScreenIconWrapper>
        }
      >
        <P>{appStrings.noteScannerReviewOrCastBallot()}</P>
      </FullScreenPromptLayout>
    </Screen>
  );
}
