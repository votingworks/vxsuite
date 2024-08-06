import { renderHook } from '@testing-library/react';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { advancePromises } from '@votingworks/test-utils';
import { useIsVoterAuth } from './use_is_voter_auth';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('with voter auth', async () => {
  apiMock.setAuthStatusCardlessVoterLoggedInWithDefaults(
    electionGeneralDefinition
  );

  const { result } = renderHook(useIsVoterAuth, {
    wrapper: ({ children }) => provideApi(apiMock, children),
  });
  await advancePromises();

  expect(result.current).toEqual(true);
});

test('with non-voter auth', async () => {
  apiMock.setAuthStatusPollWorkerLoggedIn(electionGeneralDefinition);

  const { result } = renderHook(useIsVoterAuth, {
    wrapper: ({ children }) => provideApi(apiMock, children),
  });
  await advancePromises();

  expect(result.current).toEqual(false);
});
