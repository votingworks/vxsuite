import { beforeEach, afterEach, expect, test, vi, vitest } from 'vitest';
import { Buffer } from 'node:buffer';
import { err } from '@votingworks/basics';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import { DippedSmartCardAuthApi } from '@votingworks/auth';
import { withApp } from '../test/app';
import { mockPollbookPackageFileTree } from '../test/pollbook_package';

let mockNodeEnv: 'production' | 'test' = 'test';

function mockElectionManagerAuth(auth: DippedSmartCardAuthApi) {
  vi.mocked(auth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: mockElectionManagerUser({}),
      sessionExpiresAt: mockSessionExpiresAt(),
    })
  );
}

vi.mock(
  './globals.js',
  async (importActual): Promise<typeof import('./globals')> => ({
    ...(await importActual()),
    get NODE_ENV(): 'production' | 'test' {
      return mockNodeEnv;
    },
  })
);

beforeEach(() => {
  mockNodeEnv = 'test';
  vi.clearAllMocks();
  vitest.useFakeTimers();
});

afterEach(() => {
  vitest.useRealTimers();
});

test('uses machine config from env', async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    VX_MACHINE_ID: 'test-machine-id',
    VX_CODE_VERSION: 'test-code-version',
  };

  await withApp(async ({ localApiClient }) => {
    expect(await localApiClient.getMachineConfig()).toEqual({
      machineId: 'test-machine-id',
      codeVersion: 'test-code-version',
    });
  });

  process.env = originalEnv;
});

test('app config - unhappy paths polling usb', async () => {
  await withApp(async ({ localApiClient, mockUsbDrive, auth }) => {
    expect(await localApiClient.getElection()).toEqual(err('unconfigured'));
    // Add an invalid pollbook package to the USB drive
    mockUsbDrive.insertUsbDrive({});
    // Advance timers and wait for the interval to trigger
    vitest.advanceTimersByTime(100);

    // Check that we are still unconfigured since the pollbook-package was invalid
    expect(await localApiClient.getElection()).toEqual(err('unconfigured'));

    mockElectionManagerAuth(auth);
    vitest.advanceTimersByTime(100);
    expect(await localApiClient.getElection()).toEqual(err('not-found'));

    mockUsbDrive.insertUsbDrive({
      'invalid-pollbook-package-path.zip': Buffer.from('invalid'),
    });
    vi.advanceTimersByTime(100);
    expect(await localApiClient.getElection()).toEqual(err('not-found'));

    mockUsbDrive.removeUsbDrive();
    vi.advanceTimersByTime(100);
    expect(await localApiClient.getElection()).toEqual(err('unconfigured'));

    mockUsbDrive.insertUsbDrive({
      'pollbook-package.zip': Buffer.from('invalid'),
    });
    vi.advanceTimersByTime(100);
    await vi.waitFor(async () => {
      expect(await localApiClient.getElection()).toEqual(err('not-found'));
    });
  });
});

test('app config - happy path polling usb from backend', async () => {
  await withApp(async ({ localApiClient, mockUsbDrive, auth }) => {
    expect(await localApiClient.getElection()).toEqual(err('unconfigured'));

    mockElectionManagerAuth(auth);
    vitest.advanceTimersByTime(200);
    expect(await localApiClient.getElection()).toEqual(err('unconfigured'));

    // Add a valid pollbook package to the USB drive
    mockUsbDrive.insertUsbDrive(
      await mockPollbookPackageFileTree(
        electionFamousNames2021Fixtures.electionJson.asBuffer(),
        electionFamousNames2021Fixtures.pollbookVoters.asText(),
        electionFamousNames2021Fixtures.pollbookStreetNames.asText()
      )
    );
    vitest.advanceTimersByTime(100);
    expect(await localApiClient.getElection()).toEqual(err('loading'));
    // Allow time for the pollbook package to be read
    await vi.waitFor(async () => {
      const result = await localApiClient.getElection();
      // Configured for proper election
      expect(result.unsafeUnwrap().id).toEqual(
        electionFamousNames2021Fixtures.electionJson.readElection().id
      );
    });
  });
});
