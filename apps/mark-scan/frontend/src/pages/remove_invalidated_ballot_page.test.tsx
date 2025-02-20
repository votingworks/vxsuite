import { afterEach, beforeEach, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '../../test/react_testing_library';
import { render } from '../../test/test_utils';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { ApiProvider } from '../api_provider';
import { RemoveInvalidatedBallotPage } from './remove_invalidated_ballot_page';

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
