import { beforeEach, expect, test, vi, vitest } from 'vitest';

import {
  electionFamousNames2021Fixtures,
  electionGeneralFixtures,
} from '@votingworks/fixtures';
import { AddressInfo } from 'node:net';
import { err, ok } from '@votingworks/basics';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from 'js-sha256';
import {
  mockElectionManagerAuth,
  mockLoggedOut,
  withManyApps,
} from '../test/app';
import {
  parseValidStreetsFromCsvString,
  parseVotersFromCsvString,
} from './pollbook_package';
import { PollbookConnectionStatus } from './types';
import {
  EVENT_POLLING_INTERVAL,
  NETWORK_POLLING_INTERVAL,
  UNCONFIGURE_LOCKOUT_TIMEOUT,
} from './globals';
import { AvahiService, hasOnlineInterface } from './avahi';
import { mockPollbookPackageZip } from '../test/pollbook_package';

let mockNodeEnv: 'production' | 'test' = 'test';
const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();

vi.mock(
  './globals.js',
  async (importActual): Promise<typeof import('./globals.js')> => ({
    ...(await importActual()),
    get NODE_ENV(): 'production' | 'test' {
      return mockNodeEnv;
    },
  })
);

const reportPrintedTime = new Date('2021-01-01T00:00:00.000');
vi.mock(import('./get_current_time.js'), async (importActual) => ({
  ...(await importActual()),
  getCurrentTime: () => reportPrintedTime.getTime(),
}));

vi.mock('./avahi.js', () => ({
  hasOnlineInterface: vi.fn().mockResolvedValue(false),
  AvahiService: {
    advertiseHttpService: vi.fn().mockReturnValue(undefined),
    stopAdvertisedService: vi.fn(),
    discoverHttpServices: vi.fn().mockResolvedValue([]),
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  mockNodeEnv = 'test';
  vi.clearAllMocks();
});

function extendedWaitFor(fn: () => void | Promise<void>) {
  return vi.waitFor(fn, { timeout: 3000 });
}

test('connection status between two pollbooks is managed properly', async () => {
  await withManyApps(2, async ([pollbookContext1, pollbookContext2]) => {
    const testVoters = parseVotersFromCsvString(
      electionFamousNames2021Fixtures.pollbookVoters.asText()
    );
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
    for (const context of [pollbookContext1, pollbookContext2]) {
      context.mockUsbDrive.insertUsbDrive({});
      expect(await context.localApiClient.getDeviceStatuses()).toMatchObject({
        network: {
          isOnline: false,
          pollbooks: [],
        },
      });
    }
    // Mock hasOnlineInterface to always return true
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    const { port: port1 } =
      pollbookContext1.peerServer.address() as AddressInfo;

    vi.spyOn(
      pollbookContext1.peerWorkspace.store,
      'getNewEvents'
    ).mockResolvedValue({
      events: [],
      hasMore: false,
    });
    vi.spyOn(
      pollbookContext2.peerWorkspace.store,
      'getNewEvents'
    ).mockResolvedValue({
      events: [],
      hasMore: false,
    });

    vi.spyOn(AvahiService, 'discoverHttpServices').mockResolvedValue([
      {
        name: 'Pollbook-test-0',
        host: 'local',
        resolvedIp: 'localhost',
        port: port1.toString(),
      },
    ]);

    await extendedWaitFor(async () => {
      vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);

      expect(
        await pollbookContext1.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: true,
          pollbooks: [],
        },
      });
      expect(
        await pollbookContext2.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: false,
          pollbooks: [],
        },
      });
    });
    const { port: port2 } =
      pollbookContext2.peerServer.address() as AddressInfo;

    vi.spyOn(AvahiService, 'discoverHttpServices').mockResolvedValue([
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
    vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);

    await extendedWaitFor(async () => {
      expect(
        await pollbookContext1.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: true,
          pollbooks: [
            expect.objectContaining({
              status: PollbookConnectionStatus.WrongElection,
            }),
          ],
        },
      });
    });
    expect(
      await pollbookContext2.localApiClient.getDeviceStatuses()
    ).toMatchObject({
      network: {
        isOnline: true,
        // On the first iteration of the polling interval pollbook-1 will be missed to connect to until
        // pollbook2 is online
        pollbooks: [],
      },
    });

    vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);

    await extendedWaitFor(async () => {
      expect(
        await pollbookContext2.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: true,
          pollbooks: [
            expect.objectContaining({
              status: PollbookConnectionStatus.WrongElection,
            }),
          ],
        },
      });
    });
    // Before connecting the pollbooks should not have queried one another for events
    expect(
      pollbookContext1.peerWorkspace.store.getNewEvents
    ).not.toHaveBeenCalled();
    expect(
      pollbookContext2.peerWorkspace.store.getNewEvents
    ).not.toHaveBeenCalled();

    // Set the pollbooks for the same election
    pollbookContext1.workspace.store.setElectionAndVoters(
      electionFamousNames2021Fixtures.readElectionDefinition(),
      'fake-package-hash',
      testStreets,
      testVoters
    );
    pollbookContext2.workspace.store.setElectionAndVoters(
      electionFamousNames2021Fixtures.readElectionDefinition(),
      'fake-package-hash',
      testStreets,
      testVoters
    );

    await extendedWaitFor(async () => {
      vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
      expect(
        await pollbookContext1.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: true,
          pollbooks: [
            expect.objectContaining({
              status: PollbookConnectionStatus.Connected,
            }),
          ],
        },
      });
      expect(
        await pollbookContext2.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: true,
          pollbooks: [
            expect.objectContaining({
              status: PollbookConnectionStatus.Connected,
            }),
          ],
        },
      });
    });

    // Now that the pollbooks are connected they should be querying for each others events
    expect(
      pollbookContext1.peerWorkspace.store.getNewEvents
    ).toHaveBeenCalled();
    expect(
      pollbookContext2.peerWorkspace.store.getNewEvents
    ).toHaveBeenCalled();

    // Unconfigure one machine and they should update to wrong election.
    pollbookContext1.mockUsbDrive.usbDrive.eject.expectCallWith().resolves();
    await pollbookContext1.localApiClient.unconfigure();
    await extendedWaitFor(async () => {
      vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
      expect(
        await pollbookContext1.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: true,
          pollbooks: [
            expect.objectContaining({
              status: PollbookConnectionStatus.WrongElection,
            }),
          ],
        },
      });
      expect(
        await pollbookContext2.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: true,
          pollbooks: [
            expect.objectContaining({
              status: PollbookConnectionStatus.WrongElection,
            }),
          ],
        },
      });
    });
    // Remove one app from avahi and see it go to shutdown.
    vi.spyOn(AvahiService, 'discoverHttpServices').mockResolvedValue([
      {
        name: 'Pollbook-test-0',
        host: 'local',
        resolvedIp: 'localhost',
        port: port1.toString(),
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
              status: PollbookConnectionStatus.ShutDown,
            }),
          ],
        },
      });
      expect(
        await pollbookContext2.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: false,
          pollbooks: [
            expect.objectContaining({
              status: PollbookConnectionStatus.LostConnection,
            }),
          ],
        },
      });
    });

    // Bring both machines back
    vi.spyOn(AvahiService, 'discoverHttpServices').mockResolvedValue([
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

    vi.spyOn(
      pollbookContext1.peerWorkspace.store,
      'getNewEvents'
    ).mockResolvedValue({
      events: [],
      hasMore: false,
    });
    vi.spyOn(
      pollbookContext2.peerWorkspace.store,
      'getNewEvents'
    ).mockResolvedValue({
      events: [],
      hasMore: false,
    });
    vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
    await extendedWaitFor(async () => {
      vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
      expect(
        await pollbookContext1.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: true,
          pollbooks: [
            expect.objectContaining({
              status: PollbookConnectionStatus.WrongElection,
            }),
          ],
        },
      });
      expect(
        await pollbookContext2.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: true,
          pollbooks: [
            expect.objectContaining({
              status: PollbookConnectionStatus.WrongElection,
            }),
          ],
        },
      });
    });
  });
});

test('connection status is managed properly with many pollbooks', async () => {
  await withManyApps(5, async (pollbookContexts) => {
    const testVoters = parseVotersFromCsvString(
      electionFamousNames2021Fixtures.pollbookVoters.asText()
    );
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
    const ports = [];
    for (const context of pollbookContexts) {
      context.mockUsbDrive.insertUsbDrive({});
      expect(await context.localApiClient.getDeviceStatuses()).toMatchObject({
        network: {
          isOnline: false,
          pollbooks: [],
        },
      });
      const { port } = context.peerServer.address() as AddressInfo;
      ports.push(port);

      vi.spyOn(context.peerWorkspace.store, 'getNewEvents').mockResolvedValue({
        events: [],
        hasMore: false,
      });
    }
    // Mock hasOnlineInterface to always return true
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);

    vi.spyOn(AvahiService, 'discoverHttpServices').mockResolvedValue(
      ports.map((port, i) => ({
        name: `Pollbook-test-${i}`,
        host: 'local',
        resolvedIp: 'localhost',
        port: port.toString(),
      }))
    );

    await extendedWaitFor(async () => {
      vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
      for (const context of pollbookContexts) {
        expect(await context.localApiClient.getDeviceStatuses()).toMatchObject({
          network: {
            isOnline: true,
            pollbooks: [
              expect.objectContaining({
                status: PollbookConnectionStatus.WrongElection,
              }),
              expect.objectContaining({
                status: PollbookConnectionStatus.WrongElection,
              }),
              expect.objectContaining({
                status: PollbookConnectionStatus.WrongElection,
              }),
              expect.objectContaining({
                status: PollbookConnectionStatus.WrongElection,
              }),
            ],
          },
        });
      }
    });

    for (const context of pollbookContexts) {
      expect(context.peerWorkspace.store.getNewEvents).not.toHaveBeenCalled();
    }
    // Set all the pollbooks to the same election package and pollbook package
    for (const context of pollbookContexts) {
      context.workspace.store.setElectionAndVoters(
        electionDefinition,
        'fake-package-hash',
        testStreets,
        testVoters
      );
    }

    vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
    await extendedWaitFor(async () => {
      vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
      for (const context of pollbookContexts) {
        expect(await context.localApiClient.getDeviceStatuses()).toMatchObject({
          network: {
            isOnline: true,
            pollbooks: [
              expect.objectContaining({
                status: PollbookConnectionStatus.Connected,
              }),
              expect.objectContaining({
                status: PollbookConnectionStatus.Connected,
              }),
              expect.objectContaining({
                status: PollbookConnectionStatus.Connected,
              }),
              expect.objectContaining({
                status: PollbookConnectionStatus.Connected,
              }),
            ],
          },
        });
      }
    });

    // Now that the pollbooks are connected they should be querying for each others events
    await extendedWaitFor(() => {
      vi.advanceTimersByTime(EVENT_POLLING_INTERVAL);
      for (const context of pollbookContexts) {
        expect(context.peerWorkspace.store.getNewEvents).toHaveBeenCalled();
      }
    });

    // If the pollbook package hash is different they will not connect
    let i = 0;
    for (const context of pollbookContexts) {
      context.workspace.store.deleteElectionAndVoters();
      context.workspace.store.setElectionAndVoters(
        electionDefinition,
        `fake-package-hash-${i}`,
        testStreets,
        testVoters
      );
      i += 1;
    }
    vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
    await extendedWaitFor(async () => {
      vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
      for (const context of pollbookContexts) {
        expect(await context.localApiClient.getDeviceStatuses()).toMatchObject({
          network: {
            isOnline: true,
            pollbooks: [
              expect.objectContaining({
                status: PollbookConnectionStatus.WrongElection,
              }),
              expect.objectContaining({
                status: PollbookConnectionStatus.WrongElection,
              }),
              expect.objectContaining({
                status: PollbookConnectionStatus.WrongElection,
              }),
              expect.objectContaining({
                status: PollbookConnectionStatus.WrongElection,
              }),
            ],
          },
        });
      }
    });
  });
});

// TODO #6544 Fix Flakes and re-enable tests
test('one pollbook can be configured from another pollbook', async () => {
  await withManyApps(2, async ([pollbookContext1, pollbookContext2]) => {
    // Configure the first pollbook
    const testVoters = parseVotersFromCsvString(
      electionFamousNames2021Fixtures.pollbookVoters.asText()
    );
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    pollbookContext1.workspace.store.setElectionAndVoters(
      electionDefinition,
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

    // Set both pollbooks so they are online and can see one another.
    const { port: port1 } =
      pollbookContext1.peerServer.address() as AddressInfo;
    const { port: port2 } =
      pollbookContext2.peerServer.address() as AddressInfo;

    pollbookContext1.mockUsbDrive.removeUsbDrive();
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    vi.spyOn(AvahiService, 'discoverHttpServices').mockResolvedValue([
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
              status: PollbookConnectionStatus.WrongElection,
            }),
          ],
        },
      });
    });
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
      electionFamousNames2021Fixtures.electionJson.asBuffer(),
      electionFamousNames2021Fixtures.pollbookVoters.asText(),
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );

    writeFileSync(zipPath, new Uint8Array(validZip));
    expect(
      await pollbookContext2.peerApiClient.configureFromPeerMachine({
        machineId: pollbookContext1.workspace.store.getMachineId(),
      })
    ).toEqual(ok());
    expect(
      await pollbookContext2.peerApiClient.getMachineInformation()
    ).toMatchObject({
      electionBallotHash: electionDefinition.ballotHash,
      electionId: electionDefinition.election.id,
      electionTitle: electionDefinition.election.title,
      pollbookPackageHash: sha256(new Uint8Array(validZip)),
      machineId: 'test-1',
    });

    expect(
      await pollbookContext2.peerApiClient.configureFromPeerMachine({
        machineId: pollbookContext1.workspace.store.getMachineId(),
      })
    ).toEqual(err('already-configured'));
  });
});

// TODO #6544 Fix Flakes and re-enable tests
test('one pollbook can be configured from another pollbook automatically as an election mangaer', async () => {
  await withManyApps(
    3,
    async ([pollbookContext1, pollbookContext2, pollbookContext3]) => {
      // Configure the first pollbook
      const testVoters = parseVotersFromCsvString(
        electionFamousNames2021Fixtures.pollbookVoters.asText()
      );
      const testStreets = parseValidStreetsFromCsvString(
        electionFamousNames2021Fixtures.pollbookStreetNames.asText()
      );
      pollbookContext1.workspace.store.setElectionAndVoters(
        electionDefinition,
        'fake-package-hash',
        testStreets,
        testVoters
      );
      pollbookContext3.workspace.store.setElectionAndVoters(
        electionDefinition,
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
        electionDefinition.election
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

      // Set both pollbooks so they are online and can see one another.
      const { port: port1 } =
        pollbookContext1.peerServer.address() as AddressInfo;
      const { port: port2 } =
        pollbookContext2.peerServer.address() as AddressInfo;
      const { port: port3 } =
        pollbookContext3.peerServer.address() as AddressInfo;

      pollbookContext2.mockUsbDrive.removeUsbDrive();
      vi.mocked(hasOnlineInterface).mockResolvedValue(true);
      vi.spyOn(AvahiService, 'discoverHttpServices').mockResolvedValue([
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
                status: PollbookConnectionStatus.WrongElection,
              }),
            ],
          },
        });
      });

      // use the wrong election manager card
      mockElectionManagerAuth(
        pollbookContext2.auth,
        electionGeneralFixtures.readElection()
      );
      await extendedWaitFor(async () => {
        vitest.advanceTimersByTime(100);
        expect(
          (await pollbookContext2.localApiClient.getElection()).err()
        ).toEqual('not-found-configuration-matching-election-card');
      });
      mockLoggedOut(pollbookContext2.auth);
      vitest.advanceTimersByTime(100);

      // have two other machines on the network with different pollbook package hashes
      vi.spyOn(AvahiService, 'discoverHttpServices').mockResolvedValue([
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
        {
          name: 'Pollbook-test-2',
          host: 'local',
          resolvedIp: 'localhost',
          port: port3.toString(),
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
                status: PollbookConnectionStatus.WrongElection,
              }),
              expect.objectContaining({
                status: PollbookConnectionStatus.WrongElection,
              }),
            ],
          },
        });
      });
      mockElectionManagerAuth(
        pollbookContext2.auth,
        electionDefinition.election
      );
      await extendedWaitFor(async () => {
        vitest.advanceTimersByTime(100);
        expect(
          (await pollbookContext2.localApiClient.getElection()).err()
        ).toEqual('network-conflicting-pollbook-packages-match-card');
      });
      mockLoggedOut(pollbookContext2.auth);

      // Remove the third pollbook to test the happy path
      vi.spyOn(AvahiService, 'discoverHttpServices').mockResolvedValue([
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
                status: PollbookConnectionStatus.WrongElection,
              }),
              expect.objectContaining({
                status: PollbookConnectionStatus.ShutDown,
              }),
            ],
          },
        });
      });

      // Write an invalid zip file to test the error condition
      writeFileSync(zipPath, 'fakecontent');
      mockElectionManagerAuth(
        pollbookContext2.auth,
        electionDefinition.election
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
        electionFamousNames2021Fixtures.electionJson.asBuffer(),
        electionFamousNames2021Fixtures.pollbookVoters.asText(),
        electionFamousNames2021Fixtures.pollbookStreetNames.asText()
      );
      writeFileSync(zipPath, new Uint8Array(validZip));
      mockElectionManagerAuth(
        pollbookContext2.auth,
        electionDefinition.election
      );
      await extendedWaitFor(async () => {
        vitest.advanceTimersByTime(100);
        expect(
          await pollbookContext2.peerApiClient.getMachineInformation()
        ).toMatchObject({
          electionBallotHash: electionDefinition.ballotHash,
          electionId: electionDefinition.election.id,
          electionTitle: electionDefinition.election.title,
          pollbookPackageHash: sha256(new Uint8Array(validZip)),
          machineId: 'test-1',
        });
        const election = await pollbookContext2.localApiClient.getElection();
        expect(election.ok()).toEqual(electionDefinition.election);
      });

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
