import userEvent from '@testing-library/user-event';
import { LogEventId, Logger, fakeLogger } from '@votingworks/logging';
import { screen } from '../../test/react_testing_library';
import { render } from '../../test/test_utils';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { ApiProvider } from '../api_provider';
import { RemoveInvalidatedBallotPage } from './remove_invalidated_ballot_page';

let logger: Logger;
let apiMock: ApiMock;

beforeEach(() => {
  logger = fakeLogger();
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('continue button', () => {
  render(
    <ApiProvider apiClient={apiMock.mockApiClient} noAudio>
      <RemoveInvalidatedBallotPage logger={logger} paperPresent={false} />
    </ApiProvider>
  );

  apiMock.expectConfirmInvalidateBallot();

  userEvent.click(screen.getByText('Continue'));
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.PollWorkerConfirmedBallotRemoval,
    'poll_worker'
  );
});
