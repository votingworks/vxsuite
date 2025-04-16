import { BaseLogger } from '@votingworks/logging';
import { Client as DbClient } from '@votingworks/db';
import { SchemaPath, Store } from './store';
import { rootDebug } from './debug';
import {
  EventDbRow,
  PollbookConnectionStatus,
  PollbookEvent,
  PollbookService,
} from './types';
import { convertDbRowsToPollbookEvents } from './event_helpers';
import { getCurrentTime } from './get_current_time';
import { NETWORK_EVENT_LIMIT, MACHINE_DISCONNECTED_TIMEOUT } from './globals';
import { HlcTimestamp, HybridLogicalClock } from './hybrid_logical_clock';

const debug = rootDebug.extend('store:peer');

export class PeerStore extends Store {
  private readonly connectedPollbooks: Record<string, PollbookService> = {};
  private isOnline: boolean = false;

  constructor(client: DbClient, machineId: string) {
    super(client, machineId);

    // Load connected pollbooks from the database
    // TODO-CARO-IMPLEMENT should this be reset on reboot?
    this.client.run(`DELETE FROM machines`);
  }

  /**
   * Builds and returns a new store at `dbPath`.
   */
  static fileStore(
    dbPath: string,
    logger: BaseLogger,
    machineId: string
  ): PeerStore {
    return new PeerStore(
      DbClient.fileClient(dbPath, logger, SchemaPath),
      machineId
    );
  }

  /**
   * Builds and returns a new store whose data is kept in memory.
   */
  static memoryStore(machineId: string = 'test-machine'): PeerStore {
    return new PeerStore(DbClient.memoryClient(SchemaPath), machineId);
  }

  setOnlineStatus(isOnline: boolean): void {
    this.isOnline = isOnline;
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
  }

  // Saves all events received from a remote machine. Returning the last event's timestamp.
  saveRemoteEvents(pollbookEvents: PollbookEvent[]): void {
    let isSuccess = true;
    let earliestSyncTime: HlcTimestamp | undefined;
    this.client.transaction(() => {
      if (this.getElection() === undefined) {
        debug('No election set, not saving events');
        return;
      }
      for (const pollbookEvent of pollbookEvents) {
        isSuccess = isSuccess && this.saveEvent(pollbookEvent);
        if (!earliestSyncTime) {
          earliestSyncTime = pollbookEvent.timestamp;
        }
        if (
          HybridLogicalClock.compareHlcTimestamps(
            earliestSyncTime,
            pollbookEvent.timestamp
          ) > 0
        ) {
          earliestSyncTime = pollbookEvent.timestamp;
        }
      }
    });
  }

  /**
   * TODO-CARO-IMPLEMENT
   * We need to make this periodically see if we have been unconfigured and if so drop all existing connections with the following code
   *for (const [avahiServiceName, pollbookService] of Object.entries(
        this.connectedPollbooks
      )) {
        if (pollbookService.status === PollbookConnectionStatus.Connected) {
          this.setPollbookServiceForName(avahiServiceName, {
            ...pollbookService,
            status: PollbookConnectionStatus.WrongElection,
          });
        }
      }
   */

  getLastEventSyncedPerNode(): Record<string, number> {
    const rows = this.client.all(
      `SELECT machine_id, max(event_id) as max_event_id FROM event_log GROUP BY machine_id`
    ) as Array<{ machine_id: string; max_event_id: number }>;
    const lastEventSyncedPerNode: Record<string, number> = {};
    for (const row of rows) {
      lastEventSyncedPerNode[row.machine_id] = row.max_event_id;
    }
    return lastEventSyncedPerNode;
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
    this.connectedPollbooks[avahiServiceName] = pollbookService;

    // Update the machines table with the pollbook service information
    this.client.run(
      `
      INSERT INTO machines (machine_id, status, last_updated, last_seen)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(machine_id) DO UPDATE SET
        status = excluded.status,
        last_updated = excluded.last_updated,
        last_seen = excluded.last_seen
      `,
      pollbookService.machineId,
      pollbookService.status,
      getCurrentTime(),
      pollbookService.lastSeen.getTime()
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
}
