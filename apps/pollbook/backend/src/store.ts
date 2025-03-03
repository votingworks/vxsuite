import { Client as DbClient } from '@votingworks/db';
// import { Iso8601Timestamp } from '@votingworks/types';
import { join } from 'node:path';
import { v4 as uuid } from 'uuid';
import { BaseLogger } from '@votingworks/logging';
import {
  assert,
  assertDefined,
  groupBy,
  throwIllegalValue,
  typedAs,
} from '@votingworks/basics';
import { safeParseInt, safeParseJson } from '@votingworks/types';
import { asSqliteBool, fromSqliteBool, SqliteBool } from '@votingworks/utils';
import { customAlphabet } from 'nanoid';
import { rootDebug } from './debug';
import {
  PollbookEvent,
  ConfigurationStatus,
  Election,
  ElectionSchema,
  EventDbRow,
  EventType,
  PollbookConnectionStatus,
  PollbookService,
  PollbookServiceInfo,
  SummaryStatistics,
  ThroughputStat,
  UndoVoterCheckInEvent,
  ValidStreetInfo,
  ValidStreetInfoSchema,
  Voter,
  VoterAddressChange,
  VoterAddressChangeEvent,
  VoterAddressChangeRequest,
  VoterCheckInEvent,
  VoterGroup,
  VoterIdentificationMethod,
  VoterRegistration,
  VoterRegistrationEvent,
  VoterRegistrationRequest,
  VoterSchema,
  VoterSearchParams,
  VoterNameChangeRequest,
  VoterNameChange,
  VoterNameChangeEvent,
} from './types';
import { MACHINE_DISCONNECTED_TIMEOUT, NETWORK_EVENT_LIMIT } from './globals';
import { HlcTimestamp, HybridLogicalClock } from './hybrid_logical_clock';
import { convertDbRowsToPollbookEvents } from './event_helpers';

const debug = rootDebug.extend('store');
const debugConnections = debug.extend('connections');

const SchemaPath = join(__dirname, '../schema.sql');

const idGenerator = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

/**
 * Generates a URL-friendly and double-click-copy-friendly unique ID using a
 * cryptographically secure RNG.
 */
export function generateId(): string {
  return idGenerator();
}

function sortedByVoterName(
  voters: Voter[],
  { useOriginalName = false } = {}
): Voter[] {
  return voters.toSorted((v1, v2) => {
    const v1Name = useOriginalName ? v1 : v1.nameChange ?? v1;
    const v2Name = useOriginalName ? v2 : v2.nameChange ?? v2;
    return (
      v1Name.lastName.localeCompare(v2Name.lastName) ||
      v1Name.firstName.localeCompare(v2Name.firstName) ||
      v1Name.middleName.localeCompare(v2Name.middleName) ||
      v1Name.suffix.localeCompare(v2Name.suffix)
    );
  });
}

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
          const voter = this.voters[event.voterId];
          // If we receive an event for a voter that doesn't exist, we should ignore it.
          // If we get the VoterRegistration event for that voter later, this event will get reprocessed.
          if (!voter) {
            debug('Voter %s not found', event.voterId);
            continue;
          }
          voter.checkIn = event.checkInData;
          break;
        }
        case EventType.UndoVoterCheckIn: {
          const voter = this.voters[event.voterId];
          if (!voter) {
            debug('Voter %s not found', event.voterId);
            continue;
          }
          voter.checkIn = undefined;
          break;
        }
        case EventType.VoterAddressChange: {
          const { voterId, addressChangeData } = event;
          this.voters[voterId] = {
            ...this.voters[voterId],
            addressChange: addressChangeData,
          };
          break;
        }
        case EventType.VoterNameChange: {
          const { voterId, nameChangeData } = event;
          this.voters[voterId] = {
            ...this.voters[voterId],
            nameChange: nameChangeData,
          };
          break;
        }
        case EventType.VoterRegistration: {
          const newVoter = this.createVoterFromRegistrationData(
            event.registrationData
          );
          this.voters[newVoter.voterId] = newVoter;
          break;
        }
        default: {
          throwIllegalValue(event, 'type');
        }
      }
    }
  }

  getNextReceiptNumber(): number {
    const row = this.client.one(
      'SELECT count(*) as eventCount FROM event_log'
    ) as { eventCount: number };
    return row.eventCount + 1;
  }

  getLastReceiptNumber(): number {
    const row = this.client.one(
      'SELECT max(receipt_number) as maxReceiptNumber FROM event_log'
    ) as { maxReceiptNumber: number };
    return row.maxReceiptNumber;
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
      debugConnections('Clearing connected pollbooks due to offline status');
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
      this.reprocessEventLogFromTimestamp(earliestSyncTime);
    });
  }

  saveEvent(pollbookEvent: PollbookEvent): boolean {
    try {
      debug('Saving event %o', pollbookEvent);
      this.mergeLocalClockWithRemote(pollbookEvent.timestamp);

      const eventData = (() => {
        switch (pollbookEvent.type) {
          case EventType.VoterCheckIn:
            return pollbookEvent.checkInData;
          case EventType.UndoVoterCheckIn:
            return {};
          case EventType.VoterAddressChange:
            return pollbookEvent.addressChangeData;
          case EventType.VoterNameChange:
            return pollbookEvent.nameChangeData;
          case EventType.VoterRegistration:
            return pollbookEvent.registrationData;
          default:
            throwIllegalValue(pollbookEvent, 'type');
        }
      })();

      this.client.run(
        `
        INSERT INTO event_log (
          event_id,
          machine_id,
          voter_id,
          receipt_number,
          event_type,
          physical_time,
          logical_counter,
          event_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        pollbookEvent.localEventId,
        pollbookEvent.machineId,
        pollbookEvent.voterId,
        pollbookEvent.receiptNumber,
        pollbookEvent.type,
        pollbookEvent.timestamp.physical,
        pollbookEvent.timestamp.logical,
        JSON.stringify(eventData)
      );
      return true;
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
    for (const [avahiServiceName, pollbookService] of Object.entries(
      this.connectedPollbooks
    )) {
      if (pollbookService.status === PollbookConnectionStatus.Connected) {
        this.setPollbookServiceForName(avahiServiceName, {
          ...pollbookService,
          status: PollbookConnectionStatus.WrongElection,
        });
      }
    }
    this.client.transaction(() => {
      this.client.run('delete from elections');
      this.client.run('delete from voters');
      this.client.run('delete from event_log');
    });
    this.currentClock = new HybridLogicalClock(this.machineId);
    this.nextEventId = 0;
  }

  getIsAbsenteeMode(): boolean {
    const result = this.client.one(
      `
        select
          is_absentee_mode as isAbsenteeMode
        from elections
      `
    ) as { isAbsenteeMode: SqliteBool } | undefined;
    return result ? fromSqliteBool(result.isAbsenteeMode) : false;
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

  groupVotersAlphabeticallyByLastName(): VoterGroup[] {
    const voters = this.getVoters();
    assert(voters);
    const sortedVoters = sortedByVoterName(Object.values(voters), {
      useOriginalName: true,
    });
    const groupedVoters = groupBy(sortedVoters, (v) =>
      v.lastName[0].toUpperCase()
    ).map(([, voterGroup]) => voterGroup);

    return Object.values(groupedVoters).map((votersForLetter) => {
      const existingVoters = votersForLetter.filter(
        (v) => v.registrationEvent === undefined
      );
      const newRegistrations = votersForLetter.filter(
        (v) => v.registrationEvent !== undefined
      );
      return { existingVoters, newRegistrations };
    });
  }

  getAllVoters(): Voter[] {
    const voters = this.getVoters();
    if (!voters) {
      return [];
    }
    return sortedByVoterName(Object.values(voters));
  }

  searchVoters(searchParams: VoterSearchParams): Voter[] | number {
    const voters = this.getVoters();
    assert(voters);
    const MAX_VOTER_SEARCH_RESULTS = 100;
    const lastNameSearch = searchParams.lastName.trim().toUpperCase();
    const firstNameSearch = searchParams.firstName.trim().toUpperCase();
    const matchingVoters = sortedByVoterName(
      Object.values(voters).filter((voter) => {
        const { lastName, firstName } = voter.nameChange ?? voter;
        return (
          lastName.toUpperCase().startsWith(lastNameSearch) &&
          firstName.toUpperCase().startsWith(firstNameSearch)
        );
      })
    );
    if (matchingVoters.length > MAX_VOTER_SEARCH_RESULTS) {
      return matchingVoters.length;
    }
    return matchingVoters;
  }

  getVoter(voterId: string): Voter {
    return assertDefined(this.getVoters())[voterId];
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
  }): { voter: Voter; receiptNumber: number } {
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
    const receiptNumber = this.getNextReceiptNumber();
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
          receiptNumber,
          timestamp,
          checkInData: voter.checkIn,
        })
      );
    });
    return { voter, receiptNumber };
  }

  recordUndoVoterCheckIn({
    voterId,
    reason,
  }: {
    voterId: string;
    reason: string;
  }): { voter: Voter; receiptNumber: number } {
    debug('Undoing check-in for voter %s', voterId);
    const voters = this.getVoters();
    assert(voters);
    const voter = voters[voterId];
    voter.checkIn = undefined;
    const receiptNumber = this.getNextReceiptNumber();
    const timestamp = this.incrementClock();
    const localEventId = this.getNextEventId();
    this.client.transaction(() => {
      this.saveEvent(
        typedAs<UndoVoterCheckInEvent>({
          type: EventType.UndoVoterCheckIn,
          machineId: this.machineId,
          voterId,
          reason,
          receiptNumber,
          timestamp,
          localEventId,
        })
      );
    });
    return { voter, receiptNumber };
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
      state: registrationEvent.state,
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

  private getStreetInfoForVoterAddress(
    voterRegistration: VoterAddressChangeRequest
  ): ValidStreetInfo | undefined {
    const validStreetNames = this.getStreetInfo().filter(
      (info) =>
        info.streetName.toLocaleUpperCase() === voterRegistration.streetName
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

  private isVoterRegistrationValid(
    voterRegistration: VoterRegistrationRequest
  ): boolean {
    const streetInfo = this.getStreetInfoForVoterAddress(voterRegistration);
    return (
      this.isVoterNameChangeValid(voterRegistration) &&
      streetInfo !== undefined &&
      voterRegistration.streetNumber.length > 0 &&
      voterRegistration.city.length > 0 &&
      voterRegistration.zipCode.length === 5 &&
      voterRegistration.party.length > 0 &&
      ['DEM', 'REP', 'UND'].includes(voterRegistration.party)
    );
  }

  registerVoter(voterRegistration: VoterRegistrationRequest): {
    voter: Voter;
    receiptNumber: number;
  } {
    debug('Registering voter %o', voterRegistration);
    const voters = this.getVoters();
    assert(voters);
    assert(
      this.isVoterRegistrationValid(voterRegistration),
      'Invalid voter registration'
    );
    const streetInfo = this.getStreetInfoForVoterAddress(voterRegistration);
    assert(streetInfo);
    const registrationEvent: VoterRegistration = {
      ...voterRegistration,
      party: voterRegistration.party as 'DEM' | 'REP' | 'UND', // this is already validated
      timestamp: new Date().toISOString(),
      voterId: generateId(),
      district: streetInfo.district,
    };
    const newVoter = this.createVoterFromRegistrationData(registrationEvent);
    voters[newVoter.voterId] = newVoter;
    const receiptNumber = this.getNextReceiptNumber();
    const timestamp = this.incrementClock();
    const localEventId = this.getNextEventId();
    this.client.transaction(() => {
      this.saveEvent(
        typedAs<VoterRegistrationEvent>({
          type: EventType.VoterRegistration,
          machineId: this.machineId,
          voterId: newVoter.voterId,
          receiptNumber,
          timestamp,
          localEventId,
          registrationData: registrationEvent,
        })
      );
    });
    return { voter: newVoter, receiptNumber };
  }

  private isVoterAddressChangeValid(
    addressChange: VoterAddressChangeRequest
  ): boolean {
    const streetInfo = this.getStreetInfoForVoterAddress(addressChange);
    return (
      streetInfo !== undefined &&
      addressChange.streetNumber.length > 0 &&
      addressChange.city.length > 0 &&
      addressChange.zipCode.length === 5
    );
  }

  changeVoterAddress(
    voterId: string,
    addressChange: VoterAddressChangeRequest
  ): { voter: Voter; receiptNumber: number } {
    debug(`Changing address for voter ${voterId}`);
    const voters = this.getVoters();
    assert(voters);
    assert(
      this.isVoterAddressChangeValid(addressChange),
      'Invalid address change'
    );

    const voter = voters[voterId];
    assert(voter);
    const addressChangeData: VoterAddressChange = {
      ...addressChange,
      timestamp: new Date().toISOString(),
    };
    const updatedVoter: Voter = {
      ...voter,
      addressChange: addressChangeData,
    };
    voters[voterId] = updatedVoter;

    const receiptNumber = this.getNextReceiptNumber();
    const timestamp = this.incrementClock();
    const localEventId = this.getNextEventId();
    this.client.transaction(() => {
      this.saveEvent(
        typedAs<VoterAddressChangeEvent>({
          type: EventType.VoterAddressChange,
          machineId: this.machineId,
          voterId,
          receiptNumber,
          timestamp,
          localEventId,
          addressChangeData,
        })
      );
    });

    return { voter: updatedVoter, receiptNumber };
  }

  private isVoterNameChangeValid(nameChange: VoterNameChangeRequest): boolean {
    return nameChange.firstName.length > 0 && nameChange.lastName.length > 0;
  }

  changeVoterName(
    voterId: string,
    nameChange: VoterNameChangeRequest
  ): { voter: Voter; receiptNumber: number } {
    debug(`Changing name for voter ${voterId}`);
    const voters = this.getVoters();
    assert(voters);
    assert(this.isVoterNameChangeValid(nameChange), 'Invalid name change');

    const voter = voters[voterId];
    assert(voter);
    const nameChangeData: VoterNameChange = {
      ...nameChange,
      timestamp: new Date().toISOString(),
    };
    const updatedVoter: Voter = {
      ...voter,
      nameChange: nameChangeData,
    };
    voters[voterId] = updatedVoter;

    const receiptNumber = this.getNextReceiptNumber();
    const timestamp = this.incrementClock();
    const localEventId = this.getNextEventId();
    this.client.transaction(() => {
      this.saveEvent(
        typedAs<VoterNameChangeEvent>({
          type: EventType.VoterNameChange,
          machineId: this.machineId,
          voterId,
          receiptNumber,
          timestamp,
          localEventId,
          nameChangeData,
        })
      );
    });

    return { voter: updatedVoter, receiptNumber };
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

  getThroughputStatistics(throughputInterval: number): ThroughputStat[] {
    const intervalMs = throughputInterval * 60 * 1000;
    const checkInEventRows = this.client.all(
      `SELECT * FROM event_log WHERE event_type = '${EventType.VoterCheckIn}' ORDER BY physical_time, logical_counter, machine_id`
    ) as EventDbRow[];
    if (checkInEventRows.length === 0) {
      return [];
    }
    const events = convertDbRowsToPollbookEvents(checkInEventRows);
    const checkInEvents = events.filter(
      (event): event is VoterCheckInEvent =>
        event.type === EventType.VoterCheckIn
    );

    const orderedByEventMachineTime = [...checkInEvents].sort((a, b) =>
      a.checkInData.timestamp.localeCompare(b.checkInData.timestamp)
    );
    // Group events by interval based on checkInData.timestamp
    const throughputStats: ThroughputStat[] = [];

    // Generate intervals of start and end times from the start of the hour of the first event until the present time.
    const now = new Date();

    const startOfHour = new Date(
      orderedByEventMachineTime[0].checkInData.timestamp
    );
    startOfHour.setMinutes(0);
    startOfHour.setSeconds(0);
    startOfHour.setMilliseconds(0);
    const intervals = [];
    for (
      let intervalStart = startOfHour;
      intervalStart < now;
      intervalStart = new Date(intervalStart.getTime() + intervalMs)
    ) {
      intervals.push({
        start: intervalStart,
        end: new Date(intervalStart.getTime() + intervalMs),
      });
    }

    // Populate throughputStats with the number of check-ins in each interval
    for (const interval of intervals) {
      const checkInsInInterval = orderedByEventMachineTime.filter(
        (event) =>
          event.checkInData.timestamp >= interval.start.toISOString() &&
          event.checkInData.timestamp < interval.end.toISOString()
      );
      throughputStats.push({
        startTime: interval.start.toISOString(),
        checkIns: checkInsInInterval.length,
        interval: throughputInterval,
      });
    }
    return throughputStats;
  }

  getSummaryStatistics(): SummaryStatistics {
    const voters = this.getVoters();
    assert(voters);
    const totalVoters = Object.keys(voters).length;
    const totalAbsenteeCheckIns = Object.values(voters).filter(
      (v) => v.checkIn && v.checkIn.isAbsentee
    ).length;
    const totalNewRegistrations = Object.values(voters).filter(
      (v) => v.registrationEvent !== undefined
    ).length;

    return {
      totalVoters,
      totalCheckIns: this.getCheckInCount(),
      totalAbsenteeCheckIns,
      totalNewRegistrations,
    };
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
    debugConnections(
      'Current pollbook avahi service names are: ',
      Object.keys(this.connectedPollbooks).join('||')
    );
    return this.connectedPollbooks;
  }

  setPollbookServiceForName(
    avahiServiceName: string,
    pollbookService: PollbookService
  ): void {
    debugConnections('Setting pollbook service %s', avahiServiceName);
    debugConnections('New status service: %o', pollbookService.status);
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
        debugConnections(
          'Removing stale pollbook service %s',
          avahiServiceName
        );
        this.setPollbookServiceForName(avahiServiceName, {
          ...pollbookService,
          status: PollbookConnectionStatus.LostConnection,
          apiClient: undefined,
        });
      }
    }
  }
}
