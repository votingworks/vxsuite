import userEvent from '@testing-library/user-event';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { MARK_FLOW_UI_VOTER_SCREEN_TEST_ID } from '@votingworks/mark-flow-ui';
import { render as renderWithBallotContext } from '../../test/test_utils';
import { createApiMock, ApiMock } from '../../test/helpers/mock_api_client';
import { screen } from '../../test/react_testing_library';
import { ValidateBallotPage } from './validate_ballot_page';
import { getMockInterpretation } from '../../test/helpers/interpretation';

const electionGeneralDefinition = readElectionGeneralDefinition();

let apiMock: ApiMock;
beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('calls invalidateBallot if voter indicates their ballot is incorrect', async () => {
  const electionDefinition = electionGeneralDefinition;
  const mockInterpretation = getMockInterpretation(electionDefinition);
  apiMock.expectGetInterpretation(mockInterpretation);
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectInvalidateBallot();
  renderWithBallotContext(<ValidateBallotPage />, {
    precinctId: electionDefinition.election.precincts[0].id,
    ballotStyleId: electionDefinition.election.ballotStyles[0].id,
    apiMock,
  });

  await screen.findByText('Review Your Votes');
  apiMock.expectGetInterpretation(mockInterpretation);
  userEvent.click(screen.getByText('My Ballot is Incorrect'));
});

it('renders as voter screen', async () => {
  const electionDefinition = electionGeneralDefinition;
  apiMock.expectGetElectionRecord(electionDefinition);

  const mockInterpretation = getMockInterpretation(electionDefinition);
  apiMock.expectGetInterpretation(mockInterpretation);

  renderWithBallotContext(<ValidateBallotPage />, {
    precinctId: electionDefinition.election.precincts[0].id,
    ballotStyleId: electionDefinition.election.ballotStyles[0].id,
    apiMock,
  });

  await screen.findByTestId(MARK_FLOW_UI_VOTER_SCREEN_TEST_ID);
});
