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
} from './types';
import { MACHINE_DISCONNECTED_TIMEOUT } from './globals';

const debug = rootDebug;

const data: {
  voters?: Voter[];
  election?: Election;
  connectedPollbooks?: Record<string, PollBookService>;
  lastEventId?: integer;
} = {};

// function convertSqliteTimestampToIso8601(
//   sqliteTimestamp: string
// ): Iso8601Timestamp {
//   return new Date(sqliteTimestamp).toISOString();
// }

const SchemaPath = join(__dirname, '../schema.sql');

export class Store {
  private constructor(
    private readonly client: DbClient,
    private readonly machineId: string
  ) {}

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
      select voter_id, event_type, event_data
      from event_log
      where event_type IN (?, ?)
      order by timestamp
      `,
      EventType.VoterCheckIn,
      EventType.UndoVoterCheckIn
    ) as Array<{
      voter_id: string;
      event_type: EventType;
      event_data: string;
    }>;
    if (!rows) {
      return voters;
    }
    for (const row of rows) {
      switch (row.event_type) {
        case EventType.VoterCheckIn: {
          const voter = find(voters, (v) => v.voterId === row.voter_id);
          if (!voter) {
            continue;
          }
          voter.checkIn = safeParseJson(
            row.event_data,
            VoterCheckInSchema
          ).unsafeUnwrap();
          break;
        }
        case EventType.UndoVoterCheckIn: {
          const voter = find(voters, (v) => v.voterId === row.voter_id);
          if (!voter) {
            continue;
          }
          voter.checkIn = undefined;
          break;
        }
        default: {
          throwIllegalValue(row.event_type);
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
      switch (pollbookEvent.type) {
        case EventType.VoterCheckIn: {
          const event = pollbookEvent as VoterCheckInEvent;
          // Fail gracefully if the event was already saved.
          this.client.run(
            'INSERT OR IGNORE INTO event_log (event_id, machine_id, voter_id, event_type, timestamp, event_data) VALUES (?, ?, ?, ?, ?, ?)',
            event.eventId,
            event.machineId,
            event.voterId,
            event.type,
            event.timestamp,
            JSON.stringify(event.checkInData)
          );
          return true;
        }
        case EventType.UndoVoterCheckIn: {
          const event = pollbookEvent as UndoVoterCheckInEvent;
          this.client.run(
            'INSERT OR IGNORE INTO event_log (event_id, machine_id, voter_id, event_type, timestamp, event_data) VALUES (?, ?, ?, ?, ?, ?)',
            event.eventId,
            event.machineId,
            event.voterId,
            event.type,
            event.timestamp,
            '{}' // No event data for this event type.
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

  getKnownMachinesWithEventIds(): Record<string, integer> {
    const rows = this.client.all(
      'SELECT machine_id, max(event_id) as last_event_id FROM event_log GROUP BY machine_id'
    ) as Array<{ machine_id: string; last_event_id: integer }>;
    const machines: Record<string, integer> = {};
    for (const row of rows) {
      machines[row.machine_id] = row.last_event_id;
    }
    return machines;
  }

  private getNextEventId() {
    if (!data.lastEventId) {
      data.lastEventId = this.getLastSeenEventIdForMachine(this.machineId);
    }
    data.lastEventId += 1;
    return data.lastEventId;
  }

  recordVoterCheckIn({
    voterId,
    identificationMethod,
    machineId,
    timestamp,
  }: {
    voterId: string;
    identificationMethod: VoterIdentificationMethod;
    machineId: string;
    timestamp: Date;
  }): { voter: Voter; count: number } {
    const voters = this.getVoters();
    assert(voters);
    assert(machineId === this.machineId);
    const voter = find(voters, (v) => v.voterId === voterId);
    voter.checkIn = {
      timestamp: timestamp.toISOString(),
      identificationMethod,
      machineId,
    };
    const eventId = this.getNextEventId();
    this.saveEvent(
      typedAs<VoterCheckInEvent>({
        type: EventType.VoterCheckIn,
        eventId,
        machineId,
        voterId,
        timestamp: timestamp.toISOString(),
        checkInData: voter.checkIn,
      })
    );
    return { voter, count: this.getCheckInCount() };
  }

  recordUndoVoterCheckIn(voterId: string): Voter {
    const voters = this.getVoters();
    assert(voters);
    const voter = find(voters, (v) => v.voterId === voterId);
    voter.checkIn = undefined;
    const eventId = this.getNextEventId();
    const timestamp = new Date();
    this.saveEvent(
      typedAs<UndoVoterCheckInEvent>({
        type: EventType.UndoVoterCheckIn,
        eventId,
        machineId: this.machineId,
        voterId,
        timestamp: timestamp.toISOString(),
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

  getNewEvents(knownMachines: Record<string, integer>): PollbookEvent[] {
    const machineIds = Object.keys(knownMachines);
    const placeholders = machineIds.map(() => '?').join(', ');
    // Query for all events from unknown machines.
    const unknownMachineQuery = `
      SELECT event_id, machine_id, voter_id, event_type, timestamp, event_data
      FROM event_log
      WHERE machine_id NOT IN (${placeholders})
      ORDER BY timestamp
    `;
    // Query for recent events from known machines
    const knownMachineQuery = `
      SELECT event_id, machine_id, voter_id, event_type, timestamp, event_data
      FROM event_log
      WHERE (${machineIds
        .map(() => `( machine_id = ? AND event_id > ? )`)
        .join(' OR ')})
      ORDER BY timestamp
    `;
    const queryParams = [
      ...machineIds.flatMap((id) => [id, knownMachines[id]]),
    ];

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
    return data.connectedPollbooks || {};
  }

  setPollbookServiceForName(
    avahiServiceName: string,
    pollbookService: PollBookService
  ): void {
    if (!data.connectedPollbooks) {
      data.connectedPollbooks = {};
    }
    data.connectedPollbooks[avahiServiceName] = pollbookService;
  }

  getAllConnectedPollbookServices(): ConnectedPollbookService[] {
    if (!data.connectedPollbooks) {
      return [];
    }
    return Object.values(data.connectedPollbooks).filter(
      (service): service is ConnectedPollbookService =>
        service.status === PollbookConnectionStatus.Connected &&
        !!service.apiClient
    );
  }

  cleanupStalePollbookServices(): void {
    if (!data.connectedPollbooks) {
      return;
    }
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
