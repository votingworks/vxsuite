/* istanbul ignore file - placeholder component that will change */
import React from 'react';

import styled from 'styled-components';
import {
  H1,
  WithScrollButtons,
  Button,
  appStrings,
  AudioOnly,
  ReadOnLoad,
} from '@votingworks/ui';

import { assert } from '@votingworks/basics';
import { VoterScreen, Review } from '@votingworks/mark-flow-ui';
import {
  getElectionDefinition,
  getInterpretation,
  invalidateBallot,
  validateBallot,
} from '../api';

import { BallotContext } from '../contexts/ballot_context';

const ContentHeader = styled(ReadOnLoad)`
  padding: 0.5rem 0.75rem 0;
`;

export function ValidateBallotPage(): JSX.Element | null {
  const getInterpretationQuery = getInterpretation.useQuery();
  const getElectionDefinitionQuery = getElectionDefinition.useQuery();
  // We use the contest data stored in BallotContext but vote data from the interpreted ballot
  const { contests, precinctId, resetBallot } = React.useContext(BallotContext);

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

  if (
    !getInterpretationQuery.isSuccess ||
    !getElectionDefinitionQuery.isSuccess
  ) {
    return null;
  }
  const electionDefinition = getElectionDefinitionQuery.data;
  // Election definition should always be defined
  assert(electionDefinition, 'Expected election definition');

  // Interpretation may be null on first redirect to this page
  const interpretation = getInterpretationQuery.data;
  if (!interpretation) {
    return null;
  }
  const { votes } = interpretation;

  return (
    <VoterScreen
      actionButtons={
        <React.Fragment>
          <Button
            variant="danger"
            icon="Danger"
            onPress={invalidateBallotCallback}
          >
            {appStrings.buttonBallotIsIncorrect()}
          </Button>
          <Button onPress={validateBallotCallback}>
            {appStrings.buttonBallotIsCorrect()}
          </Button>
        </React.Fragment>
      }
    >
      <ContentHeader>
        <H1>{appStrings.titleBmdReviewScreen()}</H1>
        <AudioOnly>
          {appStrings.instructionsBmdReviewPageNavigation()}{' '}
          {appStrings.instructionsBmdScanReviewConfirmation()}
        </AudioOnly>
      </ContentHeader>
      <WithScrollButtons>
        <Review
          election={electionDefinition.election}
          contests={contests}
          precinctId={precinctId}
          votes={votes}
          selectionsAreEditable={false}
        />
      </WithScrollButtons>
    </VoterScreen>
  );
}
