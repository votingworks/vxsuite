import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { electionGeneralFixtures } from '@votingworks/fixtures';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import { DippedSmartCardAuthApi } from '@votingworks/auth';
import { ElectionDefinition, constructElectionKey } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { Server } from 'node:http';
import * as grout from '@votingworks/grout';
import { Api } from './app';
import { createApp } from '../test/app_helpers';

const electionGeneralDefinition =
  electionGeneralFixtures.readElectionDefinition();
const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

let apiClient: grout.Client<Api>;
let mockAuth: DippedSmartCardAuthApi;
let server: Server;

function mockElectionManagerAuth(electionDefinition: ElectionDefinition) {
  vi.mocked(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: mockElectionManagerUser({
        electionKey: constructElectionKey(electionDefinition.election),
      }),
      sessionExpiresAt: mockSessionExpiresAt(),
    })
  );
}

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  ({ apiClient, mockAuth, server } = createApp());
});

afterEach(() => {
  server?.close();
});

test('returns auth status', async () => {
  mockElectionManagerAuth(electionGeneralDefinition);
  expect(await apiClient.getAuthStatus()).toEqual({
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(electionGeneralDefinition.election),
    }),
    sessionExpiresAt: expect.any(Date),
  });
  expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(1);
});
