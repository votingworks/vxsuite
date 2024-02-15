import userEvent from '@testing-library/user-event';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { ElectionDefinition, InsertedSmartCardAuth } from '@votingworks/types';
import { VxRenderResult } from '@votingworks/ui';
import { render } from '../../test/test_utils';
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
    | InsertedSmartCardAuth.PollWorkerLoggedIn,
  paperPresent: boolean = true
): VxRenderResult {
  return render(
    <BallotInvalidatedPage
      authStatus={authStatus}
      paperPresent={paperPresent}
    />,
    {
      apiMock,
    }
  );
}

describe('with poll worker auth', () => {
  test('renders the correct message when paper is present', () => {
    const electionDefinition = electionGeneralDefinition;
    const auth = fakePollWorkerAuth(electionDefinition);
    renderWithAuthAndBallotContext(electionDefinition, auth);

    screen.getByText('Please remove the incorrect ballot.');
  });

  test('renders the correct message when paper is not present', () => {
    const electionDefinition = electionGeneralDefinition;
    const auth = fakePollWorkerAuth(electionDefinition);
    renderWithAuthAndBallotContext(electionDefinition, auth, false);

    screen.getByText(
      'The incorrect ballot has been removed. Remember to spoil the ballot.'
    );
  });

  test('calls confirmInvalidateBallot when button is clicked', () => {
    const electionDefinition = electionGeneralDefinition;
    apiMock.expectConfirmInvalidateBallot();
    const auth = fakePollWorkerAuth(electionDefinition);
    renderWithAuthAndBallotContext(electionDefinition, auth, false);

    userEvent.click(screen.getByText('Continue'));
  });
});

describe('with cardless voter auth', () => {
  test('renders instructions to alert a poll worker', async () => {
    const electionDefinition = electionGeneralDefinition;

    const auth = fakeCardlessVoterLoggedInAuth(electionDefinition);
    renderWithAuthAndBallotContext(electionDefinition, auth);

    await screen.findByText('Ask a Poll Worker for Help');
    await screen.findByText('Insert a poll worker card to continue.');
  });
});
