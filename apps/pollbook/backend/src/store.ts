import { Client as DbClient } from '@votingworks/db';
// import { Iso8601Timestamp } from '@votingworks/types';
import { join } from 'node:path';
// import { v4 as uuid } from 'uuid';
import { BaseLogger } from '@votingworks/logging';
import {
  assert,
  find,
  groupBy,
  throwIllegalValue,
  typedAs,
} from '@votingworks/basics';
import { safeParseJson } from '@votingworks/types';
import { integer } from '@votingworks/types/src/cdf/cast-vote-records';
import { rootDebug } from './debug';
import {
  ConnectedPollbookService,
  Election,
  ElectionSchema,
  EventDbRow,
  EventType,
  PollbookConnectionStatus,
  PollbookEvent,
  PollBookService,
  UndoVoterCheckInEvent,
  Voter,
  VoterCheckInEvent,
  VoterCheckInSchema,
  VoterIdentificationMethod,
  VoterSchema,
  VoterSearchParams,
  VectorClock,
  VectorClockSchema,
} from './types';
import { MACHINE_DISCONNECTED_TIMEOUT } from './globals';
import { mergeVectorClocks, compareVectorClocks } from './vector_clock';

const debug = rootDebug;

const data: {
  voters?: Voter[];
  election?: Election;
  connectedPollbooks: Record<string, PollBookService>;
  vectorClock: VectorClock;
} = {
  connectedPollbooks: {},
  vectorClock: {},
};

const SchemaPath = join(__dirname, '../schema.sql');

export class Store {
  private constructor(
    private readonly client: DbClient,
    private readonly machineId: string
  ) {}

  // Increments the vector clock for the current machine and returns the new value.
  // This function MUST be called before saving an event for the current machine.
  private incrementVectorClock(): number {
    if (!data.vectorClock[this.machineId]) {
      data.vectorClock[this.machineId] = 0;
    }
    data.vectorClock[this.machineId] += 1;
    return data.vectorClock[this.machineId];
  }

  private updateLocalVectorClock(remoteClock: VectorClock) {
    data.vectorClock = mergeVectorClocks(data.vectorClock, remoteClock);
  }

  getDbPath(): string {
    return this.client.getDatabasePath();
  }

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

  private applyEventsToVoters(voters: Voter[]): Voter[] {
    const rows = this.client.all(
      `
      select voter_id, event_type, event_data, machine_id, timestamp, vector_clock
      from event_log
      where event_type IN (?, ?)
      `,
      EventType.VoterCheckIn,
      EventType.UndoVoterCheckIn
    ) as Array<{
      voter_id: string;
      event_type: EventType;
      event_data: string;
      machine_id: string;
      timestamp: string;
      vector_clock: string;
    }>;

    if (!rows) {
      return voters;
    }

    const events = rows.map((row) => ({
      ...row,
      timestamp: new Date(row.timestamp),
      vector_clock: safeParseJson(
        row.vector_clock,
        VectorClockSchema
      ).unsafeUnwrap(),
    }));

    // Order events by the vector clocks, concurrent events are ordered by machine_id.
    const orderedEvents = [...events].sort((a, b) => {
      const clockComparison = compareVectorClocks(
        a.vector_clock,
        b.vector_clock
      );
      if (clockComparison !== 0) {
        return clockComparison;
      }
      // Tie breaker for concurrent events use system timestamps.
      return a.timestamp.getTime() - b.timestamp.getTime();
    });

    for (const event of orderedEvents) {
      // Most of the time this should be a no-op, but when a node is first starting up it will catch up the local clock.
      this.updateLocalVectorClock(event.vector_clock);
      switch (event.event_type) {
        case EventType.VoterCheckIn: {
          const voter = find(voters, (v) => v.voterId === event.voter_id);
          if (!voter) {
            continue;
          }
          voter.checkIn = safeParseJson(
            event.event_data,
            VoterCheckInSchema
          ).unsafeUnwrap();
          break;
        }
        case EventType.UndoVoterCheckIn: {
          const voter = find(voters, (v) => v.voterId === event.voter_id);
          if (!voter) {
            continue;
          }
          voter.checkIn = undefined;
          break;
        }
        default: {
          throwIllegalValue(event.event_type);
        }
      }
    }
    return voters;
  }

  private getVoters(): Voter[] | undefined {
    if (!data.voters) {
      // Load the voters from the database if they are not in memory.
      const rows = this.client.all(
        `
          select voter_data
          from voters
        `
      ) as Array<{ voter_data: string }>;
      if (!rows) {
        return undefined;
      }
      data.voters = rows.map((row) =>
        safeParseJson(row.voter_data, VoterSchema).unsafeUnwrap()
      );
    }
    return this.applyEventsToVoters(data.voters);
  }

  saveEvents(pollbookEvents: PollbookEvent[]): boolean {
    let isSuccess = true;
    this.client.transaction(() => {
      for (const pollbookEvent of pollbookEvents) {
        isSuccess = isSuccess && this.saveEvent(pollbookEvent);
      }
    });
    return isSuccess;
  }

  saveEvent(pollbookEvent: PollbookEvent): boolean {
    try {
      this.updateLocalVectorClock(pollbookEvent.vectorClock);

      switch (pollbookEvent.type) {
        case EventType.VoterCheckIn: {
          const event = pollbookEvent as VoterCheckInEvent;
          // Fail gracefully if the event was already saved.
          this.client.run(
            'INSERT INTO event_log (event_id, machine_id, voter_id, event_type, timestamp, event_data, vector_clock) VALUES (?, ?, ?, ?, ?, ?, ?)',
            event.eventId,
            event.machineId,
            event.voterId,
            event.type,
            event.timestamp,
            JSON.stringify(event.checkInData),
            JSON.stringify(event.vectorClock)
          );
          return true;
        }
        case EventType.UndoVoterCheckIn: {
          const event = pollbookEvent as UndoVoterCheckInEvent;
          this.client.run(
            'INSERT INTO event_log (event_id, machine_id, voter_id, event_type, timestamp, event_data, vector_clock) VALUES (?, ?, ?, ?, ?, ?, ?)',
            event.eventId,
            event.machineId,
            event.voterId,
            event.type,
            event.timestamp,
            '{}', // No event data for this event type.
            JSON.stringify(event.vectorClock)
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
    if (!data.election) {
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
      data.election = election;
    }
    return data.election;
  }

  setElectionAndVoters(election: Election, voters: Voter[]): void {
    data.election = election;
    data.voters = voters;
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
    });
  }

  deleteElectionAndVoters(): void {
    data.election = undefined;
    data.voters = undefined;
    this.client.transaction(() => {
      this.client.run('delete from elections');
      this.client.run('delete from voters');
      this.client.run('delete from event_log');
    });
    data.vectorClock = {};
  }

  groupVotersAlphabeticallyByLastName(): Array<Voter[]> {
    const voters = this.getVoters();
    assert(voters);
    return groupBy(voters, (v) => v.lastName[0].toUpperCase()).map(
      ([, voterGroup]) => voterGroup
    );
  }

  searchVoters(searchParams: VoterSearchParams): Voter[] | number {
    const voters = this.getVoters();
    assert(voters);
    const MAX_VOTER_SEARCH_RESULTS = 20;
    const matchingVoters = voters.filter(
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

  getLastSeenEventIdForMachine(machineId: string): integer {
    const row = this.client.one(
      'SELECT max(event_id) as last_event_id FROM event_log WHERE machine_id = ?',
      machineId
    ) as { last_event_id: integer };
    return row.last_event_id;
  }

  getCurrentClock(): VectorClock {
    return data.vectorClock;
  }

  recordVoterCheckIn({
    voterId,
    identificationMethod,
  }: {
    voterId: string;
    identificationMethod: VoterIdentificationMethod;
  }): { voter: Voter; count: number } {
    const voters = this.getVoters();
    assert(voters);
    const voter = find(voters, (v) => v.voterId === voterId);
    const timestamp = new Date();
    voter.checkIn = {
      identificationMethod,
      machineId: this.machineId,
      timestamp: timestamp.toISOString(),
    };
    const eventId = this.incrementVectorClock();
    this.saveEvent(
      typedAs<VoterCheckInEvent>({
        type: EventType.VoterCheckIn,
        eventId,
        machineId: this.machineId,
        voterId,
        timestamp: timestamp.toISOString(),
        checkInData: voter.checkIn,
        vectorClock: data.vectorClock,
      })
    );
    return { voter, count: this.getCheckInCount() };
  }

  recordUndoVoterCheckIn(voterId: string): Voter {
    const voters = this.getVoters();
    assert(voters);
    const voter = find(voters, (v) => v.voterId === voterId);
    voter.checkIn = undefined;
    const eventId = this.incrementVectorClock();
    const timestamp = new Date();
    this.saveEvent(
      typedAs<UndoVoterCheckInEvent>({
        type: EventType.UndoVoterCheckIn,
        eventId,
        machineId: this.machineId,
        voterId,
        timestamp: timestamp.toISOString(),
        vectorClock: data.vectorClock,
      })
    );
    return voter;
  }

  getCheckInCount(machineId?: string): number {
    const voters = this.getVoters();
    assert(voters);
    return voters.filter(
      (voter) =>
        voter.checkIn && (!machineId || voter.checkIn.machineId === machineId)
    ).length;
  }

  // Returns the events that the fromClock does not know about.
  getNewEvents(fromClock: VectorClock): PollbookEvent[] {
    const machineIds = Object.keys(fromClock);
    const placeholders = machineIds.map(() => '?').join(', ');
    // Query for all events from unknown machines.
    const unknownMachineQuery = `
      SELECT event_id, machine_id, voter_id, event_type, timestamp, vector_clock, event_data
      FROM event_log
      WHERE machine_id NOT IN (${placeholders})
      ORDER BY timestamp
    `;
    // Query for recent events from known machines
    const knownMachineQuery = `
      SELECT event_id, machine_id, voter_id, event_type, timestamp, vector_clock, event_data
      FROM event_log
      WHERE (${machineIds
        .map(() => `( machine_id = ? AND event_id > ? )`)
        .join(' OR ')})
      ORDER BY timestamp
    `;
    const queryParams = [...machineIds.flatMap((id) => [id, fromClock[id]])];

    return this.client.transaction(() => {
      const rowsForMissingMachines = this.client.all(
        unknownMachineQuery,
        ...machineIds
      ) as EventDbRow[];
      const rowsForKnownMachines =
        machineIds.length > 0
          ? (this.client.all(knownMachineQuery, ...queryParams) as EventDbRow[])
          : [];
      const events: PollbookEvent[] = [];
      for (const row of [...rowsForMissingMachines, ...rowsForKnownMachines]) {
        switch (row.event_type) {
          case EventType.VoterCheckIn: {
            events.push(
              typedAs<VoterCheckInEvent>({
                type: EventType.VoterCheckIn,
                eventId: row.event_id,
                machineId: row.machine_id,
                timestamp: row.timestamp,
                voterId: row.voter_id,
                checkInData: safeParseJson(
                  row.event_data,
                  VoterCheckInSchema
                ).unsafeUnwrap(),
                vectorClock: safeParseJson(
                  row.vector_clock,
                  VectorClockSchema
                ).unsafeUnwrap(),
              })
            );
            break;
          }
          case EventType.UndoVoterCheckIn: {
            events.push(
              typedAs<UndoVoterCheckInEvent>({
                type: EventType.UndoVoterCheckIn,
                eventId: row.event_id,
                machineId: row.machine_id,
                timestamp: row.timestamp,
                voterId: row.voter_id,
                vectorClock: safeParseJson(
                  row.vector_clock,
                  VectorClockSchema
                ).unsafeUnwrap(),
              })
            );
            break;
          }
          default: {
            throwIllegalValue(row.event_type);
          }
        }
      }
      return events;
    });
  }

  getPollbookServicesByName(): Record<string, PollBookService> {
    return data.connectedPollbooks;
  }

  setPollbookServiceForName(
    avahiServiceName: string,
    pollbookService: PollBookService
  ): void {
    data.connectedPollbooks[avahiServiceName] = pollbookService;
  }

  getAllConnectedPollbookServices(): ConnectedPollbookService[] {
    return Object.values(data.connectedPollbooks).filter(
      (service): service is ConnectedPollbookService =>
        service.status === PollbookConnectionStatus.Connected &&
        !!service.apiClient
    );
  }

  cleanupStalePollbookServices(): void {
    for (const [avahiServiceName, pollbookService] of Object.entries(
      data.connectedPollbooks
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
