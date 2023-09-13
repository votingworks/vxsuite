import userEvent from '@testing-library/user-event';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { render as renderWithBallotContext } from '../../test/test_utils';
import { createApiMock, ApiMock } from '../../test/helpers/mock_api_client';
import { screen } from '../../test/react_testing_library';
import { BallotInvalidatedPage } from './ballot_invalidated_page';

let apiMock: ApiMock;
beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('calls confirmInvalidateBallot when voter clicks button', async () => {
  const electionDefinition = electionGeneralDefinition;
  apiMock.expectConfirmInvalidateBallot();
  renderWithBallotContext(<BallotInvalidatedPage />, {
    precinctId: electionDefinition.election.precincts[0].id,
    ballotStyleId: electionDefinition.election.ballotStyles[0].id,
    apiMock,
  });

  await screen.findByText('Ballot Invalidated');
  userEvent.click(screen.getByText('I Have Alerted a Poll Worker'));
});
