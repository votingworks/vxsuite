import { afterAll, beforeEach, expect, test, vi } from 'vitest';
import {
  buildMockDippedSmartCardAuth,
  DEV_JURISDICTION,
} from '@votingworks/auth';
import { DippedSmartCardAuth } from '@votingworks/types';
import { SmartCardAuthClient } from './smart_card_auth.js';
import { testSetupHelpers } from '../test/helpers.js';
import { jurisdictions, organizations, users } from '../test/mocks.js';

const { setupApp, cleanup } = testSetupHelpers();

const systemAdministratorAuthStatus: DippedSmartCardAuth.AuthStatus = {
  status: 'logged_in',
  user: {
    role: 'system_administrator',
    jurisdiction: DEV_JURISDICTION,
    programmingMachineType: 'admin',
  },
  sessionExpiresAt: new Date(),
  programmableCard: { status: 'no_card' },
};

let mockAuth: ReturnType<typeof buildMockDippedSmartCardAuth>;

beforeEach(() => {
  mockAuth = buildMockDippedSmartCardAuth(vi.fn);
});

afterAll(cleanup);

function setupSmartCardApp() {
  return setupApp({
    organizations,
    jurisdictions,
    users,
    smartCardAuth: new SmartCardAuthClient(mockAuth),
  });
}

test('deployments that use Auth0 report no smart card auth status', async () => {
  const { smartCardAuthApiClient } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  expect(await smartCardAuthApiClient.getAuthStatus()).toBeNull();
});

test('smart card auth status and PIN checks are accessible while locked', async () => {
  const { smartCardAuthApiClient } = await setupSmartCardApp();

  expect(await smartCardAuthApiClient.getAuthStatus()).toEqual(
    DippedSmartCardAuth.DEFAULT_AUTH_STATUS
  );

  await smartCardAuthApiClient.checkPin({ pin: '123456' });
  expect(mockAuth.checkPin).toHaveBeenCalledWith(expect.anything(), {
    pin: '123456',
  });
});

test('a locked machine rejects API calls', async () => {
  const { apiClient } = await setupSmartCardApp();

  await expect(apiClient.getUser()).rejects.toThrow('auth:unauthorized');
});

test('a system administrator card grants access to all jurisdictions', async () => {
  const { apiClient } = await setupSmartCardApp();
  mockAuth.getAuthStatus.mockResolvedValue(systemAdministratorAuthStatus);

  expect(await apiClient.getUser()).toEqual({
    type: 'support_user',
    id: 'smart-card|system-administrator',
    name: 'System Administrator',
    organization: expect.objectContaining({ name: 'VotingWorks' }),
  });
  expect(await apiClient.listJurisdictions()).toHaveLength(
    jurisdictions.length
  );
});

test('the login route sends the user to the machine-locked screen', async () => {
  const { baseUrl } = await setupSmartCardApp();

  const response = await fetch(`${baseUrl}/auth/login`, {
    redirect: 'manual',
  });
  expect(response.status).toEqual(302);
  expect(response.headers.get('location')).toEqual('/');
});

test('the logout route locks the machine', async () => {
  const { baseUrl } = await setupSmartCardApp();

  const response = await fetch(`${baseUrl}/auth/logout`, {
    redirect: 'manual',
  });
  expect(response.status).toEqual(302);
  expect(response.headers.get('location')).toEqual('/');
  expect(mockAuth.logOut).toHaveBeenCalled();
});

test('the login and logout routes are not registered for Auth0 deployments', async () => {
  const { baseUrl } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  // The catch-all route serves the frontend instead of redirecting.
  for (const path of ['/auth/login', '/auth/logout']) {
    const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
    expect(response.status).toEqual(200);
  }
});
