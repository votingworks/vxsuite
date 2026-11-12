import { afterEach, beforeEach, test, vi } from 'vitest';
import { BrowserRouter, MemoryRouter, Route } from 'react-router-dom';
import { err } from '@votingworks/basics';
import {
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { BooleanEnvironmentVariableName } from '@votingworks/utils';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { screen } from '../test/react_testing_library.js';
import { renderRootElement } from '../test/render_in_app_context.js';
import { AppRoot } from './app_root.js';
import {
  type ApiMock,
  createApiMock,
} from '../test/helpers/mock_api_client.js';

const featureFlagMock = vi.hoisted(() => {
  // eslint-disable-next-line global-require
  const { getFeatureFlagMock } = require('@votingworks/utils');
  return getFeatureFlagMock();
});
vi.mock('@votingworks/utils', async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

let apiMock: ApiMock;

beforeEach(() => {
  featureFlagMock.resetFeatureFlags();
  apiMock = createApiMock();
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
    { apiMock }
  );

  await screen.findByText('VxAdmin Locked');
});

test('loads whether election definition is enabled when the flag is on', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_ADMIN_ELECTION_DESIGN
  );
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  });
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectGetMachineConfig();
  apiMock.expectGetUsbDriveStatus('no_drive');
  apiMock.apiClient.isElectionDefinitionEnabled.expectCallWith().resolves(true);
  apiMock.apiClient.listPotentialElectionPackagesOnUsbDrive
    .expectCallWith()
    .resolves(err({ type: 'no-entity', message: 'No USB drive found' }));
  apiMock.electionDefinitionApiClient.getCurrentInProgressElection
    .expectCallWith()
    .resolves(null);
  renderRootElement(
    <MemoryRouter initialEntries={['/election']}>
      <Route path="/" render={() => <AppRoot />} />
    </MemoryRouter>,
    { apiMock }
  );

  await screen.findButton('Create New Election');
});
