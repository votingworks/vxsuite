import userEvent from '@testing-library/user-event';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { LogEventId, Logger, fakeLogger } from '@votingworks/logging';
import { render } from '../../test/test_utils';
import { createApiMock, ApiMock } from '../../test/helpers/mock_api_client';
import { screen } from '../../test/react_testing_library';
import { EmptyBallotBoxPage } from './empty_ballot_box_page';
import {
  fakeCardlessVoterLoggedInAuth,
  fakePollWorkerAuth,
} from '../../test/helpers/fake_auth';

let apiMock: ApiMock;
let logger: Logger;

beforeEach(() => {
  apiMock = createApiMock();
  logger = fakeLogger();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('requires poll worker auth', () => {
  const electionDefinition = electionGeneralDefinition;
  const authStatus = fakeCardlessVoterLoggedInAuth(electionDefinition);
  render(<EmptyBallotBoxPage authStatus={authStatus} logger={logger} />, {
    apiMock,
  });

  screen.getByText('Insert a poll worker card to continue.');
});

test('calls expectConfirmBallotBoxEmptied when button is clicked', () => {
  const electionDefinition = electionGeneralDefinition;
  apiMock.expectConfirmBallotBoxEmptied();
  const authStatus = fakePollWorkerAuth(electionDefinition);
  render(<EmptyBallotBoxPage authStatus={authStatus} logger={logger} />, {
    apiMock,
  });

  userEvent.click(screen.getByText('Yes, Ballot Box is Empty'));
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.BallotBoxEmptied,
    'poll_worker'
  );
});
