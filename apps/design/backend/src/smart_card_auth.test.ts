import { expect, test, vi } from 'vitest';
import {
  buildMockDippedSmartCardAuth,
  DEV_JURISDICTION,
  DippedSmartCardAuthMachineState,
} from '@votingworks/auth';
import {
  DEFAULT_SYSTEM_SETTINGS,
  DippedSmartCardAuth,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { SmartCardAuthClient } from './smart_card_auth.js';
import { vxOrganization } from '../test/mocks.js';

const machineState: DippedSmartCardAuthMachineState = {
  ...DEFAULT_SYSTEM_SETTINGS.auth,
  jurisdiction: DEV_JURISDICTION,
  machineType: 'design',
};

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

test('SmartCardAuthClient forwards auth actions to the smart card auth API', async () => {
  const mockAuth = buildMockDippedSmartCardAuth(vi.fn);
  const auth = new SmartCardAuthClient(mockAuth);

  expect(await auth.getAuthStatus()).toEqual(
    DippedSmartCardAuth.DEFAULT_AUTH_STATUS
  );
  expect(mockAuth.getAuthStatus).toHaveBeenCalledWith(machineState);

  await auth.checkPin({ pin: '123456' });
  expect(mockAuth.checkPin).toHaveBeenCalledWith(machineState, {
    pin: '123456',
  });

  auth.logOut();
  expect(mockAuth.logOut).toHaveBeenCalledWith(machineState);
});

test('SmartCardAuthClient uses the configured machine jurisdiction', async () => {
  vi.stubEnv('VX_MACHINE_JURISDICTION', TEST_JURISDICTION);
  const mockAuth = buildMockDippedSmartCardAuth(vi.fn);
  const auth = new SmartCardAuthClient(mockAuth);

  await auth.getAuthStatus();
  expect(mockAuth.getAuthStatus).toHaveBeenCalledWith({
    ...machineState,
    jurisdiction: TEST_JURISDICTION,
  });

  vi.unstubAllEnvs();
});

test('SmartCardAuthClient authenticates a logged-in system administrator', async () => {
  const mockAuth = buildMockDippedSmartCardAuth(vi.fn);
  mockAuth.getAuthStatus.mockResolvedValue(systemAdministratorAuthStatus);
  const auth = new SmartCardAuthClient(mockAuth);

  expect(await auth.getUser()).toEqual({
    type: 'support_user',
    id: 'smart-card|system-administrator',
    name: 'System Administrator',
    organization: { id: vxOrganization.id, name: 'VotingWorks' },
  });
});

test('SmartCardAuthClient returns no user when the machine is locked', async () => {
  const mockAuth = buildMockDippedSmartCardAuth(vi.fn);
  const auth = new SmartCardAuthClient(mockAuth);

  expect(await auth.getUser()).toBeUndefined();
});
