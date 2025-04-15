import { BaseLogger } from '@votingworks/logging';
import { Client as DbClient } from '@votingworks/db';
import { safeParseJson } from '@votingworks/types';
import { assert, groupBy, typedAs } from '@votingworks/basics';
import { SqliteBool, fromSqliteBool, asSqliteBool } from '@votingworks/utils';
import debug from 'debug';
import { generateId, SchemaPath, sortedByVoterName, Store } from './store';
import {
  ConfigurationStatus,
  EventDbRow,
  EventType,
  PollbookConnectionStatus,
  PollbookServiceInfo,
  SummaryStatistics,
  ThroughputStat,
  UndoVoterCheckInEvent,
  Voter,
  VoterAddressChange,
  VoterAddressChangeEvent,
  VoterAddressChangeRequest,
  VoterCheckInEvent,
  VoterGroup,
  VoterIdentificationMethod,
  VoterNameChange,
  VoterNameChangeEvent,
  VoterNameChangeRequest,
  VoterRegistration,
  VoterRegistrationEvent,
  VoterRegistrationRequest,
  VoterSchema,
  VoterSearchParams,
} from './types';
import {
  applyPollbookEventsToVoters,
  convertDbRowsToPollbookEvents,
  createVoterFromRegistrationData,
} from './event_helpers';
import { HybridLogicalClock } from './hybrid_logical_clock';
import { getCurrentTime } from './get_current_time';
import {
  isVoterAddressChangeValid,
  isVoterRegistrationValid,
  maybeGetStreetInfoForAddress,
} from './street_helpers';
import { isVoterNameChangeValid } from './voter_helpers';

export class LocalStore extends Store {
  private nextEventId?: number;
  private configurationStatus?: ConfigurationStatus;

  /**
   * Builds and returns a new store at `dbPath`.
   */
  static fileStore(
    dbPath: string,
    logger: BaseLogger,
    machineId: string
  ): LocalStore {
    return new LocalStore(
      DbClient.fileClient(dbPath, logger, SchemaPath),
      machineId
    );
  }

  /**
   * Builds and returns a new store whose data is kept in memory.
   */
  static memoryStore(machineId: string = 'test-machine'): LocalStore {
    return new LocalStore(DbClient.memoryClient(SchemaPath), machineId);
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

  private getAllVoters(): Record<string, Voter> | undefined {
    const voterRows = this.client.all(
      `
              SELECT v.voter_data
              FROM voters v
            `
    ) as Array<{ voter_data: string }>;
    if (!voterRows) {
      return undefined;
    }
    const votersMap: Record<string, Voter> = {};
    for (const row of voterRows) {
      const voter = safeParseJson(row.voter_data, VoterSchema).unsafeUnwrap();
      votersMap[voter.voterId] = voter;
    }

    const orderedEvents = this.getAllEventsOrderedSince();
    return applyPollbookEventsToVoters(votersMap, orderedEvents);
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

  deleteElectionAndVoters(): void {
    this.election = undefined;

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
  groupVotersAlphabeticallyByLastName(): Map<string, VoterGroup> {
    const voters = this.getAllVoters();
    assert(voters);
    const sortedVoters = sortedByVoterName(Object.values(voters), {
      useOriginalName: true,
    });
    const groupedVoters = Object.fromEntries(
      groupBy(sortedVoters, (v) => v.lastName[0].toUpperCase()).map(
        ([key, voterGroup]) => [key, voterGroup]
      )
    );

    const allLetters = Array.from({ length: 26 }, (_, i) =>
      String.fromCharCode(65 + i)
    );
    return new Map(
      allLetters.map((letter) => {
        const votersForLetter = groupedVoters[letter] || [];
        const existingVoters = votersForLetter.filter(
          (v) => v.registrationEvent === undefined
        );
        const newRegistrations = votersForLetter.filter(
          (v) => v.registrationEvent !== undefined
        );
        return [letter, { existingVoters, newRegistrations }];
      })
    );
  }

  getAllVotersSorted(): Voter[] {
    const voters = this.getAllVoters();
    if (!voters) {
      return [];
    }
    return sortedByVoterName(Object.values(voters));
  }

  searchVoters(searchParams: VoterSearchParams): Voter[] | number {
    const { lastName, firstName } = searchParams;
    const lastNameSearch = lastName.trim().toUpperCase();
    const firstNameSearch = firstName.trim().toUpperCase();
    const MAX_VOTER_SEARCH_RESULTS = 100;

    // Query the database for voters matching the search criteria
    const voterRows = this.client.all(
      `
            SELECT v.voter_id, v.voter_data
            FROM voters v
            WHERE updated_last_name LIKE ? 
              AND updated_first_name LIKE ?
            `,
      `${lastNameSearch}%`,
      `${firstNameSearch}%`
    ) as Array<{ voter_id: string; voter_data: string }>;

    if (voterRows.length === 0) {
      return [];
    }

    if (voterRows.length > MAX_VOTER_SEARCH_RESULTS) {
      return voterRows.length;
    }

    // Map voter rows to voter objects
    const voters: Record<string, Voter> = {};
    for (const row of voterRows) {
      voters[row.voter_id] = safeParseJson(
        row.voter_data,
        VoterSchema
      ).unsafeUnwrap();
    }

    // Query the database for events related to the matched voters
    const voterIds = voterRows.map((row) => row.voter_id);
    const placeholders = voterIds.map(() => '?').join(', ');
    const eventRows = this.client.all(
      `
            SELECT *
            FROM event_log
            WHERE voter_id IN (${placeholders})
            ORDER BY physical_time, logical_counter, machine_id
            `,
      ...voterIds
    ) as EventDbRow[];

    // Convert event rows to pollbook events and apply them to the voters
    const events = convertDbRowsToPollbookEvents(eventRows);
    const updatedVoters = applyPollbookEventsToVoters(voters, events);

    // Return the sorted list of voters
    return sortedByVoterName(Object.values(updatedVoters));
  }

  recordVoterCheckIn({
    voterId,
    identificationMethod,
  }: {
    voterId: string;
    identificationMethod: VoterIdentificationMethod;
  }): { voter: Voter; receiptNumber: number } {
    debug(`Recording check-in for voter ${voterId}`);
    const voter = this.getVoter(voterId);
    const isoTimestamp = new Date(getCurrentTime()).toISOString();
    // TODO: Should we check if there is a check in and throw an error if so?
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
    debug(`Undoing check-in for voter ${voterId}`);
    const voter = this.getVoter(voterId);
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

  registerVoter(voterRegistration: VoterRegistrationRequest): {
    voter: Voter;
    receiptNumber: number;
  } {
    debug(`Registering voter: ${JSON.stringify(voterRegistration)}`);
    assert(
      isVoterRegistrationValid(voterRegistration, this.getStreetInfo()),
      'Invalid voter registration'
    );
    const streetInfo = maybeGetStreetInfoForAddress(
      voterRegistration.streetName,
      voterRegistration.streetNumber,
      this.getStreetInfo()
    );
    assert(streetInfo);
    const registrationEvent: VoterRegistration = {
      ...voterRegistration,
      party: voterRegistration.party as 'DEM' | 'REP' | 'UND', // this is already validated
      timestamp: new Date(getCurrentTime()).toISOString(),
      voterId: generateId(),
      district: streetInfo.district,
    };
    const newVoter = createVoterFromRegistrationData(registrationEvent);
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

  changeVoterAddress(
    voterId: string,
    addressChange: VoterAddressChangeRequest
  ): { voter: Voter; receiptNumber: number } {
    debug(`Changing address for voter ${voterId}`);
    assert(
      isVoterAddressChangeValid(addressChange, this.getStreetInfo()),
      'Invalid address change'
    );
    const voter = this.getVoter(voterId);
    assert(voter);

    const addressChangeData: VoterAddressChange = {
      ...addressChange,
      timestamp: new Date(getCurrentTime()).toISOString(),
    };
    const updatedVoter: Voter = {
      ...voter,
      addressChange: addressChangeData,
    };

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

  changeVoterName(
    voterId: string,
    nameChange: VoterNameChangeRequest
  ): { voter: Voter; receiptNumber: number } {
    debug(`Changing name for voter ${voterId}`);
    assert(isVoterNameChangeValid(nameChange), 'Invalid name change');
    const voter = this.getVoter(voterId);
    assert(voter);

    const nameChangeData: VoterNameChange = {
      ...nameChange,
      timestamp: new Date(getCurrentTime()).toISOString(),
    };
    const updatedVoter: Voter = {
      ...voter,
      nameChange: nameChangeData,
    };

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
    const now = new Date(getCurrentTime());

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
    const voters = this.getAllVoters();
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

  getPollbookServiceInfo(): PollbookServiceInfo[] {
    const rows = this.client.all(
      `
      SELECT machine_id, status, last_seen
      FROM machines
      WHERE machine_id != ?
      `,
      this.machineId
    ) as Array<{
      machine_id: string;
      status: string;
      last_seen: number;
    }>;

    return rows.map((row) => ({
      machineId: row.machine_id,
      status: row.status as PollbookConnectionStatus,
      lastSeen: new Date(row.last_seen),
      numCheckIns: this.getCheckInCount(row.machine_id),
    }));
  }
}
