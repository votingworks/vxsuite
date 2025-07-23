import { BaseLogger, LogEventId, LogSource } from '@votingworks/logging';
import { Client as DbClient } from '@votingworks/db';
import { Result, err, ok } from '@votingworks/basics';
import fetch from 'node-fetch';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { createWriteStream, createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  NETWORK_EVENT_LIMIT,
  MACHINE_DISCONNECTED_TIMEOUT,
  POLLBOOK_PACKAGE_ASSET_FILE_NAME,
} from './globals';
import { getCurrentTime } from './get_current_time';
import { convertDbRowsToPollbookEvents } from './event_helpers';
import {
  ConfigurationError,
  EventDbRow,
  PollbookConfigurationInformation,
  PollbookConnectionStatus,
  PollbookEvent,
  PollbookService,
} from './types';
import { rootDebug } from './debug';
import { SchemaPath, Store } from './store';
import { readPollbookPackage } from './pollbook_package';
import { shouldPollbooksShareEvents } from './networking';

const debug = rootDebug.extend('store:peer');

export class PeerStore extends Store {
  private readonly connectedPollbooks: Record<string, PollbookService> = {};

  constructor(
    client: DbClient,
    machineId: string,
    codeVersion: string,
    logger: BaseLogger
  ) {
    super(client, machineId, codeVersion, logger);

    // Reset knowledge of connected pollbook
    this.client.run(`DELETE FROM machines`);
  }

  /**
   * Builds and returns a new store at `dbPath`.
   */
  static fileStore(
    dbPath: string,
    logger: BaseLogger,
    machineId: string,
    codeVersion: string
  ): PeerStore {
    return new PeerStore(
      DbClient.fileClient(dbPath, logger, SchemaPath),
      machineId,
      codeVersion,
      logger
    );
  }

  /**
   * Builds and returns a new store whose data is kept in memory.
   */
  static memoryStore(
    machineId: string = 'test-machine',
    codeVersion: string = 'test-v1',
    logger: BaseLogger = new BaseLogger(LogSource.VxPollBookBackend)
  ): PeerStore {
    return new PeerStore(
      DbClient.memoryClient(SchemaPath),
      machineId,
      codeVersion,
      logger
    );
  }

  setOnlineStatus(isOnline: boolean): void {
    const currentOnline = this.getIsOnline();
    if (currentOnline !== isOnline) {
      this.logger.log(LogEventId.PollbookNetworkStatus, 'system', {
        message: `Pollbook status changed to ${
          isOnline ? 'online' : 'offline'
        }`,
      });
    }
    this.client.transaction(() => {
      if (!isOnline) {
        // If we go offline, we should clear the list of connected pollbooks.
        debug('Clearing connected pollbooks due to offline status');
        for (const [avahiServiceName, pollbookService] of Object.entries(
          this.connectedPollbooks
        )) {
          this.setPollbookServiceForName(avahiServiceName, {
            ...pollbookService,
            status: PollbookConnectionStatus.LostConnection,
            apiClient: undefined,
          });
        }
      }
      this.client.run(
        `
      INSERT INTO machines (machine_id, status, last_seen, pollbook_information)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(machine_id) DO UPDATE SET
        status = excluded.status
        ${isOnline ? ', last_seen = excluded.last_seen' : ''}
      `,
        this.machineId,
        isOnline
          ? PollbookConnectionStatus.Connected
          : PollbookConnectionStatus.LostConnection,
        isOnline ? getCurrentTime() : 0,
        '{}'
      );
    });
  }

  // Saves all events received from a remote machine. Returning the last event's timestamp.
  saveRemoteEvents(
    pollbookEvents: PollbookEvent[],
    remoteMachineInformation: PollbookConfigurationInformation
  ): void {
    if (pollbookEvents.length === 0) {
      return;
    }
    this.logger.log(LogEventId.PollbookNetworkStatus, 'system', {
      message: `Saving ${pollbookEvents.length} remote events from machine ${remoteMachineInformation.machineId}`,
    });
    this.client.transaction(() => {
      const localInformation = this.getPollbookConfigurationInformation();
      if (
        !shouldPollbooksShareEvents(localInformation, remoteMachineInformation)
      ) {
        debug(
          'Events from remote machine do not match the current machines configuration, not syncing.'
        );
        throw new Error('mismatched-configuration');
      }
      for (const pollbookEvent of pollbookEvents) {
        this.saveEvent(pollbookEvent);
      }
    });
  }

  // Returns the events that the fromClock does not know about.
  getNewEvents(
    lastEventSyncedPerNode: Record<string, number>,
    limit: number = NETWORK_EVENT_LIMIT
  ): {
    events: PollbookEvent[];
    hasMore: boolean;
  } {
    const machineIds = Object.keys(lastEventSyncedPerNode);
    const placeholders = machineIds.map(() => '?').join(', ');
    // Query for all events from unknown machines.
    const unknownMachineQuery = `
      SELECT *
      FROM event_log
      WHERE machine_id NOT IN (${placeholders})
      ORDER BY physical_time, logical_counter, machine_id
      LIMIT ?
    `;
    // Query for recent events from known machines
    const knownMachineQuery = `
      SELECT *
      FROM event_log
      WHERE (${machineIds
        .map(() => `( machine_id = ? AND event_id > ? )`)
        .join(' OR ')})
      ORDER BY physical_time, logical_counter, machine_id
      LIMIT ?
    `;
    const queryParams = [
      ...machineIds.flatMap((id) => [id, lastEventSyncedPerNode[id]]),
    ];

    return this.client.transaction(() => {
      const rowsForUnknownMachines = this.client.all(
        unknownMachineQuery,
        ...machineIds,
        limit + 1
      ) as EventDbRow[];

      const rowsForKnownMachines =
        machineIds.length > 0 && !(rowsForUnknownMachines.length > limit)
          ? (this.client.all(
              knownMachineQuery,
              ...queryParams,
              limit + 1 - rowsForUnknownMachines.length
            ) as EventDbRow[])
          : [];
      const rows = [...rowsForUnknownMachines, ...rowsForKnownMachines];
      const hasMore = rows.length > limit;

      const eventRows = hasMore ? rows.slice(0, limit) : rows;

      const events = convertDbRowsToPollbookEvents(eventRows);

      return {
        events,
        hasMore,
      };
    });
  }

  getPollbookServicesByName(): Record<string, PollbookService> {
    debug(
      'Current pollbook avahi service names are: ',
      Object.keys(this.connectedPollbooks).join('||')
    );
    return this.connectedPollbooks;
  }

  setPollbookServiceForName(
    avahiServiceName: string,
    pollbookService: PollbookService
  ): void {
    debug('Setting pollbook service %s', avahiServiceName);
    debug('New status service: %o', pollbookService.status);
    if (!this.connectedPollbooks[avahiServiceName]) {
      this.logger.log(LogEventId.PollbookNetworkStatus, 'system', {
        message: `New pollbook service discovered: ${avahiServiceName}`,
        newStatus: pollbookService.status,
      });
    } else if (
      this.connectedPollbooks[avahiServiceName].status !==
      pollbookService.status
    ) {
      this.logger.log(LogEventId.PollbookNetworkStatus, 'system', {
        message: `Pollbook service ${avahiServiceName} status updated`,
        previousStatus: this.connectedPollbooks[avahiServiceName].status,
        newStatus: pollbookService.status,
      });
    }

    // Update the machines table with the pollbook service information
    this.connectedPollbooks[avahiServiceName] = pollbookService;
    this.client.run(
      `
      INSERT INTO machines (machine_id, status, last_seen, pollbook_information)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(machine_id) DO UPDATE SET
        status = excluded.status,
        last_seen = excluded.last_seen,
        pollbook_information = excluded.pollbook_information
      `,
      pollbookService.machineId,
      pollbookService.status,
      pollbookService.lastSeen.getTime(),
      JSON.stringify({
        electionId: pollbookService.electionId,
        electionBallotHash: pollbookService.electionBallotHash,
        pollbookPackageHash: pollbookService.pollbookPackageHash,
        electionTitle: pollbookService.electionTitle,
        codeVersion: pollbookService.codeVersion,
        machineId: pollbookService.machineId,
      })
    );
  }

  cleanupStalePollbookServices(): void {
    for (const [avahiServiceName, pollbookService] of Object.entries(
      this.connectedPollbooks
    )) {
      if (
        getCurrentTime() - pollbookService.lastSeen.getTime() >
        MACHINE_DISCONNECTED_TIMEOUT
      ) {
        debug('Removing stale pollbook service %s', avahiServiceName);
        this.setPollbookServiceForName(avahiServiceName, {
          ...pollbookService,
          status: PollbookConnectionStatus.LostConnection,
          apiClient: undefined,
        });
      }
    }
  }

  async configureFromPeerMachine(
    assetDirectoryPath: string,
    machineId: string
  ): Promise<Result<void, ConfigurationError>> {
    const election = this.getElection();
    if (election) {
      return err('already-configured');
    }

    this.logger.log(LogEventId.PollbookConfigurationStatus, 'system', {
      message: `Configuring election from peer machine with ID: ${machineId}`,
    });
    // Find the connected pollbook with the given machineId
    const pollbooks = this.getPollbookServicesByName();
    const peer = Object.values(pollbooks).find(
      (pb) => pb.machineId === machineId && pb.apiClient
    );
    if (
      !peer ||
      !peer.apiClient ||
      !peer.address ||
      // The status below indicates the pollbook has a compatible configuration
      peer.status !== PollbookConnectionStatus.MismatchedConfiguration
    ) {
      return err('pollbook-connection-problem');
    }
    const tempPath = `${tmpdir()}/pollbook-package-${randomUUID()}.zip`;
    // Download the pollbook package zip via streaming
    try {
      const pollbookUrl = `${peer.address}/file/pollbook-package`;
      const response = await fetch(pollbookUrl);
      if (!response.ok) {
        return err('pollbook-connection-problem');
      }
      // Save to a temp file
      const fileStream = createWriteStream(tempPath);
      await pipeline(response.body, fileStream);
      // Read and parse the pollbook package
      const pollbookPackageResult = await readPollbookPackage(tempPath);
      if (pollbookPackageResult.isErr()) {
        return err('invalid-pollbook-package');
      }
      const pollbookPackage = pollbookPackageResult.ok();
      // Configure this machine
      const error = this.setElectionAndVoters(
        pollbookPackage.electionDefinition,
        pollbookPackage.packageHash,
        pollbookPackage.validStreets,
        pollbookPackage.voters
      );
      if (error) {
        return err(error);
      }
      // Save the pollbook package to send to other machines if necessary
      const destinationPath = join(
        assetDirectoryPath,
        POLLBOOK_PACKAGE_ASSET_FILE_NAME
      );
      await pipeline(
        createReadStream(tempPath),
        createWriteStream(destinationPath)
      );
      return ok();
    } catch {
      return err('pollbook-connection-problem');
    } finally {
      await unlink(tempPath).catch((error) => {
        debug(`Failed to delete temporary file at ${tempPath}:`, error);
      });
    }
  }
}
