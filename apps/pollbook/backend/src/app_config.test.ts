import { beforeEach, afterEach, expect, test, vi, vitest } from 'vitest';
import { Buffer } from 'node:buffer';
import { err } from '@votingworks/basics';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import {
  mockElectionManagerAuth,
  mockSystemAdministratorAuth,
  withApp,
} from '../test/app';
import { mockPollbookPackageFileTree } from '../test/pollbook_package';
import { CONFIGURATION_POLLING_INTERVAL } from './globals';
import { parseValidStreetsFromCsvString } from './pollbook_package';

const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();

let mockNodeEnv: 'production' | 'test' = 'test';

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
    expect(await localApiClient.getPollbookConfigurationInformation()).toEqual({
      machineId: 'test-machine-id',
      codeVersion: 'test-code-version',
    });
  });

  process.env = originalEnv;
});

test('app config - unhappy paths polling usb', async () => {
  await withApp(async ({ localApiClient, mockUsbDrive, auth }) => {
    expect(await localApiClient.getElection()).toEqual(err('unconfigured'));
    // Load a usb drive with no pollbook package
    mockUsbDrive.insertUsbDrive({});
    vitest.advanceTimersByTime(CONFIGURATION_POLLING_INTERVAL);

    // Check that we are still unconfigured as the usb will not be processed until authentication
    expect(await localApiClient.getElection()).toEqual(err('unconfigured'));

    mockSystemAdministratorAuth(auth);
    vitest.advanceTimersByTime(CONFIGURATION_POLLING_INTERVAL);
    // The usb should now be processed and return a not found error since there is no package
    await vi.waitFor(async () => {
      expect(await localApiClient.getElection()).toEqual(err('not-found-usb'));
    });

    mockUsbDrive.insertUsbDrive({
      'invalid-pollbook-package-path.zip': Buffer.from('invalid'),
    });
    vi.advanceTimersByTime(CONFIGURATION_POLLING_INTERVAL);
    await vi.waitFor(async () => {
      expect(await localApiClient.getElection()).toEqual(err('not-found-usb'));
    });

    mockUsbDrive.removeUsbDrive();
    vi.advanceTimersByTime(CONFIGURATION_POLLING_INTERVAL);
    expect(await localApiClient.getElection()).toEqual(err('unconfigured'));

    mockUsbDrive.insertUsbDrive({
      'pollbook-package-invalid.zip': Buffer.from('invalid'),
    });
    vi.advanceTimersByTime(CONFIGURATION_POLLING_INTERVAL);
    await vi.waitFor(async () => {
      expect(await localApiClient.getElection()).toEqual(
        err('usb-configuration-error')
      );
    });

    mockUsbDrive.removeUsbDrive();
    vi.advanceTimersByTime(100);
    expect(await localApiClient.getElection()).toEqual(err('unconfigured'));

    mockUsbDrive.insertUsbDrive({
      'pollbook-package-invalid.zip': Buffer.from('invalid'),
    });
    vi.advanceTimersByTime(100);
    await vi.waitFor(async () => {
      expect(await localApiClient.getElection()).toEqual(
        err('usb-configuration-error')
      );
    });

    mockUsbDrive.insertUsbDrive(
      await mockPollbookPackageFileTree(
        Buffer.from('invalid'),
        'invalid',
        'invalid'
      )
    );
    vi.advanceTimersByTime(100);
    await vi.waitFor(async () => {
      expect(await localApiClient.getElection()).toEqual(
        err('usb-configuration-error')
      );
    });
  });
});

test('app config - polling usb from backend does not trigger with election manager auth', async () => {
  await withApp(async ({ localApiClient, mockUsbDrive, auth }) => {
    expect(await localApiClient.getElection()).toEqual(err('unconfigured'));

    mockElectionManagerAuth(
      auth,
      electionFamousNames2021Fixtures.readElection()
    );
    vitest.advanceTimersByTime(CONFIGURATION_POLLING_INTERVAL);
    expect(await localApiClient.getElection()).toEqual(
      err('not-found-network')
    );

    // Add a valid pollbook package to the USB drive
    mockUsbDrive.insertUsbDrive(
      await mockPollbookPackageFileTree(
        electionFamousNames2021Fixtures.electionJson.asBuffer(),
        electionFamousNames2021Fixtures.pollbookVoters.asText(),
        electionFamousNames2021Fixtures.pollbookStreetNames.asText()
      )
    );
    // We don't actually expect the usb drive status to be called
    mockUsbDrive.usbDrive.status.reset();
    vitest.advanceTimersByTime(CONFIGURATION_POLLING_INTERVAL);
    expect(await localApiClient.getElection()).toEqual(
      err('not-found-network')
    );
  });
});

test('app config - polling usb from backend does trigger with system admin auth', async () => {
  await withApp(async ({ localApiClient, mockUsbDrive, auth }) => {
    expect(await localApiClient.getElection()).toEqual(err('unconfigured'));

    mockSystemAdministratorAuth(auth);
    vitest.advanceTimersByTime(CONFIGURATION_POLLING_INTERVAL);
    expect(await localApiClient.getElection()).toEqual(err('unconfigured'));

    // Add a valid pollbook package to the USB drive
    mockUsbDrive.insertUsbDrive(
      await mockPollbookPackageFileTree(
        electionFamousNames2021Fixtures.electionJson.asBuffer(),
        electionFamousNames2021Fixtures.pollbookVoters.asText(),
        electionFamousNames2021Fixtures.pollbookStreetNames.asText()
      )
    );
    vitest.advanceTimersByTime(CONFIGURATION_POLLING_INTERVAL);
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

test('setConfiguredPrecinct sets and getPollbookConfigurationInformation returns the configured precinct', async () => {
  await withApp(async ({ localApiClient, workspace }) => {
    // Initially, no configured precinct
    let config = await localApiClient.getPollbookConfigurationInformation();
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'fake-package-hash',
      testStreets,
      []
    );
    expect(config.configuredPrecinctId).toBeUndefined();

    // Try to set a non-existent precinct and expect an error
    await suppressingConsoleOutput(async () => {
      await expect(
        localApiClient.setConfiguredPrecinct({ precinctId: 'precinct-xyz' })
      ).rejects.toThrow(
        'Precinct with id precinct-xyz does not exist in the election'
      );
    });

    await localApiClient.setConfiguredPrecinct({
      precinctId: electionDefinition.election.precincts[0].id,
    });

    // Now it should be returned
    config = await localApiClient.getPollbookConfigurationInformation();
    expect(config.configuredPrecinctId).toEqual(
      electionDefinition.election.precincts[0].id
    );
  });
});
