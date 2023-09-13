import userEvent from '@testing-library/user-event';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { ElectionDefinition, InsertedSmartCardAuth } from '@votingworks/types';
import { VxRenderResult } from '@votingworks/ui';
import { render as renderWithBallotContext } from '../../test/test_utils';
import { createApiMock, ApiMock } from '../../test/helpers/mock_api_client';
import { screen } from '../../test/react_testing_library';
import { BallotInvalidatedPage } from './ballot_invalidated_page';
import {
  fakeCardlessVoterLoggedInAuth,
  fakePollWorkerAuth,
} from '../../test/helpers/fake_auth';

let apiMock: ApiMock;
beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderWithAuthAndBallotContext(
  electionDefinition: ElectionDefinition,
  authStatus:
    | InsertedSmartCardAuth.CardlessVoterLoggedIn
    | InsertedSmartCardAuth.PollWorkerLoggedIn
): VxRenderResult {
  return renderWithBallotContext(
    <BallotInvalidatedPage authStatus={authStatus} />,
    {
      precinctId: electionDefinition.election.precincts[0].id,
      ballotStyleId: electionDefinition.election.ballotStyles[0].id,
      apiMock,
    }
  );
}

describe('with poll worker auth', () => {
  test('calls confirmInvalidateBallot button is clicked', async () => {
    const electionDefinition = electionGeneralDefinition;
    apiMock.expectConfirmInvalidateBallot();
    const auth = fakePollWorkerAuth(electionDefinition);
    renderWithAuthAndBallotContext(electionDefinition, auth);

    await screen.findByText('Remove Ballot');
    userEvent.click(screen.getByText('Start a New Voter Session'));
  });
});

describe('with cardless voter auth', () => {
  test('renders instructions to alert a poll worker', async () => {
    const electionDefinition = electionGeneralDefinition;

    const auth = fakeCardlessVoterLoggedInAuth(electionDefinition);
    renderWithAuthAndBallotContext(electionDefinition, auth);

    await screen.findByText('Ask a Poll Worker for Help');
    await screen.findByText('Insert a Poll Worker Card to Continue');
  });
});
