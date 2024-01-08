import { fakeKiosk } from '@votingworks/test-utils';
import { QueryClientProvider } from '@tanstack/react-query';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
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

test('renders correctly', async () => {
  render(
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider client={createQueryClient()}>
        <InsertCardScreen
          appPrecinct={ALL_PRECINCTS_SELECTION}
          electionDefinition={electionDefinition}
          showNoChargerAttachedWarning={false}
          isLiveMode={false}
          pollsState="polls_closed_initial"
        />
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
  expect(await screen.findByText('Election ID')).toBeDefined();
});
