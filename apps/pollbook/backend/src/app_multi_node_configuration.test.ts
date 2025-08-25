import { beforeEach, expect, test, vi, vitest } from 'vitest';

import {
  electionSimpleSinglePrecinctFixtures,
  electionMultiPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { AddressInfo } from 'node:net';
import { err, ok } from '@votingworks/basics';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from 'js-sha256';
import {
  extendedWaitFor,
  mockElectionManagerAuth,
  mockLoggedOut,
  setupUnconfiguredPollbooksOnNetwork,
  withManyApps,
} from '../test/app';
import {
  parseValidStreetsFromCsvString,
  parseVotersFromCsvString,
} from './pollbook_package';
import { PollbookConnectionStatus } from './types';
import {
  NETWORK_POLLING_INTERVAL,
  UNCONFIGURE_LOCKOUT_TIMEOUT,
} from './globals';
import { AvahiService, hasOnlineInterface } from './avahi';
import { mockPollbookPackageZip } from '../test/pollbook_package';

let mockNodeEnv: 'production' | 'test' = 'test';
const singlePrecinctElectionDefinition =
  electionSimpleSinglePrecinctFixtures.readElectionDefinition();

const testVoters = parseVotersFromCsvString(
  electionSimpleSinglePrecinctFixtures.pollbookTownVoters.asText(),
  singlePrecinctElectionDefinition.election
);
const testStreets = parseValidStreetsFromCsvString(
  electionSimpleSinglePrecinctFixtures.pollbookTownStreetNames.asText(),
  singlePrecinctElectionDefinition.election
);

vi.mock(
  './globals.js',
  async (importActual): Promise<typeof import('./globals.js')> => ({
    ...(await importActual()),
    get NODE_ENV(): 'production' | 'test' {
      return mockNodeEnv;
    },
  })
);

vi.mock('./avahi.js', () => ({
  hasOnlineInterface: vi.fn().mockResolvedValue(false),
  AvahiService: {
    advertiseHttpService: vi.fn().mockReturnValue(undefined),
    stopAdvertisedService: vi.fn(),
    discoverHttpServices: vi.fn().mockResolvedValue([]),
  },
}));

const mockHasOnlineInterface = vi.mocked(hasOnlineInterface);
const mockDiscoverHttpServices = vi.spyOn(AvahiService, 'discoverHttpServices');

beforeEach(() => {
  vi.useFakeTimers();
  mockNodeEnv = 'test';
  vi.clearAllMocks();
  mockDiscoverHttpServices.mockResolvedValue([]);
  mockHasOnlineInterface.mockResolvedValue(false);
});

vitest.setConfig({
  testTimeout: 10_000,
});

test('one pollbook can be configured from another pollbook', async () => {
  await withManyApps(2, async ([pollbookContext1, pollbookContext2]) => {
    await setupUnconfiguredPollbooksOnNetwork(
      [pollbookContext1, pollbookContext2],
      vitest,
      mockHasOnlineInterface,
      mockDiscoverHttpServices
    );
    pollbookContext1.workspace.store.setElectionAndVoters(
      singlePrecinctElectionDefinition,
      'mock-package-hash',
      testStreets,
      testVoters
    );
    const zipPath = join(
      pollbookContext1.workspace.assetDirectoryPath,
      'pollbook-package.zip'
    );
    if (existsSync(zipPath)) {
      unlinkSync(zipPath);
    }
    expect(
      await pollbookContext2.peerApiClient.configureFromPeerMachine({
        machineId: 'bad-machine-id',
      })
    ).toEqual(err('pollbook-connection-problem'));
    // We have not set up the zip asset on pollbook1 so it will create an error.
    expect(
      await pollbookContext2.peerApiClient.configureFromPeerMachine({
        machineId: pollbookContext1.workspace.store.getMachineId(),
      })
    ).toEqual(err('pollbook-connection-problem'));

    // Write a dummy zip file
    writeFileSync(zipPath, 'fakecontent');
    expect(
      await pollbookContext2.peerApiClient.configureFromPeerMachine({
        machineId: pollbookContext1.workspace.store.getMachineId(),
      })
    ).toEqual(err('invalid-pollbook-package'));
    const validZip = await mockPollbookPackageZip(
      electionSimpleSinglePrecinctFixtures.electionSinglePrecinctBase.asBuffer(),
      electionSimpleSinglePrecinctFixtures.pollbookTownVoters.asText(),
      electionSimpleSinglePrecinctFixtures.pollbookTownStreetNames.asText()
    );

    writeFileSync(zipPath, new Uint8Array(validZip));
    expect(
      await pollbookContext2.peerApiClient.configureFromPeerMachine({
        machineId: pollbookContext1.workspace.store.getMachineId(),
      })
    ).toEqual(ok());
    expect(
      await pollbookContext2.peerApiClient.getPollbookConfigurationInformation()
    ).toMatchObject({
      electionBallotHash: singlePrecinctElectionDefinition.ballotHash,
      electionId: singlePrecinctElectionDefinition.election.id,
      electionTitle: singlePrecinctElectionDefinition.election.title,
      pollbookPackageHash: sha256(new Uint8Array(validZip)),
      machineId: 'test-1',
      codeVersion: 'test',
    });

    expect(
      await pollbookContext2.peerApiClient.configureFromPeerMachine({
        machineId: pollbookContext1.workspace.store.getMachineId(),
      })
    ).toEqual(err('already-configured'));
  });
});

test('pollbooks cannot configure if code version does not match', async () => {
  await withManyApps(
    2,
    async ([pollbookContext1, pollbookContext2]) => {
      // Configure the first pollbook
      pollbookContext1.workspace.store.setElectionAndVoters(
        singlePrecinctElectionDefinition,
        'fake-package-hash',
        testStreets,
        testVoters
      );
      const zipPath = join(
        pollbookContext1.workspace.assetDirectoryPath,
        'pollbook-package.zip'
      );
      if (existsSync(zipPath)) {
        unlinkSync(zipPath);
      }

      const validZip = await mockPollbookPackageZip(
        electionSimpleSinglePrecinctFixtures.electionSinglePrecinctBase.asBuffer(),
        electionSimpleSinglePrecinctFixtures.pollbookTownVoters.asText(),
        electionSimpleSinglePrecinctFixtures.pollbookTownStreetNames.asText()
      );

      writeFileSync(zipPath, new Uint8Array(validZip));

      // Set both pollbooks so they are online and can see one another.
      const { port: port1 } =
        pollbookContext1.peerServer.address() as AddressInfo;
      const { port: port2 } =
        pollbookContext2.peerServer.address() as AddressInfo;

      pollbookContext1.mockUsbDrive.removeUsbDrive();
      mockHasOnlineInterface.mockResolvedValue(true);
      mockDiscoverHttpServices.mockResolvedValue([
        {
          name: 'Pollbook-test-0',
          host: 'local',
          resolvedIp: 'localhost',
          port: port1.toString(),
        },
        {
          name: 'Pollbook-test-1',
          host: 'local',
          resolvedIp: 'localhost',
          port: port2.toString(),
        },
      ]);
      await extendedWaitFor(async () => {
        vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
        expect(
          await pollbookContext1.localApiClient.getDeviceStatuses()
        ).toMatchObject({
          network: {
            isOnline: true,
            pollbooks: [
              expect.objectContaining({
                status: PollbookConnectionStatus.IncompatibleSoftwareVersion,
              }),
            ],
          },
        });
      });
      expect(
        await pollbookContext2.peerApiClient.configureFromPeerMachine({
          machineId: pollbookContext1.workspace.store.getMachineId(),
        })
      ).toEqual(err('pollbook-connection-problem'));
    },
    true
  );
});

test('one pollbook can be configured from another pollbook automatically as an election manager', async () => {
  await withManyApps(
    3,
    async ([pollbookContext1, pollbookContext2, pollbookContext3]) => {
      // Configure the first pollbook
      pollbookContext1.workspace.store.setElectionAndVoters(
        singlePrecinctElectionDefinition,
        'mock-package-hash',
        testStreets,
        testVoters
      );
      pollbookContext3.workspace.store.setElectionAndVoters(
        singlePrecinctElectionDefinition,
        'not-the-same-package-hash',
        testStreets,
        testVoters
      );
      const zipPath = join(
        pollbookContext1.workspace.assetDirectoryPath,
        'pollbook-package.zip'
      );
      if (existsSync(zipPath)) {
        unlinkSync(zipPath);
      }

      mockElectionManagerAuth(
        pollbookContext2.auth,
        singlePrecinctElectionDefinition.election
      );
      await extendedWaitFor(async () => {
        vitest.advanceTimersByTime(100);
        expect(
          (await pollbookContext2.localApiClient.getElection()).err()
        ).toEqual('not-found-network');
      });
      mockLoggedOut(pollbookContext2.auth);
      await extendedWaitFor(async () => {
        vitest.advanceTimersByTime(100);
        expect(
          (await pollbookContext2.localApiClient.getElection()).err()
        ).toEqual('unconfigured');
      });
      await setupUnconfiguredPollbooksOnNetwork(
        [pollbookContext1, pollbookContext2, pollbookContext3],
        vitest,
        mockHasOnlineInterface,
        mockDiscoverHttpServices
      );

      // use the wrong election manager card
      mockElectionManagerAuth(
        pollbookContext2.auth,
        electionMultiPartyPrimaryFixtures.readElection()
      );
      await extendedWaitFor(async () => {
        vitest.advanceTimersByTime(100);
        expect(
          (await pollbookContext2.localApiClient.getElection()).err()
        ).toEqual('not-found-configuration-matching-election-card');
      });
      mockLoggedOut(pollbookContext2.auth);
      vitest.advanceTimersByTime(100);

      const { port: port1 } =
        pollbookContext1.peerServer.address() as AddressInfo;
      const { port: port2 } =
        pollbookContext2.peerServer.address() as AddressInfo;

      mockElectionManagerAuth(
        pollbookContext2.auth,
        singlePrecinctElectionDefinition.election
      );
      await extendedWaitFor(async () => {
        vitest.advanceTimersByTime(100);
        expect(
          (await pollbookContext2.localApiClient.getElection()).err()
        ).toEqual('network-conflicting-pollbook-packages-match-card');
      });
      mockLoggedOut(pollbookContext2.auth);

      // Remove the third pollbook to test the happy path
      mockDiscoverHttpServices.mockResolvedValue([
        {
          name: 'Pollbook-test-0',
          host: 'local',
          resolvedIp: 'localhost',
          port: port1.toString(),
        },
        {
          name: 'Pollbook-test-1',
          host: 'local',
          resolvedIp: 'localhost',
          port: port2.toString(),
        },
      ]);
      await extendedWaitFor(async () => {
        vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
        expect(
          await pollbookContext2.localApiClient.getDeviceStatuses()
        ).toMatchObject({
          network: {
            isOnline: true,
            pollbooks: [
              expect.objectContaining({
                status: PollbookConnectionStatus.ShutDown,
              }),
              expect.objectContaining({
                status: PollbookConnectionStatus.MismatchedConfiguration,
              }),
            ],
          },
        });
      });

      // Write an invalid zip file to test the error condition
      writeFileSync(zipPath, 'fakecontent');
      mockElectionManagerAuth(
        pollbookContext2.auth,
        singlePrecinctElectionDefinition.election
      );
      await extendedWaitFor(async () => {
        vitest.advanceTimersByTime(100);
        expect(
          (await pollbookContext2.localApiClient.getElection()).err()
        ).toEqual('network-configuration-error');
        // Check that this state persists on the next loop
        vitest.advanceTimersByTime(100);
        expect(
          (await pollbookContext2.localApiClient.getElection()).err()
        ).toEqual('network-configuration-error');
      });

      mockLoggedOut(pollbookContext2.auth);
      await extendedWaitFor(async () => {
        vitest.advanceTimersByTime(100);
        expect(
          (await pollbookContext2.localApiClient.getElection()).err()
        ).toEqual('unconfigured');
      });

      const validZip = await mockPollbookPackageZip(
        electionSimpleSinglePrecinctFixtures.electionSinglePrecinctBase.asBuffer(),
        electionSimpleSinglePrecinctFixtures.pollbookTownVoters.asText(),
        electionSimpleSinglePrecinctFixtures.pollbookTownStreetNames.asText()
      );
      writeFileSync(zipPath, new Uint8Array(validZip));
      mockElectionManagerAuth(
        pollbookContext2.auth,
        singlePrecinctElectionDefinition.election
      );
      await extendedWaitFor(async () => {
        vitest.advanceTimersByTime(100);
        expect(
          await pollbookContext2.peerApiClient.getPollbookConfigurationInformation()
        ).toMatchObject({
          electionBallotHash: singlePrecinctElectionDefinition.ballotHash,
          electionId: singlePrecinctElectionDefinition.election.id,
          electionTitle: singlePrecinctElectionDefinition.election.title,
          pollbookPackageHash: sha256(new Uint8Array(validZip)),
          machineId: 'test-1',
        });
        const election = await pollbookContext2.localApiClient.getElection();
        expect(election.ok()).toEqual(
          singlePrecinctElectionDefinition.election
        );
      }, 6000);

      expect(
        await pollbookContext2.peerApiClient.configureFromPeerMachine({
          machineId: pollbookContext1.workspace.store.getMachineId(),
        })
      ).toEqual(err('already-configured'));

      pollbookContext2.mockUsbDrive.usbDrive.eject.expectCallWith().resolves();
      void pollbookContext2.localApiClient.unconfigure();
      expect(
        (await pollbookContext2.localApiClient.getElection()).err()
      ).toEqual('recently-unconfigured');
      vi.advanceTimersByTime(UNCONFIGURE_LOCKOUT_TIMEOUT);
      expect(
        (await pollbookContext2.localApiClient.getElection()).err()
      ).toEqual('unconfigured');
    }
  );
});
