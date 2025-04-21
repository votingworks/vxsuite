import { beforeEach, expect, test, vi, vitest } from 'vitest';

import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { AddressInfo } from 'node:net';
import { withManyApps } from '../test/app';
import {
  parseValidStreetsFromCsvString,
  parseVotersFromCsvString,
} from './pollbook_package.js';
import { PollbookConnectionStatus } from './types.js';
import { NETWORK_POLLING_INTERVAL } from './globals.js';
import { AvahiService, hasOnlineInterface } from './avahi';

let mockNodeEnv: 'production' | 'test' = 'test';

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
    advertiseHttpService: vi.fn().mockResolvedValue(undefined),
    stopAdvertisedService: vi.fn(),
    discoverHttpServices: vi.fn().mockResolvedValue([]),
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  mockNodeEnv = 'test';
  vi.clearAllMocks();
});

vi.setConfig({
  testTimeout: 20_000,
});

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

    await vi.waitFor(async () => {
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

    await vi.waitFor(async () => {
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

    await vi.waitFor(async () => {
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
      electionFamousNames2021Fixtures.electionJson.readElection(),
      testStreets,
      testVoters
    );
    pollbookContext2.workspace.store.setElectionAndVoters(
      electionFamousNames2021Fixtures.electionJson.readElection(),
      testStreets,
      testVoters
    );

    await vi.waitFor(async () => {
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
    await vi.waitFor(async () => {
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
    await vi.waitFor(async () => {
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
    await vi.waitFor(async () => {
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
