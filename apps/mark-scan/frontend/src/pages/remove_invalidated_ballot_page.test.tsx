import { afterEach, beforeEach, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '../../test/react_testing_library.js';
import { render } from '../../test/test_utils.js';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client.js';
import { ApiProvider } from '../api_provider.js';
import { RemoveInvalidatedBallotPage } from './remove_invalidated_ballot_page.js';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('continue button', () => {
  render(
    <ApiProvider apiClient={apiMock.mockApiClient} noAudio>
      <RemoveInvalidatedBallotPage paperPresent={false} />
    </ApiProvider>
  );

  apiMock.expectConfirmInvalidateBallot();

  userEvent.click(screen.getByText('Continue'));
});
