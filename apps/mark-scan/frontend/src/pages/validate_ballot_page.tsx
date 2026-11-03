// @coverage-defer-file: placeholder component that will change
import React from 'react';

import styled from 'styled-components';
import {
  H1,
  WithScrollButtons,
  Button,
  appStrings,
  AudioOnly,
  ReadOnLoad,
  PageNavigationButtonId,
  AssistiveTechInstructions,
  P,
} from '@votingworks/ui';

import { assert, assertDefined } from '@votingworks/basics';
import { VoterScreen, Review } from '@votingworks/mark-flow-ui';
import {
  getInterpretation,
  getSystemSettings,
  invalidateBallot,
  validateBallot,
} from '../api.js';

import { BallotContext } from '../contexts/ballot_context.js';
import { useVoterHelpScreen } from './use_voter_help_screen.js';

const ContentHeader = styled(ReadOnLoad)`
  padding: 0.5rem 0.75rem 0;
`;

export function ValidateBallotPage(): JSX.Element | null {
  const getInterpretationQuery = getInterpretation.useQuery();
  const systemSettingsQuery = getSystemSettings.useQuery();
  const shouldTransliterateCandidateNames = Boolean(
    systemSettingsQuery.data?.shouldTransliterateCandidateNames
  );
  // We use the contest data stored in BallotContext but vote data from the interpreted ballot
  const {
    contests,
    electionDefinition,
    precinctId,
    candidateOrderings,
    resetBallot,
  } = React.useContext(BallotContext);
  const VoterHelpScreen = useVoterHelpScreen('PostPrintReviewScreen');

  assert(
    typeof precinctId !== 'undefined',
    'precinctId is required to render ValidateBallotPage'
  );

  const invalidateBallotMutation = invalidateBallot.useMutation();
  const validateBallotMutation = validateBallot.useMutation();
  function invalidateBallotCallback() {
    invalidateBallotMutation.mutate(undefined);
  }
  function validateBallotCallback() {
    validateBallotMutation.mutate(undefined, {
      onSuccess() {
        resetBallot(true);
      },
    });
  }

  if (!getInterpretationQuery.isSuccess) {
    return null;
  }

  const { election } = assertDefined(
    electionDefinition,
    'election required for ValidateBallotPage'
  );

  // Interpretation may be null on first redirect to this page
  const interpretation = getInterpretationQuery.data;
  if (!interpretation) {
    return null;
  }

  assert(interpretation.type === 'InterpretedBmdPage');
  const { votes } = interpretation;

  return (
    <VoterScreen
      actionButtons={
        <React.Fragment>
          <Button variant="danger" onPress={invalidateBallotCallback}>
            {appStrings.buttonBallotIsIncorrect()}
          </Button>
          <Button
            id={PageNavigationButtonId.NEXT_AFTER_CONFIRM}
            onPress={validateBallotCallback}
          >
            {appStrings.buttonBallotIsCorrect()}
            <AudioOnly>
              <AssistiveTechInstructions
                controllerString={appStrings.instructionsBmdConfirmCastingBallot()}
                patDeviceString={appStrings.instructionsBmdConfirmCastingBallotPatDevice()}
              />
            </AudioOnly>
          </Button>
        </React.Fragment>
      }
      VoterHelpScreen={VoterHelpScreen}
    >
      <ContentHeader>
        <H1>{appStrings.titleBmdReviewScreen()}</H1>
        <P>{appStrings.instructionsBmdReviewAndValidatePrintedBallot()}</P>
        <AudioOnly>
          <AssistiveTechInstructions
            controllerString={appStrings.instructionsBmdReviewPageNavigation()}
            patDeviceString={appStrings.instructionsBmdReviewPageNavigationPatDevice()}
          />{' '}
          <AssistiveTechInstructions
            controllerString={appStrings.instructionsBmdScanReviewConfirmation()}
            patDeviceString={appStrings.instructionsBmdScanReviewConfirmationPatDevice()}
          />
        </AudioOnly>
      </ContentHeader>
      <WithScrollButtons>
        <Review
          election={election}
          contests={contests}
          precinctId={precinctId}
          votes={votes}
          selectionsAreEditable={false}
          candidateOrderings={candidateOrderings}
          shouldTransliterateCandidateNames={shouldTransliterateCandidateNames}
        />
      </WithScrollButtons>
    </VoterScreen>
  );
}
