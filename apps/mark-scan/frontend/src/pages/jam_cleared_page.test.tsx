import { QueryClientProvider } from '@tanstack/react-query';
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
  render(
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider client={createQueryClient()}>
        <JamClearedPage stateMachineState="resetting_state_machine_after_jam" />
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
});
