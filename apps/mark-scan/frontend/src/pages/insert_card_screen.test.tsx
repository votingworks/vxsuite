import { fakeKiosk } from '@votingworks/test-utils';
import { QueryClientProvider } from '@tanstack/react-query';
import { screen } from '../../test/react_testing_library';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { render } from '../../test/test_utils';
import { ApiClientContext, createQueryClient } from '../api';
import { InsertCardScreen } from './insert_card_screen';
import { electionDefinition } from '../../test/helpers/election';

let apiMock: ApiMock;

beforeEach(() => {
  window.kiosk = fakeKiosk();
  apiMock = createApiMock();
});

afterEach(() => {
  window.kiosk = undefined;
  apiMock.mockApiClient.assertComplete();
});

test('InsertCardScreen renders nothing if getPrecinctSelectionQuery is not successful', () => {
  apiMock.mockApiClient.getPrecinctSelection
    .expectCallWith()
    .throws('test error');

  render(
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider client={createQueryClient()}>
        <InsertCardScreen
          electionDefinition={electionDefinition}
          showNoChargerAttachedWarning={false}
          isLiveMode={false}
          pollsState="polls_closed_initial"
          showNoAccessibleControllerWarning={false}
        />
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
  expect(screen.queryByText('Election ID')).toBeNull();
});

test('InsertCardScreen renders correctly if getPrecinctSelectionQuery returns null', async () => {
  apiMock.mockApiClient.getPrecinctSelection.expectCallWith().resolves(null);

  render(
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider client={createQueryClient()}>
        <InsertCardScreen
          electionDefinition={electionDefinition}
          showNoChargerAttachedWarning={false}
          isLiveMode={false}
          pollsState="polls_closed_initial"
          showNoAccessibleControllerWarning={false}
        />
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
  expect(await screen.findByText('Election ID')).toBeDefined();
});
