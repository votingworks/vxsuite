/* istanbul ignore file - placeholder component that will change @preserve */
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
import { getBallotStyle } from '@votingworks/types';
import {
  getElectionRecord,
  getInterpretation,
  invalidateBallot,
  validateBallot,
} from '../api';

import { BallotContext } from '../contexts/ballot_context';
import { useVoterHelpScreen } from './use_voter_help_screen';

const ContentHeader = styled(ReadOnLoad)`
  padding: 0.5rem 0.75rem 0;
`;

export function ValidateBallotPage(): JSX.Element | null {
  const getInterpretationQuery = getInterpretation.useQuery();
  const getElectionRecordQuery = getElectionRecord.useQuery();
  // We use the contest data stored in BallotContext but vote data from the interpreted ballot
  const { contests, precinctId, ballotStyleId, resetBallot } =
    React.useContext(BallotContext);
  const VoterHelpScreen = useVoterHelpScreen('PostPrintReviewScreen');

  assert(
    typeof precinctId !== 'undefined',
    'precinctId is required to render ValidateBallotPage'
  );
  assert(
    typeof ballotStyleId !== 'undefined',
    'ballotStyleId is required to render ValidateBallotPage'
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

  if (!getInterpretationQuery.isSuccess || !getElectionRecordQuery.isSuccess) {
    return null;
  }
  const { electionDefinition } = assertDefined(getElectionRecordQuery.data);
  const ballotStyle = getBallotStyle({
    election: electionDefinition.election,
    ballotStyleId,
  });
  assert(ballotStyle, `Ballot style with id ${ballotStyleId} not found`);

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
          election={electionDefinition.election}
          contests={contests}
          precinctId={precinctId}
          votes={votes}
          selectionsAreEditable={false}
          ballotStyle={ballotStyle}
        />
      </WithScrollButtons>
    </VoterScreen>
  );
}
