/* istanbul ignore file - placeholder component that will change */
import { useContext } from 'react';

import styled from 'styled-components';
import {
  Prose,
  Screen,
  H1,
  WithScrollButtons,
  Main,
  Button,
} from '@votingworks/ui';

import { assert } from '@votingworks/basics';
import {
  ButtonFooter,
  DisplaySettingsButton,
  Review,
} from '@votingworks/mark-flow-ui';
import {
  getElectionDefinition,
  getInterpretation,
  invalidateBallot,
  validateBallot,
} from '../api';

import { BallotContext } from '../contexts/ballot_context';

const ContentHeader = styled.div`
  padding: 0.5rem 0.75rem 0;
`;

export function ValidateBallotPage(): JSX.Element | null {
  const getInterpretationQuery = getInterpretation.useQuery();
  const getElectionDefinitionQuery = getElectionDefinition.useQuery();
  // We use the contest data stored in BallotContext but vote data from the interpreted ballot
  const { contests, precinctId, resetBallot } = useContext(BallotContext);

  assert(
    typeof precinctId !== 'undefined',
    'precinctId is required to render ValidateBallotPage'
  );

  const settingsButton = <DisplaySettingsButton />;

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
    <Screen>
      <Main flexColumn>
        <ContentHeader>
          <Prose id="audiofocus">
            <H1>
              <span aria-label="Review Your Votes.">Review Your Votes</span>
              <span className="screen-reader-only">
                To review your votes, advance through the ballot contests using
                the up and down buttons. If your selections are correct, press
                “My Ballot is Correct”. If there is an error, press “My Ballot
                is Incorrect” and alert a poll worker.
              </span>
            </H1>
          </Prose>
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
      </Main>
      <ButtonFooter>
        {settingsButton}
        <Button
          variant="danger"
          icon="Danger"
          onPress={invalidateBallotCallback}
        >
          My Ballot is Incorrect
        </Button>
        <Button onPress={validateBallotCallback}>My Ballot is Correct</Button>
      </ButtonFooter>
    </Screen>
  );
}
