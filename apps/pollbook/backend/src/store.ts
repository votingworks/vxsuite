import { Client as DbClient } from '@votingworks/db';
// import { Iso8601Timestamp } from '@votingworks/types';
import { join } from 'node:path';
// import { v4 as uuid } from 'uuid';
import { BaseLogger } from '@votingworks/logging';
import {
  assert,
  groupBy,
  throwIllegalValue,
  typedAs,
} from '@votingworks/basics';
import { safeParseJson } from '@votingworks/types';
import { get } from 'node:http';
import { rootDebug } from './debug';
import {
  ConnectedPollbookService,
  Election,
  ElectionSchema,
  EventDbRow,
  EventType,
  PollbookConnectionStatus,
  PollbookEvent,
  PollbookService,
  PollbookServiceInfo,
  UndoVoterCheckInEvent,
  Voter,
  VoterCheckInEvent,
  VoterIdentificationMethod,
  VoterSchema,
  VoterSearchParams,
} from './types';
import { MACHINE_DISCONNECTED_TIMEOUT, NETWORK_EVENT_LIMIT } from './globals';
import { HlcTimestamp, HybridLogicalClock } from './hybrid_logical_clock';
import { convertDbRowsToPollbookEvents } from './event_helpers';

const debug = rootDebug;

const SchemaPath = join(__dirname, '../schema.sql');

export class Store {
  private voters?: Record<string, Voter>;
  private election?: Election;
  private connectedPollbooks: Record<string, PollbookService> = {};
  private currentClock?: HybridLogicalClock;
  private isOnline: boolean = false;
  private nextEventId?: number;

  private constructor(
    private readonly client: DbClient,
    private readonly machineId: string
  ) {}

  /**
   * Builds and returns a new store at `dbPath`.
   */
  static fileStore(
    dbPath: string,
    logger: BaseLogger,
    machineId: string
  ): Store {
    return new Store(
      DbClient.fileClient(dbPath, logger, SchemaPath),
      machineId
    );
  }

  /**
   * Builds and returns a new store whose data is kept in memory.
   */
  static memoryStore(machineId: string): Store {
    return new Store(DbClient.memoryClient(SchemaPath), machineId);
  }

  private incrementClock(): HlcTimestamp {
    if (!this.currentClock) {
      this.currentClock = new HybridLogicalClock(this.machineId);
    }
    return this.currentClock.tick();
  }

  private mergeLocalClockWithRemote(remoteClock: HlcTimestamp): HlcTimestamp {
    if (!this.currentClock) {
      this.currentClock = new HybridLogicalClock(this.machineId);
    }
    return this.currentClock.update(remoteClock);
  }

  private getNextEventId(): number {
    if (!this.nextEventId) {
      const row = this.client.one(
        'SELECT max(event_id) as max_event_id FROM event_log WHERE machine_id = ?',
        this.machineId
      ) as { max_event_id: number };
      this.nextEventId = row.max_event_id + 1;
    }
    const nextId = this.nextEventId;
    this.nextEventId += 1;
    return nextId;
  }

  private getVoters(): Record<string, Voter> | undefined {
    if (!this.voters) {
      this.initializeVoters();
    }
    return this.voters;
  }

  private initializeVoters(): void {
    const voterRows = this.client.all(
      `
            SELECT v.voter_data
            FROM voters v
          `
    ) as Array<{ voter_data: string }>;
    if (!voterRows) {
      this.voters = undefined;
      return;
    }
    const votersMap: Record<string, Voter> = {};
    for (const row of voterRows) {
      const voter = safeParseJson(row.voter_data, VoterSchema).unsafeUnwrap();
      votersMap[voter.voterId] = voter;
    }
    this.voters = votersMap;
  }

  // Reprocess all events starting from the given HLC timestamp. If no timestamp is given, reprocess all events.
  // Events are idempotent so this function can be called multiple times without side effects. The in memory voters
  // does not need to be cleared when reprocessing.
  private reprocessEventLogFromTimestamp(timestamp?: HlcTimestamp): void {
    // Apply all events in order to build initial state
    if (!this.voters) {
      this.initializeVoters();
    }
    if (!this.voters) {
      return;
    }
    const rows = timestamp
      ? (this.client.all(
          `
        SELECT * FROM event_log 
        WHERE physical_time >= ? OR 
          (physical_time = ? AND logical_counter >= ?) OR 
          (physical_time = ? AND logical_counter = ? AND machine_id >= ?)
        ORDER BY physical_time, logical_counter, machine_id
        `,
          timestamp.physical,
          timestamp.physical,
          timestamp.logical,
          timestamp.physical,
          timestamp.logical,
          timestamp.machineId
        ) as EventDbRow[])
      : (this.client.all(
          `
        SELECT * FROM event_log 
        ORDER BY physical_time, logical_counter, machine_id
      `
        ) as EventDbRow[]);

    const orderedEvents = convertDbRowsToPollbookEvents(rows);

    for (const event of orderedEvents) {
      switch (event.type) {
        case EventType.VoterCheckIn: {
          const checkIn = event as VoterCheckInEvent;
          const voter = this.voters[checkIn.voterId];
          voter.checkIn = checkIn.checkInData;
          break;
        }
        case EventType.UndoVoterCheckIn: {
          const undo = event as UndoVoterCheckInEvent;
          const voter = this.voters[undo.voterId];
          voter.checkIn = undefined;
          break;
        }
        default: {
          throwIllegalValue(event.type);
        }
      }
    }
  }

  getMachineId(): string {
    return this.machineId;
  }

  getIsOnline(): boolean {
    return this.isOnline;
  }

  getDbPath(): string {
    return this.client.getDatabasePath();
  }

  setOnlineStatus(isOnline: boolean): void {
    this.isOnline = isOnline;
    if (!isOnline) {
      // If we go offline, we should clear the list of connected pollbooks.
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
      this.reprocessEventLogFromTimestamp(earliestSyncTime);
    });
  }

  saveEvent(pollbookEvent: PollbookEvent): boolean {
    try {
      debug('Saving event %o', pollbookEvent);
      this.mergeLocalClockWithRemote(pollbookEvent.timestamp);

      switch (pollbookEvent.type) {
        case EventType.VoterCheckIn: {
          const event = pollbookEvent as VoterCheckInEvent;
          // Save the event
          this.client.run(
            'INSERT INTO event_log (event_id, machine_id, voter_id, event_type, physical_time, logical_counter, event_data) VALUES (?, ?, ?, ?, ?, ?, ?)',
            event.localEventId,
            event.machineId,
            event.voterId,
            event.type,
            event.timestamp.physical,
            event.timestamp.logical,
            JSON.stringify(event.checkInData)
          );
          return true;
        }
        case EventType.UndoVoterCheckIn: {
          const event = pollbookEvent as UndoVoterCheckInEvent;
          // Save the event
          this.client.run(
            'INSERT INTO event_log (event_id, machine_id, voter_id, event_type, physical_time, logical_counter, event_data) VALUES (?, ?, ?, ?, ?, ?, ?)',
            event.localEventId,
            event.machineId,
            event.voterId,
            event.type,
            event.timestamp.physical,
            event.timestamp.logical,
            '{}'
          );
          return true;
        }
        default: {
          throwIllegalValue(pollbookEvent.type);
        }
      }
    } catch (error) {
      debug('Failed to save event: %s', error);
      return false;
    }
  }

  getElection(): Election | undefined {
    if (!this.election) {
      // Load the election from the database if its not in memory.
      const row = this.client.one(
        `
          select election_data
          from elections
          order by rowid desc
          limit 1
        `
      ) as { election_data: string };
      if (!row) {
        return undefined;
      }
      const election: Election = safeParseJson(
        row.election_data,
        ElectionSchema
      ).unsafeUnwrap();
      this.election = election;
    }
    return this.election;
  }

  setElectionAndVoters(election: Election, voters: Voter[]): void {
    this.election = election;
    this.client.transaction(() => {
      this.client.run(
        `
          insert into elections (
            election_id,
            election_data
          ) values (
            ?, ?
          )
        `,
        election.id,
        JSON.stringify(election)
      );
      for (const voter of voters) {
        this.client.run(
          `
            insert into voters (
              voter_id,
              voter_data
            ) values (
              ?, ?
            )
          `,
          voter.voterId,
          JSON.stringify(voter)
        );
      }
      this.reprocessEventLogFromTimestamp();
    });
  }

  deleteElectionAndVoters(): void {
    this.election = undefined;
    this.voters = undefined;
    this.client.transaction(() => {
      this.client.run('delete from elections');
      this.client.run('delete from voters');
      this.client.run('delete from event_log');
    });
    this.currentClock = new HybridLogicalClock(this.machineId);
    this.nextEventId = 0;
  }

  groupVotersAlphabeticallyByLastName(): Array<Voter[]> {
    const voters = this.getVoters();
    assert(voters);
    return groupBy(Object.values(voters), (v) =>
      v.lastName[0].toUpperCase()
    ).map(([, voterGroup]) => voterGroup);
  }

  /* Helper function to get all voters in the database - only used in tests */
  getAllVoters(): Array<{
    voterId: string;
    firstName: string;
    lastName: string;
  }> {
    const voters = this.getVoters();
    if (!voters) {
      return [];
    }
    return Object.values(voters).map((v) => ({
      firstName: v.firstName,
      lastName: v.lastName,
      voterId: v.voterId,
    }));
  }

  searchVoters(searchParams: VoterSearchParams): Voter[] | number {
    const voters = this.getVoters();
    assert(voters);
    const MAX_VOTER_SEARCH_RESULTS = 20;
    const matchingVoters = Object.values(voters).filter(
      (voter) =>
        voter.lastName
          .toUpperCase()
          .startsWith(searchParams.lastName.toUpperCase()) &&
        voter.firstName
          .toUpperCase()
          .startsWith(searchParams.firstName.toUpperCase())
    );
    if (matchingVoters.length > MAX_VOTER_SEARCH_RESULTS) {
      return matchingVoters.length;
    }
    return matchingVoters;
  }

  getCurrentClockTime(): HlcTimestamp {
    if (!this.currentClock) {
      this.currentClock = new HybridLogicalClock(this.machineId);
    }
    return this.currentClock.now();
  }

  recordVoterCheckIn({
    voterId,
    identificationMethod,
  }: {
    voterId: string;
    identificationMethod: VoterIdentificationMethod;
  }): { voter: Voter; count: number } {
    debug('Recording check-in for voter %s', voterId);
    const voters = this.getVoters();
    assert(voters);
    const voter = voters[voterId];
    const isoTimestamp = new Date().toISOString();
    voter.checkIn = {
      identificationMethod,
      machineId: this.machineId,
      timestamp: isoTimestamp, // human readable timestamp for paper backup
    };
    const timestamp = this.incrementClock();
    const localEventId = this.getNextEventId();
    this.client.transaction(() => {
      assert(voter.checkIn);
      this.saveEvent(
        typedAs<VoterCheckInEvent>({
          type: EventType.VoterCheckIn,
          machineId: this.machineId,
          localEventId,
          voterId,
          timestamp,
          checkInData: voter.checkIn,
        })
      );
    });
    return { voter, count: this.getCheckInCount() };
  }

  recordUndoVoterCheckIn(voterId: string): Voter {
    debug('Undoing check-in for voter %s', voterId);
    const voters = this.getVoters();
    assert(voters);
    const voter = voters[voterId];
    voter.checkIn = undefined;
    const timestamp = this.incrementClock();
    const localEventId = this.getNextEventId();
    this.client.transaction(() => {
      this.saveEvent(
        typedAs<UndoVoterCheckInEvent>({
          type: EventType.UndoVoterCheckIn,
          machineId: this.machineId,
          voterId,
          timestamp,
          localEventId,
        })
      );
    });
    return voter;
  }

  getCheckInCount(machineId?: string): number {
    const voters = this.getVoters();
    assert(voters);
    return Object.values(voters).filter(
      (voter) =>
        voter.checkIn && (!machineId || voter.checkIn.machineId === machineId)
    ).length;
  }

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
    return this.connectedPollbooks;
  }

  setPollbookServiceForName(
    avahiServiceName: string,
    pollbookService: PollbookService
  ): void {
    this.connectedPollbooks[avahiServiceName] = pollbookService;
  }

  getPollbookServiceInfo(): PollbookServiceInfo[] {
    return Object.values(this.connectedPollbooks).map((service) => ({
      ...service,
      numCheckIns: this.getCheckInCount(service.machineId),
    }));
  }

  cleanupStalePollbookServices(): void {
    for (const [avahiServiceName, pollbookService] of Object.entries(
      this.connectedPollbooks
    )) {
      if (
        Date.now() - pollbookService.lastSeen.getTime() >
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
