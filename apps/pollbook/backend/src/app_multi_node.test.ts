import { beforeEach, expect, test, vi, vitest } from 'vitest';

import {
  electionSimpleSinglePrecinctFixtures,
  electionMultiPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { AddressInfo } from 'node:net';
import { assertDefined, ok } from '@votingworks/basics';
import { CITIZEN_THERMAL_PRINTER_CONFIG } from '@votingworks/printing';
import {
  extendedWaitFor,
  setupUnconfiguredPollbooksOnNetwork,
  withManyApps,
} from '../test/app';
import {
  parseValidStreetsFromCsvString,
  parseVotersFromCsvString,
} from './pollbook_package';
import { PollbookConnectionStatus } from './types';
import {
  EVENT_POLLING_INTERVAL,
  MACHINE_DISCONNECTED_TIMEOUT,
  NETWORK_POLLING_INTERVAL,
} from './globals';
import { AvahiService, hasOnlineInterface } from './avahi';

let mockNodeEnv: 'production' | 'test' = 'test';
const singlePrecinctElectionDefinition =
  electionSimpleSinglePrecinctFixtures.readElectionDefinition();
const multiPrecinctElectionDefinition =
  electionMultiPartyPrimaryFixtures.readElectionDefinition();

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

vi.mock(import('@votingworks/printing'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    renderToPdf: vi.fn().mockResolvedValue(ok([])),
  } as unknown as typeof import('@votingworks/printing');
});

let currentTime = new Date('2021-01-01T00:00:00.000');
vi.mock(import('./get_current_time.js'), async (importActual) => ({
  ...(await importActual()),
  getCurrentTime: () => currentTime.getTime(),
}));

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

test('online / offline connection status is managed properly', async () => {
  await withManyApps(1, async ([pollbookContext]) => {
    vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
    await setupUnconfiguredPollbooksOnNetwork(
      [pollbookContext],
      vitest,
      mockHasOnlineInterface,
      mockDiscoverHttpServices
    );

    // Start with the pollbook online
    await extendedWaitFor(async () => {
      vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
      expect(
        await pollbookContext.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: true,
          pollbooks: [],
        },
      });
    });

    // If we do not see an online network, we become offline on the next polling interval.
    mockHasOnlineInterface.mockResolvedValue(false);
    await extendedWaitFor(async () => {
      vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
      expect(
        await pollbookContext.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: false,
          pollbooks: [],
        },
      });
    });

    // Bring back online
    mockHasOnlineInterface.mockResolvedValue(true);
    await extendedWaitFor(async () => {
      vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
      expect(
        await pollbookContext.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: true,
          pollbooks: [],
        },
      });
    });

    // If we don't see ourselves published on avahi we should go offline,
    mockDiscoverHttpServices.mockResolvedValue([]);
    await extendedWaitFor(async () => {
      vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
      expect(
        await pollbookContext.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: false,
          pollbooks: [],
        },
      });
    });

    const { port } = pollbookContext.peerServer.address() as AddressInfo;

    // Bring back online
    mockDiscoverHttpServices.mockResolvedValue([
      {
        name: 'Pollbook-test-0',
        host: 'local',
        resolvedIp: 'localhost',
        port: port.toString(),
      },
    ]);
    await extendedWaitFor(async () => {
      vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
      expect(
        await pollbookContext.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: true,
          pollbooks: [],
        },
      });
    });

    // Returning an ipv6 address from avahi will be ignored and the prior ip4 address will continue to be successfully pinged and stay online
    mockDiscoverHttpServices.mockResolvedValue([
      {
        name: 'Pollbook-test-0',
        host: 'local',
        resolvedIp: '2001:0db8:85a3:0000:0000:8a2e:0370:7334', // fake IPv6 address
        port: port.toString(),
      },
    ]);
    await extendedWaitFor(async () => {
      vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
      expect(
        await pollbookContext.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: true,
          pollbooks: [],
        },
      });
    });

    await extendedWaitFor(async () => {
      vitest.advanceTimersByTime(MACHINE_DISCONNECTED_TIMEOUT);
      // the vitest mock timers will not impact the times we set as last seen for the pollbooks without an additional mock
      currentTime = assertDefined(vitest.getMockedSystemTime());
      expect(
        await pollbookContext.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: true,
          pollbooks: [],
        },
      });
    });

    // Sending a new ip4 address to avahi will cause us to change what address we are pinging. If it is invalid we
    // will not transition to offline immediately but will after the machine disconnected timeout.
    mockDiscoverHttpServices.mockResolvedValue([
      {
        name: 'Pollbook-test-0',
        host: 'local',
        resolvedIp: '192.1.2.123', // fake IPv4 address
        port: port.toString(),
      },
    ]);
    await extendedWaitFor(async () => {
      vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
      expect(
        await pollbookContext.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: true,
          pollbooks: [],
        },
      });
    });
    await extendedWaitFor(async () => {
      vitest.advanceTimersByTime(MACHINE_DISCONNECTED_TIMEOUT);
      // the vitest mock timers will not impact the times we set as last seen for the pollbooks without an additional mock
      currentTime = assertDefined(vitest.getMockedSystemTime());
      expect(
        await pollbookContext.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: false,
          pollbooks: [],
        },
      });
    });
  });
});

test('connection status between two pollbooks is managed properly', async () => {
  await withManyApps(2, async ([pollbookContext1, pollbookContext2]) => {
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
    mockHasOnlineInterface.mockResolvedValue(true);
    const { port: port1 } =
      pollbookContext1.peerServer.address() as AddressInfo;
    const { port: port2 } =
      pollbookContext2.peerServer.address() as AddressInfo;

    mockDiscoverHttpServices.mockResolvedValue([
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
    await setupUnconfiguredPollbooksOnNetwork(
      [pollbookContext1, pollbookContext2],
      vitest,
      mockHasOnlineInterface,
      mockDiscoverHttpServices
    );

    // Set the pollbooks for the same election and precinct
    pollbookContext1.workspace.store.setElectionAndVoters(
      singlePrecinctElectionDefinition,
      'mock-package-hash',
      testStreets,
      testVoters
    );
    pollbookContext1.workspace.store.setConfiguredPrecinct(
      singlePrecinctElectionDefinition.election.precincts[0].id
    );
    pollbookContext1.mockPrinterHandler.connectPrinter(
      CITIZEN_THERMAL_PRINTER_CONFIG
    );
    // Check in a voter on pollbook 1
    const checkIn = await pollbookContext1.localApiClient.checkInVoter({
      voterId: testVoters[0].voterId,
      identificationMethod: { type: 'default' },
      ballotParty: 'NOT_APPLICABLE',
    });
    expect(checkIn.ok()).toEqual(undefined);

    pollbookContext2.workspace.store.setElectionAndVoters(
      singlePrecinctElectionDefinition,
      'mock-package-hash',
      testStreets,
      testVoters
    );
    pollbookContext2.workspace.store.setConfiguredPrecinct(
      singlePrecinctElectionDefinition.election.precincts[0].id
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

    await extendedWaitFor(async () => {
      vi.advanceTimersByTime(EVENT_POLLING_INTERVAL);
      // Now that the pollbooks are connected they should be querying for each others events
      expect(
        pollbookContext1.peerWorkspace.store.getNewEvents
      ).toHaveBeenCalled();
      expect(
        pollbookContext2.peerWorkspace.store.getNewEvents
      ).toHaveBeenCalled();

      // Pollbook 2 should now have the check in event for the test voter
      expect(
        await pollbookContext2.localApiClient.getVoter({
          voterId: testVoters[0].voterId,
        })
      ).toEqual(
        expect.objectContaining({
          checkIn: expect.objectContaining({
            identificationMethod: { type: 'default' },
          }),
        })
      );
    });

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
              status: PollbookConnectionStatus.MismatchedConfiguration,
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
              status: PollbookConnectionStatus.MismatchedConfiguration,
            }),
          ],
        },
      });
    });
    // Remove one app from avahi and see it go to shutdown.
    mockDiscoverHttpServices.mockResolvedValue([
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
    // Allow pollbook 2 to see itself to come back online and simulate a shutdown of pollbook 1, pollbook 2 should NOT transition pollbook 1 to shut down because it is in lost connection
    mockDiscoverHttpServices.mockResolvedValue([
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
          isOnline: false,
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
          isOnline: true,
          pollbooks: [
            expect.objectContaining({
              status: PollbookConnectionStatus.LostConnection,
            }),
          ],
        },
      });
    });

    // Bring both machines back
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
              status: PollbookConnectionStatus.MismatchedConfiguration,
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
              status: PollbookConnectionStatus.MismatchedConfiguration,
            }),
          ],
        },
      });
    });

    // Set a bad port value for Pollbook1. It should go offline after the diconnection timeout and mark all of its connections (Pollbook2) as LostConnection
    // Pollbook2 will fail to ping Pollbook1 after the disconnection timeout and mark it as LostConnection.
    mockDiscoverHttpServices.mockResolvedValue([
      {
        name: 'Pollbook-test-0',
        host: 'local',
        resolvedIp: 'localhost',
        port: '0000', // wrong port
      },
      {
        name: 'Pollbook-test-1',
        host: 'local',
        resolvedIp: 'localhost',
        port: port2.toString(),
      },
    ]);
    await extendedWaitFor(async () => {
      // Check before we hid MACHINE_DISCONNECTION_TIMEOUT
      vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
      expect(
        await pollbookContext1.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: true,
          pollbooks: [
            expect.objectContaining({
              status: PollbookConnectionStatus.MismatchedConfiguration,
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
              status: PollbookConnectionStatus.MismatchedConfiguration,
            }),
          ],
        },
      });
    });
    await extendedWaitFor(async () => {
      vitest.advanceTimersByTime(MACHINE_DISCONNECTED_TIMEOUT);
      // the vitest mock timers will not impact the times we set as last seen for the pollbooks without an additional mock
      currentTime = assertDefined(vitest.getMockedSystemTime());
      expect(
        await pollbookContext1.localApiClient.getDeviceStatuses()
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
      expect(
        await pollbookContext2.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: true,
          pollbooks: [
            expect.objectContaining({
              status: PollbookConnectionStatus.LostConnection,
            }),
          ],
        },
      });
    });
  });
});

test('connection status is managed properly with many pollbooks', async () => {
  await withManyApps(5, async (pollbookContexts) => {
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
    await setupUnconfiguredPollbooksOnNetwork(
      pollbookContexts,
      vitest,
      mockHasOnlineInterface,
      mockDiscoverHttpServices
    );
    // Set all the pollbooks to the same election package and pollbook package
    for (const context of pollbookContexts) {
      context.workspace.store.setElectionAndVoters(
        singlePrecinctElectionDefinition,
        'mock-package-hash',
        testStreets,
        testVoters
      );
      context.workspace.store.setConfiguredPrecinct(
        singlePrecinctElectionDefinition.election.precincts[0].id
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
        singlePrecinctElectionDefinition,
        `mock-package-hash-${i}`,
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
                status: PollbookConnectionStatus.MismatchedConfiguration,
              }),
              expect.objectContaining({
                status: PollbookConnectionStatus.MismatchedConfiguration,
              }),
              expect.objectContaining({
                status: PollbookConnectionStatus.MismatchedConfiguration,
              }),
              expect.objectContaining({
                status: PollbookConnectionStatus.MismatchedConfiguration,
              }),
            ],
          },
        });
      }
    });
  });
});

test('pollbooks with different code versions cannot connect', async () => {
  await withManyApps(
    2,
    async ([pollbookContext1, pollbookContext2]) => {
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
      await extendedWaitFor(async () => {
        expect(
          await pollbookContext2.localApiClient.getDeviceStatuses()
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
      // Set the pollbooks for the same election and precinct
      pollbookContext1.workspace.store.setElectionAndVoters(
        singlePrecinctElectionDefinition,
        'mock-package-hash',
        testStreets,
        testVoters
      );
      pollbookContext1.workspace.store.setConfiguredPrecinct(
        singlePrecinctElectionDefinition.election.precincts[0].id
      );
      pollbookContext2.workspace.store.setElectionAndVoters(
        singlePrecinctElectionDefinition,
        'mock-package-hash',
        testStreets,
        testVoters
      );
      pollbookContext2.workspace.store.setConfiguredPrecinct(
        singlePrecinctElectionDefinition.election.precincts[0].id
      );

      // The pollbooks should be listing each other as mismatching configuration.
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
        expect(
          await pollbookContext2.localApiClient.getDeviceStatuses()
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
    },
    true
  );
});

test('pollbooks with different pollbook package hash values cannot connect', async () => {
  await withManyApps(2, async ([pollbookContext1, pollbookContext2]) => {
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
    await setupUnconfiguredPollbooksOnNetwork(
      [pollbookContext1, pollbookContext2],
      vitest,
      mockHasOnlineInterface,
      mockDiscoverHttpServices
    );

    // Set the election with different pollbook package hash values
    pollbookContext1.workspace.store.setElectionAndVoters(
      singlePrecinctElectionDefinition,
      'mock-package-hash-1',
      testStreets,
      testVoters
    );
    pollbookContext1.workspace.store.setConfiguredPrecinct(
      singlePrecinctElectionDefinition.election.precincts[0].id
    );
    pollbookContext2.workspace.store.setElectionAndVoters(
      singlePrecinctElectionDefinition,
      'mock-package-hash-2',
      testStreets,
      testVoters
    );
    pollbookContext2.workspace.store.setConfiguredPrecinct(
      singlePrecinctElectionDefinition.election.precincts[0].id
    );

    // The pollbooks should be listing each other as mismatching configuration.
    await extendedWaitFor(async () => {
      vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
      expect(
        await pollbookContext1.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: true,
          pollbooks: [
            expect.objectContaining({
              status: PollbookConnectionStatus.MismatchedConfiguration,
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
              status: PollbookConnectionStatus.MismatchedConfiguration,
            }),
          ],
        },
      });
    });
  });
});

test('pollbooks with different configured precinct values cannot connect', async () => {
  await withManyApps(2, async ([pollbookContext1, pollbookContext2]) => {
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
    await setupUnconfiguredPollbooksOnNetwork(
      [pollbookContext1, pollbookContext2],
      vitest,
      mockHasOnlineInterface,
      mockDiscoverHttpServices
    );

    // Setting to multi-precinct election without setting configured precinct should not connect
    pollbookContext1.workspace.store.setElectionAndVoters(
      multiPrecinctElectionDefinition,
      'mock-package-hash',
      parseValidStreetsFromCsvString(
        electionMultiPartyPrimaryFixtures.pollbookCityStreetNames.asText(),
        multiPrecinctElectionDefinition.election
      ),
      parseVotersFromCsvString(
        electionMultiPartyPrimaryFixtures.pollbookCityVoters.asText(),
        multiPrecinctElectionDefinition.election
      )
    );
    pollbookContext2.workspace.store.setElectionAndVoters(
      multiPrecinctElectionDefinition,
      'mock-package-hash',
      testStreets,
      testVoters
    );

    // The pollbooks should be listing each other as mismatching configuration.
    await extendedWaitFor(async () => {
      vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
      expect(
        await pollbookContext1.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: true,
          pollbooks: [
            expect.objectContaining({
              status: PollbookConnectionStatus.MismatchedConfiguration,
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
              status: PollbookConnectionStatus.MismatchedConfiguration,
            }),
          ],
        },
      });
    });

    // Configure for different precincts
    pollbookContext1.workspace.store.setConfiguredPrecinct(
      multiPrecinctElectionDefinition.election.precincts[0].id
    );
    pollbookContext2.workspace.store.setConfiguredPrecinct(
      multiPrecinctElectionDefinition.election.precincts[1].id
    );

    // Status should still be mismatched configuration
    await extendedWaitFor(async () => {
      vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);
      expect(
        await pollbookContext1.localApiClient.getDeviceStatuses()
      ).toMatchObject({
        network: {
          isOnline: true,
          pollbooks: [
            expect.objectContaining({
              status: PollbookConnectionStatus.MismatchedConfiguration,
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
              status: PollbookConnectionStatus.MismatchedConfiguration,
            }),
          ],
        },
      });
    });

    // Configure for the same precinct and it should connect
    pollbookContext1.workspace.store.setConfiguredPrecinct(
      multiPrecinctElectionDefinition.election.precincts[1].id
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
  });
});
