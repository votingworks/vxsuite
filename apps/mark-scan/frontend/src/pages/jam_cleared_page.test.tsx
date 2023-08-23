import { QueryClientProvider } from '@tanstack/react-query';
import {
  fakeCardlessVoterUser,
  fakePollWorkerUser,
  fakeSessionExpiresAt,
} from '@votingworks/test-utils';
import { InsertedSmartCardAuth } from '@votingworks/types';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { ApiClientContext, createQueryClient } from '../api';
import { createApiMock, ApiMock } from '../../test/helpers/mock_api_client';
import { render } from '../../test/react_testing_library';
import { JamClearedPage } from './jam_cleared_page';

let apiMock: ApiMock;
beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('ends cardless voter session if entering resetting_state_machine_after_jam state', () => {
  apiMock.expectEndCardlessVoterSession();
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: fakePollWorkerUser({
      electionHash: electionSampleDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
    cardlessVoterUser: fakeCardlessVoterUser(),
  };

  render(
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider client={createQueryClient()}>
        <JamClearedPage
          authStatus={authStatus}
          stateMachineState="resetting_state_machine_after_jam"
        />
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
});
