import { Client as DbClient } from '@votingworks/db';
// import { Iso8601Timestamp } from '@votingworks/types';
import { join } from 'node:path';
import { v4 as uuid } from 'uuid';
import { BaseLogger } from '@votingworks/logging';
import {
  assert,
  groupBy,
  throwIllegalValue,
  typedAs,
} from '@votingworks/basics';
import { safeParseInt, safeParseJson } from '@votingworks/types';
import { asSqliteBool, fromSqliteBool, SqliteBool } from '@votingworks/utils';
import { rootDebug } from './debug';
import {
  ConfigurationStatus,
  Election,
  ElectionSchema,
  EventDbRow,
  EventType,
  PollbookConnectionStatus,
  PollbookEvent,
  PollbookService,
  PollbookServiceInfo,
  UndoVoterCheckInEvent,
  ValidStreetInfo,
  ValidStreetInfoSchema,
  Voter,
  VoterCheckInEvent,
  VoterIdentificationMethod,
  VoterRegistration,
  VoterRegistrationEvent,
  VoterRegistrationRequest,
  VoterSchema,
  VoterSearchParams,
} from './types';
import { MACHINE_DISCONNECTED_TIMEOUT, NETWORK_EVENT_LIMIT } from './globals';
import { HlcTimestamp, HybridLogicalClock } from './hybrid_logical_clock';
import { convertDbRowsToPollbookEvents } from './event_helpers';

const debug = rootDebug.extend('store');

const SchemaPath = join(__dirname, '../schema.sql');

export class Store {
  private voters?: Record<string, Voter>;
  private election?: Election;
  private validStreetInfo?: ValidStreetInfo[];
  private connectedPollbooks: Record<string, PollbookService> = {};
  private currentClock?: HybridLogicalClock;
  private isOnline: boolean = false;
  private nextEventId?: number;
  private configurationStatus?: ConfigurationStatus;

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
    this.reprocessEventLogFromTimestamp();
  }

  // Reprocess all events starting from the given HLC timestamp. If no timestamp is given, reprocess all events.
  // Events are idempotent so this function can be called multiple times without side effects. The in memory voters
  // does not need to be cleared when reprocessing.
  private reprocessEventLogFromTimestamp(timestamp?: HlcTimestamp): void {
    debug('Reprocessing event log from timestamp %o', timestamp);
    // Apply all events in order to build initial state
    if (!this.voters) {
      // If we don't have voters, we can't reprocess the event log.
      // Initializing the voters will trigger a full reprocess.
      this.initializeVoters();
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
          // If we receive an event for a voter that doesn't exist, we should ignore it.
          // If we get the VoterRegistration event for that voter later, this event will get reprocessed.
          if (!voter) {
            debug('Voter %s not found', checkIn.voterId);
            continue;
          }
          voter.checkIn = checkIn.checkInData;
          break;
        }
        case EventType.UndoVoterCheckIn: {
          const undo = event as UndoVoterCheckInEvent;
          const voter = this.voters[undo.voterId];
          if (!voter) {
            debug('Voter %s not found', undo.voterId);
            continue;
          }
          voter.checkIn = undefined;
          break;
        }
        case EventType.VoterRegistration: {
          const registration = event as VoterRegistrationEvent;
          const newVoter = this.createVoterFromRegistrationData(
            registration.registrationData
          );
          this.voters[newVoter.voterId] = newVoter;
          break;
        }
        default: {
          throwIllegalValue(event.type);
        }
      }
    }
  }

  getConfigurationStatus(): ConfigurationStatus | undefined {
    return this.configurationStatus;
  }

  setConfigurationStatus(status?: ConfigurationStatus): void {
    this.configurationStatus = status;
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
        case EventType.VoterRegistration: {
          const event = pollbookEvent as VoterRegistrationEvent;
          this.client.run(
            'INSERT INTO event_log (event_id, machine_id, voter_id, event_type, physical_time, logical_counter, event_data) VALUES (?, ?, ?, ?, ?, ?, ?)',
            event.localEventId,
            event.machineId,
            event.voterId,
            event.type,
            event.timestamp.physical,
            event.timestamp.logical,
            JSON.stringify(event.registrationData)
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
          select election_data, valid_street_data
          from elections
          order by rowid desc
          limit 1
        `
      ) as { election_data: string; valid_street_data: string };
      if (!row) {
        return undefined;
      }
      const election: Election = safeParseJson(
        row.election_data,
        ElectionSchema
      ).unsafeUnwrap();
      this.election = election;

      const validStreetInfo: ValidStreetInfo[] = safeParseJson(
        row.valid_street_data,
        ValidStreetInfoSchema
      ).unsafeUnwrap();
      this.validStreetInfo = validStreetInfo;
    }
    return this.election;
  }

  setElectionAndVoters(
    election: Election,
    validStreets: ValidStreetInfo[],
    voters: Voter[]
  ): void {
    this.election = election;
    this.validStreetInfo = validStreets;
    this.client.transaction(() => {
      this.client.run(
        `
          insert into elections (
            election_id,
            election_data,
            valid_street_data,
            is_absentee_mode
          ) values (
            ?, ?, ?, 0
          )
        `,
        election.id,
        JSON.stringify(election),
        JSON.stringify(validStreets)
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
      this.initializeVoters();
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

  getIsAbsenteeMode(): boolean {
    const { isAbsenteeMode } = this.client.one(
      `
        select
          is_absentee_mode as isAbsenteeMode
        from elections
      `
    ) as { isAbsenteeMode: SqliteBool };
    return fromSqliteBool(isAbsenteeMode);
  }

  setIsAbsenteeMode(isAbsenteeMode: boolean): void {
    this.client.run(
      `
        update elections
        set is_absentee_mode = ?
      `,
      asSqliteBool(isAbsenteeMode)
    );
  }

  groupVotersAlphabeticallyByLastName(
    includeNewRegistrations: boolean = false
  ): Array<Voter[]> {
    const voters = this.getVoters();
    assert(voters);
    const groups = groupBy(
      Object.values(voters).filter(
        (v) => includeNewRegistrations || v.registrationEvent === undefined
      ),
      (v) => v.lastName[0].toUpperCase()
    ).map(([, voterGroup]) => voterGroup);
    // eslint-disable-next-line vx/no-array-sort-mutation
    return groups.sort((group1, group2) =>
      group1[0].lastName[0].localeCompare(group2[0].lastName[0])
    );
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
    const MAX_VOTER_SEARCH_RESULTS = 50;
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
      isAbsentee: this.getIsAbsenteeMode(),
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

  private createVoterFromRegistrationData(
    registrationEvent: VoterRegistration
  ): Voter {
    assert(registrationEvent.voterId !== undefined);
    return {
      voterId: registrationEvent.voterId,
      firstName: registrationEvent.firstName,
      lastName: registrationEvent.lastName,
      streetNumber: registrationEvent.streetNumber,
      streetName: registrationEvent.streetName,
      postalCityTown: registrationEvent.city,
      state: 'NH', // TODO update to not hard code
      postalZip5: registrationEvent.zipCode,
      party: registrationEvent.party,
      suffix: registrationEvent.suffix,
      middleName: registrationEvent.middleName,
      addressSuffix: registrationEvent.streetSuffix,
      houseFractionNumber: registrationEvent.houseFractionNumber,
      apartmentUnitNumber: registrationEvent.apartmentUnitNumber,
      addressLine2: registrationEvent.addressLine2,
      addressLine3: registrationEvent.addressLine3,
      zip4: '',
      mailingStreetNumber: '',
      mailingSuffix: '',
      mailingHouseFractionNumber: '',
      mailingStreetName: '',
      mailingApartmentUnitNumber: '',
      mailingAddressLine2: '',
      mailingAddressLine3: '',
      mailingCityTown: '',
      mailingState: '',
      mailingZip5: '',
      mailingZip4: '',
      district: registrationEvent.district || '',
      registrationEvent,
    };
  }

  getStreetInfoForVoterRegistration(
    voterRegistration: VoterRegistrationRequest
  ): ValidStreetInfo | undefined {
    const validStreetNames = this.getStreetInfo().filter(
      (info) => info.streetName === voterRegistration.streetName
    );
    const voterStreetNumberResult = safeParseInt(
      voterRegistration.streetNumber
    );
    if (!voterStreetNumberResult.isOk()) {
      return undefined;
    }
    const voterStreetNumber = voterStreetNumberResult.ok();
    for (const streetInfo of validStreetNames) {
      const step = streetInfo.side === 'all' ? 1 : 2;
      const validNumbers = new Set<number>();
      for (let n = streetInfo.lowRange; n <= streetInfo.highRange; n += step) {
        validNumbers.add(n);
      }
      if (validNumbers.has(voterStreetNumber)) {
        return streetInfo;
      }
    }
    return undefined;
  }

  isVoterRegistrationValid(
    voterRegistration: VoterRegistrationRequest
  ): boolean {
    const streetInfo =
      this.getStreetInfoForVoterRegistration(voterRegistration);
    return (
      streetInfo !== undefined &&
      voterRegistration.firstName.length > 0 &&
      voterRegistration.lastName.length > 0 &&
      voterRegistration.streetNumber.length > 0 &&
      voterRegistration.city.length > 0 &&
      voterRegistration.zipCode.length === 5 &&
      voterRegistration.party.length > 0 &&
      ['DEM', 'REP', 'UND'].includes(voterRegistration.party)
    );
  }

  registerVoter(voterRegistration: VoterRegistrationRequest): Voter {
    debug('Registering voter %o', voterRegistration);
    const voters = this.getVoters();
    assert(voters);
    assert(
      this.isVoterRegistrationValid(voterRegistration),
      'Invalid voter registration'
    );
    const streetInfo =
      this.getStreetInfoForVoterRegistration(voterRegistration);
    assert(streetInfo);
    const registrationEvent: VoterRegistration = {
      ...voterRegistration,
      party: voterRegistration.party as 'DEM' | 'REP' | 'UND', // this is already validated
      timestamp: new Date().toISOString(),
      voterId: uuid(),
      district: streetInfo.district,
    };
    const newVoter = this.createVoterFromRegistrationData(registrationEvent);
    voters[newVoter.voterId] = newVoter;
    const timestamp = this.incrementClock();
    const localEventId = this.getNextEventId();
    this.client.transaction(() => {
      this.saveEvent(
        typedAs<VoterRegistrationEvent>({
          type: EventType.VoterRegistration,
          machineId: this.machineId,
          voterId: newVoter.voterId,
          timestamp,
          localEventId,
          registrationData: registrationEvent,
        })
      );
    });
    return newVoter;
  }

  // Returns the valid street info. Used when registering a voter to populate address typeahead options.
  // TODO the frontend doesn't need to know everything in the ValidStreetInfo object. This could be paired down.
  getStreetInfo(): ValidStreetInfo[] {
    return this.validStreetInfo || [];
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
