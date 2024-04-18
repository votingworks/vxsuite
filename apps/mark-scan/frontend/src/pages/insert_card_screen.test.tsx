import { mockKiosk } from '@votingworks/test-utils';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { screen } from '../../test/react_testing_library';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { render } from '../../test/test_utils';
import { InsertCardScreen } from './insert_card_screen';
import { electionDefinition } from '../../test/helpers/election';
import { ApiProvider } from '../api_provider';

let apiMock: ApiMock;

beforeEach(() => {
  window.kiosk = mockKiosk();
  apiMock = createApiMock();
});

afterEach(() => {
  window.kiosk = undefined;
  apiMock.mockApiClient.assertComplete();
});

test('renders correctly', async () => {
  render(
    <ApiProvider apiClient={apiMock.mockApiClient} noAudio>
      <InsertCardScreen
        appPrecinct={ALL_PRECINCTS_SELECTION}
        electionDefinition={electionDefinition}
        showNoChargerAttachedWarning={false}
        isLiveMode={false}
        pollsState="polls_closed_initial"
      />
    </ApiProvider>
  );
  expect(await screen.findByText('Election ID')).toBeDefined();
});
