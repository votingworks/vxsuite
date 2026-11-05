import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { BooleanEnvironmentVariableName } from '@votingworks/utils';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import {
  type DippedSmartCardAuth,
  constructElectionKey,
} from '@votingworks/types';
import { screen, waitFor, within } from '../../test/react_testing_library.js';
import {
  eitherNeitherElectionDefinition,
  renderInAppContext,
} from '../../test/render_in_app_context.js';
import {
  type ApiMock,
  createApiMock,
} from '../../test/helpers/mock_api_client.js';
import { AppRoutes } from '../components/app_routes.js';
import { routerPaths } from '../router_paths.js';

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

const systemAdministratorAuth: DippedSmartCardAuth.SystemAdministratorLoggedIn =
  {
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  };

const electionManagerAuth: DippedSmartCardAuth.ElectionManagerLoggedIn = {
  status: 'logged_in',
  user: mockElectionManagerUser({
    electionKey: constructElectionKey(eitherNeitherElectionDefinition.election),
  }),
  sessionExpiresAt: mockSessionExpiresAt(),
};

let apiMock: ApiMock;

beforeEach(() => {
  featureFlagMock.resetFeatureFlags();
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('system administrator sees the election definition screen when the flag is on', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_ADMIN_ELECTION_DESIGN
  );
  const history = createMemoryHistory({
    initialEntries: [routerPaths.electionDefinition],
  });
  renderInAppContext(<AppRoutes />, {
    apiMock,
    auth: systemAdministratorAuth,
    history,
  });

  await screen.findByRole('heading', { name: 'Election Definition' });
  screen.getByText('Not Yet Implemented');
  const nav = screen.getByRole('navigation');
  expect(
    within(nav)
      .getAllByRole('button')
      .map((button) => button.textContent)
  ).toEqual(['Back', 'Definition']);

  await userEvent.click(within(nav).getButton('Back'));
  expect(history.location.pathname).toEqual(routerPaths.election);
});

test('system administrator has no election definition screen when the flag is off', async () => {
  const history = createMemoryHistory({
    initialEntries: [routerPaths.electionDefinition],
  });
  renderInAppContext(<AppRoutes />, {
    apiMock,
    auth: systemAdministratorAuth,
    history,
  });

  await screen.findByRole('heading', { name: 'Election' });
  expect(history.location.pathname).toEqual(routerPaths.election);
});

test('election manager has no election definition screen when the flag is on', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_ADMIN_ELECTION_DESIGN
  );
  const history = createMemoryHistory({
    initialEntries: [routerPaths.electionDefinition],
  });
  renderInAppContext(<AppRoutes />, {
    apiMock,
    auth: electionManagerAuth,
    history,
  });

  await screen.findByRole('heading', { name: 'Election' });
  await waitFor(() =>
    expect(history.location.pathname).toEqual(routerPaths.election)
  );
});
