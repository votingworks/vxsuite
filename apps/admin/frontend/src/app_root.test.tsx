import { afterEach, beforeEach, test } from 'vitest';
import fetchMock from 'fetch-mock';
import { BrowserRouter, Route } from 'react-router-dom';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { screen } from '../test/react_testing_library';
import { renderRootElement } from '../test/render_in_app_context';
import { AppRoot } from './app_root';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  fetchMock.get(/^\/convert/, {});
});

afterEach(() => {
  apiMock.assertComplete();
});

test('renders without crashing', async () => {
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  apiMock.expectGetCurrentElectionMetadata({
    electionDefinition: readElectionTwoPartyPrimaryDefinition(),
  });
  apiMock.expectGetMachineConfig();
  apiMock.expectGetUsbDriveStatus('mounted');
  renderRootElement(
    <BrowserRouter>
      <Route path="/" render={() => <AppRoot />} />
    </BrowserRouter>,
    { apiClient: apiMock.apiClient }
  );

  await screen.findByText('VxAdmin Locked');
});
