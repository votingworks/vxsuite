import { beforeEach, afterEach, expect, test, vi, vitest } from 'vitest';
import { Buffer } from 'node:buffer';
import { assertDefined, err, ok } from '@votingworks/basics';
import {
  electionMultiPartyPrimaryFixtures,
  electionSimpleSinglePrecinctFixtures,
} from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  mockElectionManagerAuth,
  mockSystemAdministratorAuth,
  withApp,
} from '../test/app';
import { mockPollbookPackageFileTree } from '../test/pollbook_package';
import { CONFIGURATION_POLLING_INTERVAL } from './globals';
import { parseValidStreetsFromCsvString } from './pollbook_package';

const singlePrecinctElectionDefinition =
  electionSimpleSinglePrecinctFixtures.readElectionDefinition();
const singlePrecinctElection = singlePrecinctElectionDefinition.election;
const singlePrecinctElectionBuffer =
  electionSimpleSinglePrecinctFixtures.electionSinglePrecinctBase.asBuffer();
const singlePrecinctElectionTownVoters =
  electionSimpleSinglePrecinctFixtures.pollbookTownVoters.asText();
const singlePrecinctElectionTownStreetNames =
  electionSimpleSinglePrecinctFixtures.pollbookTownStreetNames.asText();

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

const mockFeatureFlagger = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (f) => mockFeatureFlagger.isEnabled(f),
}));

beforeEach(() => {
  mockNodeEnv = 'test';
  vi.clearAllMocks();
  vitest.useFakeTimers();
  mockFeatureFlagger.resetFeatureFlags();
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
      electionSimpleSinglePrecinctFixtures.readElection()
    );
    vitest.advanceTimersByTime(CONFIGURATION_POLLING_INTERVAL);
    expect(await localApiClient.getElection()).toEqual(
      err('not-found-network')
    );

    // Add a valid pollbook package to the USB drive
    mockUsbDrive.insertUsbDrive(
      await mockPollbookPackageFileTree(
        singlePrecinctElectionBuffer,
        singlePrecinctElectionTownVoters,
        singlePrecinctElectionTownStreetNames
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
    mockUsbDrive.removeUsbDrive();
    vitest.advanceTimersByTime(CONFIGURATION_POLLING_INTERVAL);
    expect(await localApiClient.getElection()).toEqual(err('unconfigured'));

    // Add a valid pollbook package to the USB drive
    mockUsbDrive.insertUsbDrive(
      await mockPollbookPackageFileTree(
        singlePrecinctElectionBuffer,
        singlePrecinctElectionTownVoters,
        singlePrecinctElectionTownStreetNames
      )
    );
    vitest.advanceTimersByTime(CONFIGURATION_POLLING_INTERVAL);
    expect(await localApiClient.getElection()).toEqual(err('loading'));
    // Allow time for the pollbook package to be read
    await vi.waitFor(
      async () => {
        const result = await localApiClient.getElection();
        // Configured for proper election
        expect(result.unsafeUnwrap().id).toEqual(singlePrecinctElection.id);
      },
      { timeout: 2000 }
    );
  });
});

test('setConfiguredPrecinct sets and getPollbookConfigurationInformation returns the configured precinct', async () => {
  await withApp(async ({ localApiClient, workspace }) => {
    // Initially, no configured precinct on a multi precinct election
    const multiPrecinctElection =
      electionMultiPartyPrimaryFixtures.readElectionDefinition();
    const testStreets = parseValidStreetsFromCsvString(
      electionMultiPartyPrimaryFixtures.pollbookCityStreetNames.asText(),
      multiPrecinctElection.election
    );
    workspace.store.setElectionAndVoters(
      multiPrecinctElection,
      'mock-package-hash',
      testStreets,
      []
    );
    let config = await localApiClient.getPollbookConfigurationInformation();
    expect(config.configuredPrecinctId).toBeUndefined();

    const result = await localApiClient.setConfiguredPrecinct({
      precinctId: 'precinct-xyz',
    });
    expect(result.err()).toEqual(
      new Error('Precinct with id precinct-xyz does not exist in the election')
    );

    const res = await localApiClient.setConfiguredPrecinct({
      precinctId: multiPrecinctElection.election.precincts[0].id,
    });
    expect(res.ok()).toEqual(undefined);

    // Now it should be returned
    config = await localApiClient.getPollbookConfigurationInformation();
    expect(config.configuredPrecinctId).toEqual(
      multiPrecinctElection.election.precincts[0].id
    );
  });
});

test('set/get polling place ID', async () => {
  const fixtures = electionMultiPartyPrimaryFixtures;
  const electionDef = fixtures.readElectionDefinition();
  const { election } = electionDef;
  const pollingPlace = assertDefined(election.pollingPlaces?.[0]);

  const testStreets = parseValidStreetsFromCsvString(
    fixtures.pollbookCityStreetNames.asText(),
    election
  );

  await withApp(async ({ localApiClient, workspace }) => {
    workspace.store.setElectionAndVoters(
      electionDef,
      'mock-package-hash',
      testStreets,
      []
    );

    let config = await localApiClient.getPollbookConfigurationInformation();
    expect(config.pollingPlaceId).toBeUndefined();

    const res = await localApiClient.setPollingPlaceId({ id: pollingPlace.id });
    expect(res).toEqual(ok());

    config = await localApiClient.getPollbookConfigurationInformation();
    expect(config.pollingPlaceId).toEqual(pollingPlace.id);
  });
});

test('setting a single precinct election automatically sets the configured precinct', async () => {
  await withApp(async ({ localApiClient, workspace }) => {
    // Initially, no configured precinct on a multi precinct election
    const testStreets = parseValidStreetsFromCsvString(
      electionSimpleSinglePrecinctFixtures.pollbookTownStreetNames.asText(),
      singlePrecinctElectionDefinition.election
    );
    workspace.store.setElectionAndVoters(
      singlePrecinctElectionDefinition,
      'mock-package-hash',
      testStreets,
      []
    );
    const config = await localApiClient.getPollbookConfigurationInformation();
    expect(config.configuredPrecinctId).toEqual(
      singlePrecinctElectionDefinition.election.precincts[0].id
    );
  });
});

test('automatically selects polling place for single-polling-place election', async () => {
  const { election } = singlePrecinctElectionDefinition;
  const expectedPollingPlace = assertDefined(election.pollingPlaces?.[0]);

  const testStreets = parseValidStreetsFromCsvString(
    electionSimpleSinglePrecinctFixtures.pollbookTownStreetNames.asText(),
    election
  );

  const { ENABLE_POLLING_PLACES } = BooleanEnvironmentVariableName;
  mockFeatureFlagger.enableFeatureFlag(ENABLE_POLLING_PLACES);

  await withApp(async ({ localApiClient, workspace }) => {
    workspace.store.setElectionAndVoters(
      singlePrecinctElectionDefinition,
      'mock-package-hash',
      testStreets,
      []
    );

    const config = await localApiClient.getPollbookConfigurationInformation();
    expect(config.pollingPlaceId).toEqual(expectedPollingPlace.id);
  });
});

test('setPollingPlaceId propagates exceptions as error values', async () => {
  await withApp(async ({ localApiClient }) => {
    const res = await localApiClient.setPollingPlaceId({
      id: 'should-fail-with-no-election-set',
    });
    expect(res.err()).toBeDefined();
  });
});
