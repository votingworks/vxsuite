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
import { CITIZEN_THERMAL_PRINTER_CONFIG } from '@votingworks/printing';
import {
  mockElectionManagerAuth,
  mockLoggedOut,
  TestContext,
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

function extendedWaitFor(
  fn: () => void | Promise<void>,
  timeout: number = 3000
) {
  return vi.waitFor(fn, { timeout });
}

vitest.setConfig({
  testTimeout: 10_000,
});

async function setupUnconfiguredPollbooksOnNetwork(
  pollbookContexts: TestContext[],
  callerId?: string
): Promise<void> {
  for (const context of pollbookContexts) {
    context.mockUsbDrive.insertUsbDrive({});
  }
  // Mock hasOnlineInterface to always return true
  vi.mocked(hasOnlineInterface).mockResolvedValue(true);

  // Set up spies for all pollbook contexts
  // for (const context of pollbookContexts) {
  //   vi.spyOn(context.peerWorkspace.store, 'getNewEvents');
  // }
  const spies = pollbookContexts.map((context) =>
    vi.spyOn(context.peerWorkspace.store, 'getNewEvents')
  );

  // Get ports for all pollbook contexts
  const ports = pollbookContexts.map((context) => {
    const { port } = context.peerServer.address() as AddressInfo;
    return port;
  });

  // Mock discovered services for all pollbooks
  vi.spyOn(AvahiService, 'discoverHttpServices').mockResolvedValue(
    pollbookContexts.map((_, index) => ({
      name: `Pollbook-test-${index}`,
      host: 'local',
      resolvedIp: 'localhost',
      port: ports[index].toString(),
    }))
  );
  vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);

  await extendedWaitFor(async () => {
    const deviceStatuses =
      await pollbookContexts[0].localApiClient.getDeviceStatuses();
    expect(deviceStatuses.network.isOnline).toEqual(true);
    expect(deviceStatuses.network.pollbooks).toHaveLength(
      pollbookContexts.length - 1
    );
    for (const pollbook of deviceStatuses.network.pollbooks) {
      expect(pollbook).toEqual(
        expect.objectContaining({
          status: PollbookConnectionStatus.MismatchedConfiguration,
        })
      );
    }
  });

  vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);

  await extendedWaitFor(async () => {
    // All pollbooks should now see each other with mismatched configuration
    for (const context of pollbookContexts) {
      const deviceStatuses = await context.localApiClient.getDeviceStatuses();
      expect(deviceStatuses.network.isOnline).toEqual(true);
      expect(deviceStatuses.network.pollbooks).toHaveLength(
        pollbookContexts.length - 1
      );
      for (const pollbook of deviceStatuses.network.pollbooks) {
        expect(pollbook).toEqual(
          expect.objectContaining({
            status: PollbookConnectionStatus.MismatchedConfiguration,
          })
        );
      }
    }
  });

  await extendedWaitFor(() => {
    vi.advanceTimersByTime(EVENT_POLLING_INTERVAL);
    for (const [i, spy] of spies.entries()) {
      // Before connecting the pollbooks should not have queried one another for events
      const calls = spy.mock.calls.length;
      if (calls > 0) {
        throw new Error(
          `getNewEvents was called ${calls} times in context ${i}. Callsite: ${callerId}`
        );
      }
    }
    // Before connecting the pollbooks should not have queried one another for events
    // for (const context of pollbookContexts) {
    //   expect(context.peerWorkspace.store.getNewEvents).not.toHaveBeenCalled();
    // }
  });
}

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
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    const { port: port1 } =
      pollbookContext1.peerServer.address() as AddressInfo;
    const { port: port2 } =
      pollbookContext2.peerServer.address() as AddressInfo;

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
    await setupUnconfiguredPollbooksOnNetwork([
      pollbookContext1,
      pollbookContext2,
    ]);

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
    await setupUnconfiguredPollbooksOnNetwork(pollbookContexts);
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
    await setupUnconfiguredPollbooksOnNetwork([
      pollbookContext1,
      pollbookContext2,
    ]);

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
    await setupUnconfiguredPollbooksOnNetwork([
      pollbookContext1,
      pollbookContext2,
    ]);

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

test('one pollbook can be configured from another pollbook', async () => {
  await withManyApps(2, async ([pollbookContext1, pollbookContext2]) => {
    await setupUnconfiguredPollbooksOnNetwork([
      pollbookContext1,
      pollbookContext2,
    ]);
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
        'set-up-contexts-1-2'
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
