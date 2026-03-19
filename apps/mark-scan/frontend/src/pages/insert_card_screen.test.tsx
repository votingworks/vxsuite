import { afterEach, beforeEach, expect, test } from 'vitest';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { screen } from '../../test/react_testing_library.js';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client.js';
import { render } from '../../test/test_utils.js';
import { InsertCardScreen } from './insert_card_screen.js';
import { electionDefinition } from '../../test/helpers/election.js';
import { ApiProvider } from '../api_provider.js';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('renders correctly', async () => {
  render(
    <ApiProvider apiClient={apiMock.mockApiClient} noAudio>
      <InsertCardScreen
        appPrecinct={ALL_PRECINCTS_SELECTION}
        electionDefinition={electionDefinition}
        electionPackageHash="test-election-package-hash"
        isLiveMode={false}
        pollsState="polls_closed_initial"
      />
    </ApiProvider>
  );
  expect(await screen.findByText('Election ID')).toBeDefined();
});
