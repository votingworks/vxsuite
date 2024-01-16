import { createApiMock, ApiMock } from '../../test/helpers/mock_api_client';
import { render } from '../../test/react_testing_library';
import { JamClearedPage } from './jam_cleared_page';
import { ApiProvider } from '../api_provider';

let apiMock: ApiMock;
beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('ends cardless voter session if entering resetting_state_machine_after_jam state', () => {
  render(
    <ApiProvider apiClient={apiMock.mockApiClient}>
      <JamClearedPage stateMachineState="resetting_state_machine_after_jam" />
    </ApiProvider>
  );
});
