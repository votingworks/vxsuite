import { BaseLogger } from '@votingworks/logging';
import { Client as DbClient } from '@votingworks/db';
import {
  CheckInBallotParty,
  PrimarySummaryStatistics,
  safeParseJson,
  SummaryStatistics,
  Voter,
  VoterAddressChange,
  VoterAddressChangeRequest,
  VoterIdentificationMethod,
  VoterMailingAddressChange,
  VoterMailingAddressChangeRequest,
  VoterNameChange,
  VoterNameChangeRequest,
  VoterRegistration,
  VoterRegistrationRequest,
  VoterSchema,
} from '@votingworks/types';
import { assert, assertDefined, groupBy, typedAs } from '@votingworks/basics';
import { SqliteBool, fromSqliteBool, asSqliteBool } from '@votingworks/utils';
import makeDebug from 'debug';
import {
  generateId,
  SchemaPath,
  sortedByVoterName,
  sortedByVoterNameAndMatchingPrecinct,
  Store,
} from './store';
import {
  EventDbRow,
  EventType,
  PollbookConnectionStatus,
  PollbookInformationSchema,
  PollbookServiceInfo,
  ThroughputStat,
  UndoVoterCheckInEvent,
  VoterAddressChangeEvent,
  VoterMailingAddressChangeEvent,
  VoterCheckInEvent,
  VoterGroup,
  VoterInactivatedEvent,
  VoterNameChangeEvent,
  VoterRegistrationEvent,
  VoterRegistrationInvalidatedEvent,
  VoterSearchParams,
  PartyFilterAbbreviation,
} from './types';
import {
  applyPollbookEventsToVoters,
  convertDbRowsToPollbookEvents,
  createVoterFromRegistrationData,
} from './event_helpers';
import { HybridLogicalClock } from './hybrid_logical_clock';
import { getCurrentTime } from './get_current_time';
import {
  maybeGetStreetInfoForVoterRegistration,
  maybeGetStreetInfoForAddressChange,
} from './street_helpers';
import { isVoterNameChangeValid } from './voter_helpers';

const debug = makeDebug('pollbook:local-store');

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whitespace, apostrophe, period, hyphen
const ignoredPunctuation = `[\\s'\\.\\-]`;

function getRegexParts(raw: string): string[] {
  // Remove all ignored punctuation from the raw search string
  const clean = raw.trim().replace(new RegExp(ignoredPunctuation, 'g'), '');
  // Split the cleaned search string into single characters and escape so
  // regex metacharacters are treated as literals in the final search
  return Array.from(clean).map((ch) => escapeRegex(ch));
}

function toPatternStartsWith(raw: string): string {
  const parts = getRegexParts(raw);
  // Allows
  //   * 0+ punctuation chars up front
  //   * 0+ punctuation chars between each character of the search string
  //   * 0+ trailing characters (punctuation or not)
  return `^${ignoredPunctuation}*${parts.join(`${ignoredPunctuation}*`)}.*$`;
}

function toPatternMatches(raw: string): string {
  const parts = getRegexParts(raw);
  // Allows
  //   * 0+ punctuation chars up front
  //   * 0+ punctuation chars between each character of the search string
  //   * 0+ trailing punctuation-only characters
  return `^${ignoredPunctuation}*${parts.join(
    `${ignoredPunctuation}*`
  )}${ignoredPunctuation}*$`;
}

function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a regex to apply to the DB middle-name field
 * based on the search middle name.
 *
 * - DB empty middle name always matches
 * - If search middle is blank -> match anything (including blank)
 * - If search middle is an initial -> match blank OR that initial (optional '.') OR any DB entry's middle name starting with that letter
 * - If search middle is a full name (>=2 chars) -> match blank OR exact complete middle name OR the initial ("F"/"F.") in DB
 */
function toMiddleNameSearchPattern(searchMiddle?: string): string {
  const raw = (searchMiddle ?? '').trim();

  if (!raw) {
    return '.*';
  }

  const cleaned = raw.replace(/[^A-Za-z0-9]/g, '');

  if (!cleaned) {
    return '.*';
  }

  const initial = escapeRegexLiteral(cleaned[0]);

  // Regex that matches an empty DB middle-name field.
  // Empty middle names are always considered compatible.
  const allowBlank = '^$';

  // Initial character case eg. "F"
  if (cleaned.length === 1) {
    // Match any of:
    //  - empty DB middle name
    //  - exact initial, allowing optional punctuation ("F", "F.", "F   ")
    //  - any longer DB middle name starting with that letter
    return `^(?:${allowBlank}|${initial}\\.?(?:\\s*)|${initial}[A-Za-z].*)$`;
  }

  // Full middle name search case (e.g. "Franklin", "mid")
  // Build a pattern that matches the full middle name while allowing
  // arbitrary non-alphanumeric characters between letters:
  //
  //   "mid" -> "m[^A-Za-z0-9]*i[^A-Za-z0-9]*d"
  //
  // This allows:
  //   "mid"   <-> "MiD"
  //   "mid"   <-> "m id"
  //   "mid"   <-> "m-i.d"
  const full = cleaned
    .split('')
    .map((ch) => escapeRegexLiteral(ch))
    .join('[^A-Za-z0-9]*');

  // Match any of:
  //  - empty DB middle name
  //  - full middle name
  //  - initial-only DB middle name ("F" or "F.")
  return `^(?:${allowBlank}|${full}|${initial}\\.?)$`;
}

export class LocalStore extends Store {
  private nextEventId?: number;

  /**
   * Builds and returns a new store at `dbPath`.
   */
  static fileStore(
    dbPath: string,
    logger: BaseLogger,
    machineId: string,
    codeVersion: string
  ): LocalStore {
    const client = DbClient.fileClient(dbPath, logger, SchemaPath, {
      registerRegexpFn: true,
    });
    return new LocalStore(client, machineId, codeVersion, logger);
  }

  /**
   * Builds and returns a new store whose data is kept in memory.
   */
  static memoryStore(
    logger: BaseLogger,
    machineId: string = 'test-machine',
    codeVersion: string = 'test-v1'
  ): LocalStore {
    return new LocalStore(
      DbClient.memoryClient(SchemaPath, { registerRegexpFn: true }),
      machineId,
      codeVersion,
      logger
    );
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

  private getAllVotersInPrecinct(): Record<string, Voter> | undefined {
    const { configuredPrecinctId } = this.getPollbookConfigurationInformation();
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
      if (
        configuredPrecinctId &&
        (voter.addressChange
          ? voter.addressChange.precinct
          : voter.precinct) === configuredPrecinctId
      ) {
        votersMap[voter.voterId] = voter;
      }
    }

    const orderedEvents = this.getAllEventsOrderedSince();
    return applyPollbookEventsToVoters(votersMap, orderedEvents);
  }

  deleteElectionAndVoters(): void {
    this.election = undefined;

    this.client.transaction(() => {
      this.client.run('delete from elections');
      this.client.run('delete from voters');
      this.client.run('delete from check_in_status');
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
    assert(this.getElection() !== undefined);
    this.client.run(
      `
            update elections
            set is_absentee_mode = ?
          `,
      asSqliteBool(isAbsenteeMode)
    );
  }

  groupVotersAlphabeticallyByLastName(): Map<string, VoterGroup> {
    const voters = this.getAllVotersInPrecinct();
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
          (v) =>
            v.registrationEvent !== undefined && !v.isInvalidatedRegistration
        );
        return [letter, { existingVoters, newRegistrations }];
      })
    );
  }

  getAllVotersInPrecinctSorted(): Voter[] {
    const voters = this.getAllVotersInPrecinct();
    if (!voters) {
      return [];
    }
    return sortedByVoterName(Object.values(voters));
  }

  searchVoters(searchParams: VoterSearchParams): Voter[] | number {
    const { lastName, firstName, middleName, suffix } = searchParams;
    const MAX_VOTER_SEARCH_RESULTS = 100;

    const lastNamePattern = toPatternStartsWith(lastName);
    const middleNamePattern = toPatternStartsWith(middleName);
    const firstNamePattern = toPatternStartsWith(firstName);
    const suffixPattern = searchParams.ignoreSuffix
      ? '^.*$'
      : toPatternStartsWith(suffix);
    const { configuredPrecinctId } = this.getPollbookConfigurationInformation();

    // Query the database for voters matching the search criteria
    const voterRows = this.client.all(
      `
            SELECT v.voter_id, v.voter_data
            FROM voters v
            WHERE updated_last_name REGEXP ?
              AND updated_middle_name REGEXP ?
              AND updated_first_name REGEXP ?
              AND updated_suffix REGEXP ?
            `,
      `${lastNamePattern}`,
      `${middleNamePattern}`,
      `${firstNamePattern}`,
      `${suffixPattern}`
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

    return sortedByVoterNameAndMatchingPrecinct(
      Object.values(updatedVoters),
      configuredPrecinctId
    );
  }

  recordVoterCheckIn({
    voterId,
    identificationMethod,
    ballotParty,
  }: {
    voterId: string;
    identificationMethod: VoterIdentificationMethod;
    ballotParty: CheckInBallotParty;
  }): { voter: Voter; receiptNumber: number } {
    debug(`Recording check-in for voter ${voterId}`);
    const voter = this.getVoter(voterId);
    const isoTimestamp = new Date(getCurrentTime()).toISOString();
    const receiptNumber = this.getNextEventId();
    voter.checkIn = {
      identificationMethod,
      isAbsentee: this.getIsAbsenteeMode(),
      machineId: this.machineId,
      receiptNumber,
      timestamp: isoTimestamp, // human readable timestamp for paper backup
      ballotParty,
    };
    const timestamp = this.incrementClock();
    this.client.transaction(() => {
      assert(voter.checkIn);
      this.saveEvent(
        typedAs<VoterCheckInEvent>({
          type: EventType.VoterCheckIn,
          machineId: this.machineId,
          receiptNumber,
          voterId,
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
    const timestamp = this.incrementClock();
    const receiptNumber = this.getNextEventId();
    this.client.transaction(() => {
      this.saveEvent(
        typedAs<UndoVoterCheckInEvent>({
          type: EventType.UndoVoterCheckIn,
          machineId: this.machineId,
          voterId,
          reason,
          timestamp,
          receiptNumber,
        })
      );
    });
    return { voter, receiptNumber };
  }

  findVotersWithName(searchParams: VoterSearchParams): Voter[] {
    const lastNamePattern = toPatternMatches(searchParams.lastName);
    const firstNamePattern = toPatternMatches(searchParams.firstName);
    const middleNamePattern = toMiddleNameSearchPattern(
      searchParams.middleName
    );
    const suffixPattern = searchParams.ignoreSuffix
      ? '^.*$'
      : toPatternMatches(searchParams.suffix);
    const { configuredPrecinctId } = this.getPollbookConfigurationInformation();

    // Query the database for voters matching the first and last name criteria, we don't track the updated suffix/middle name
    // columns in the database so we will filter those from the results later.
    const voterRows = this.client.all(
      `
            SELECT v.voter_id, v.voter_data
            FROM voters v
            WHERE updated_last_name REGEXP ?
              AND updated_middle_name REGEXP ?
              AND updated_first_name REGEXP ?
              AND updated_suffix REGEXP ?
            `,
      `${lastNamePattern}`,
      `${middleNamePattern}`,
      `${firstNamePattern}`,
      `${suffixPattern}`
    ) as Array<{ voter_id: string; voter_data: string }>;

    if (voterRows.length === 0) {
      return [];
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

    // Filter out any new registration voters that have been marked invalid.
    const validVoters = Object.fromEntries(
      Object.entries(updatedVoters).filter(
        ([, voter]) =>
          !voter.registrationEvent || !voter.isInvalidatedRegistration
      )
    );

    return sortedByVoterNameAndMatchingPrecinct(
      Object.values(validVoters),
      configuredPrecinctId
    );
  }

  registerVoter(voterRegistration: VoterRegistrationRequest): {
    voter: Voter;
    receiptNumber: number;
  } {
    debug(`Registering voter: ${JSON.stringify(voterRegistration)}`);

    // Get configured precinct for validation
    const { configuredPrecinctId } = this.getPollbookConfigurationInformation();
    assert(
      configuredPrecinctId !== undefined,
      'Can not register voter without configured precinct'
    );
    assert(
      configuredPrecinctId === voterRegistration.precinct,
      'Voter registration precinct does not match configured precinct'
    );

    // Use precinct-aware validation
    const streetInfo = maybeGetStreetInfoForVoterRegistration(
      voterRegistration,
      this.getStreetInfo()
    );

    assert(streetInfo, 'Invalid voter registration');

    const registrationEvent: VoterRegistration = {
      ...voterRegistration,
      party: voterRegistration.party as 'DEM' | 'REP' | 'UND', // this is already validated
      timestamp: new Date(getCurrentTime()).toISOString(),
      voterId: generateId(),
      precinct: streetInfo.precinct,
    };
    const newVoter = createVoterFromRegistrationData(registrationEvent);
    const timestamp = this.incrementClock();
    const receiptNumber = this.getNextEventId();
    this.client.transaction(() => {
      this.saveEvent(
        typedAs<VoterRegistrationEvent>({
          type: EventType.VoterRegistration,
          machineId: this.machineId,
          voterId: newVoter.voterId,
          timestamp,
          receiptNumber,
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

    // Get configured precinct for validation
    const { configuredPrecinctId } = this.getPollbookConfigurationInformation();
    assertDefined(
      configuredPrecinctId,
      'No configured precinct for address change'
    );
    assert(
      configuredPrecinctId === addressChange.precinct,
      'Address change precinct does not match configured precinct'
    );

    const streetInfo = maybeGetStreetInfoForAddressChange(
      addressChange,
      this.getStreetInfo()
    );

    assert(streetInfo, 'Invalid address change');
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

    const timestamp = this.incrementClock();
    const receiptNumber = this.getNextEventId();
    this.client.transaction(() => {
      this.saveEvent(
        typedAs<VoterAddressChangeEvent>({
          type: EventType.VoterAddressChange,
          machineId: this.machineId,
          voterId,
          timestamp,
          receiptNumber,
          addressChangeData,
        })
      );
    });

    return { voter: updatedVoter, receiptNumber };
  }

  changeVoterMailingAddress(
    voterId: string,
    mailingAddressChange: VoterMailingAddressChangeRequest
  ): { voter: Voter; receiptNumber: number } {
    debug(`Changing mailing address for voter ${voterId}`);
    const voter = this.getVoter(voterId);
    assert(voter);

    const mailingAddressChangeData: VoterMailingAddressChange = {
      ...mailingAddressChange,
      timestamp: new Date(getCurrentTime()).toISOString(),
    };
    const updatedVoter: Voter = {
      ...voter,
      mailingAddressChange: mailingAddressChangeData,
    };

    const timestamp = this.incrementClock();
    const receiptNumber = this.getNextEventId();
    this.client.transaction(() => {
      this.saveEvent(
        typedAs<VoterMailingAddressChangeEvent>({
          type: EventType.VoterMailingAddressChange,
          machineId: this.machineId,
          voterId,
          timestamp,
          receiptNumber,
          mailingAddressChangeData,
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

    const timestamp = this.incrementClock();
    const receiptNumber = this.getNextEventId();
    this.client.transaction(() => {
      this.saveEvent(
        typedAs<VoterNameChangeEvent>({
          type: EventType.VoterNameChange,
          machineId: this.machineId,
          voterId,
          timestamp,
          receiptNumber,
          nameChangeData,
        })
      );
    });

    return { voter: updatedVoter, receiptNumber };
  }

  getEventCount(
    eventType: EventType.VoterNameChange | EventType.VoterAddressChange
  ): number {
    const row = this.client.one(
      `
    SELECT COUNT(*) as count
    FROM event_log
    WHERE event_type = ?
    `,
      eventType
    ) as { count: number };
    return row.count;
  }

  markVoterInactive(voterId: string): { voter: Voter; receiptNumber: number } {
    debug(`Marking ${voterId} as inactive`);
    const voter = this.getVoter(voterId);
    assert(voter);

    const updatedVoter: Voter = {
      ...voter,
      isInactive: true,
    };

    const timestamp = this.incrementClock();
    const receiptNumber = this.getNextEventId();
    this.client.transaction(() => {
      this.saveEvent(
        typedAs<VoterInactivatedEvent>({
          type: EventType.MarkInactive,
          machineId: this.machineId,
          voterId,
          timestamp,
          receiptNumber,
        })
      );
    });

    return { voter: updatedVoter, receiptNumber };
  }

  invalidateRegistration(voterId: string): {
    voter: Voter;
    receiptNumber: number;
  } {
    debug(`Invalidating registration for ${voterId}`);
    const voter = this.getVoter(voterId);
    assert(voter);
    assert(voter.registrationEvent, 'Voter must have a registration event');

    const updatedVoter: Voter = {
      ...voter,
      isInvalidatedRegistration: true,
    };

    const timestamp = this.incrementClock();
    const receiptNumber = this.getNextEventId();
    this.client.transaction(() => {
      this.saveEvent(
        typedAs<VoterRegistrationInvalidatedEvent>({
          type: EventType.InvalidateRegistration,
          machineId: this.machineId,
          voterId,
          timestamp,
          receiptNumber,
        })
      );
    });

    return { voter: updatedVoter, receiptNumber };
  }

  getThroughputStatistics(
    throughputInterval: number,
    partyFilter: PartyFilterAbbreviation
  ): ThroughputStat[] {
    if (partyFilter === 'UND') {
      return [];
    }
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

    const filteredCheckInEvents = checkInEvents.filter(
      (e) =>
        // Absentee check-ins are less relevant for throughput stats, which are
        // intended to give a sense of foot traffic throughout the day
        !e.checkInData.isAbsentee &&
        // Events must match the party (if any) specified in filter
        (!partyFilter ||
          partyFilter === 'ALL' ||
          e.checkInData.ballotParty === partyFilter)
    );

    const orderedByEventMachineTime = [...filteredCheckInEvents].sort((a, b) =>
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

  /**
   * Calculates summary statistics for the current general election to populate the statistics screen.
   * Throws an error if called when the current election is a primary election.
   *
   * @param partyFilter - The party to filter voters by. Use 'ALL' to include all parties.
   *   When a specific party is provided, only voters registered with that party are included
   *   in the statistics for total voters and new registrations. For check-in statistics,
   *   ALL check ins are returned irrespective of party since check ins are not associated with a party
   *   in the context of a general election.
   * @returns Summary statistics for the filtered set of voters.
   */
  getGeneralSummaryStatistics(
    partyFilter: PartyFilterAbbreviation
  ): SummaryStatistics {
    const { configuredPrecinctId } = this.getPollbookConfigurationInformation();
    const election = this.getElection();
    assert(election !== undefined);
    assert(election.type !== 'primary');
    const voters =
      configuredPrecinctId === undefined
        ? this.getAllVoters()
        : this.getAllVotersInPrecinct();
    assert(voters);
    const votersMatchingParty =
      partyFilter === 'ALL'
        ? voters
        : Object.fromEntries(
            Object.entries(voters).filter(
              ([, voter]) => voter.party === partyFilter
            )
          );
    const votersWithCheckIn = Object.fromEntries(
      Object.entries(voters).filter(([, voter]) => voter.checkIn)
    );
    const totalVoters = Object.keys(votersMatchingParty).length;
    const totalAbsenteeCheckIns = Object.values(votersWithCheckIn).filter(
      (v) => v.checkIn && v.checkIn.isAbsentee
    ).length;
    const totalNewRegistrations = Object.values(votersMatchingParty).filter(
      (v) => v.registrationEvent !== undefined && !v.isInvalidatedRegistration
    ).length;
    const totalCheckIns = Object.values(votersWithCheckIn).length;

    return {
      totalVoters,
      totalCheckIns,
      totalAbsenteeCheckIns,
      totalNewRegistrations,
    };
  }

  /**
   * Calculates summary statistics for the current primary election to populate the statistics screen.
   * Throws an error if called when the current election is a general election.
   *
   * @param partyFilter - The party to filter voters by. Use 'ALL' to include all parties.
   *   When a specific party is provided, only voters registered with that party are included
   *   in the statistics for total voters and new registrations. Only check-ins with a ballot party matching the
   *   provided filter are counted for total check ins and total absentee check ins. That includes check ins from a
   *   voter matching the party filter and undeclared voters who checked in with a ballot party matching the filter.
   *   When the partyFilter is 'UND' the number of undeclared voters who checked in with a democratic or republican ballot
   *   party is returned in totalUndeclaredDemCheckIns and totalUndeclaredRepCheckIns respectively.
   * @returns Summary statistics for the filtered set of voters.
   */
  getPrimarySummaryStatistics(
    partyFilter: PartyFilterAbbreviation
  ): PrimarySummaryStatistics {
    const { configuredPrecinctId } = this.getPollbookConfigurationInformation();
    const election = this.getElection();
    assert(election !== undefined);
    assert(election.type === 'primary');
    const voters =
      configuredPrecinctId === undefined
        ? this.getAllVoters()
        : this.getAllVotersInPrecinct();
    assert(voters);
    const votersMatchingParty =
      partyFilter === 'ALL'
        ? voters
        : Object.fromEntries(
            Object.entries(voters).filter(
              ([, voter]) => voter.party === partyFilter
            )
          );
    const undeclaredDemVoters = Object.values(voters).filter(
      (voter) =>
        voter.party === 'UND' &&
        voter.checkIn &&
        voter.checkIn.ballotParty === 'DEM'
    ).length;
    const undeclaredRepVoters = Object.values(voters).filter(
      (voter) =>
        voter.party === 'UND' &&
        voter.checkIn &&
        voter.checkIn.ballotParty === 'REP'
    ).length;
    // We have to consider ALL voters here as undeclared party voters may check in with a party
    const votersWithCheckInMatchingParty = Object.fromEntries(
      Object.entries(voters).filter(
        ([, voter]) =>
          voter.checkIn &&
          (partyFilter === 'ALL' || voter.checkIn.ballotParty === partyFilter)
      )
    );
    const totalVoters = Object.keys(votersMatchingParty).length;
    const totalAbsenteeCheckIns = Object.values(
      votersWithCheckInMatchingParty
    ).filter((v) => v.checkIn && v.checkIn.isAbsentee).length;
    const totalNewRegistrations = Object.values(votersMatchingParty).filter(
      (v) => v.registrationEvent !== undefined && !v.isInvalidatedRegistration
    ).length;
    const totalCheckIns = Object.values(votersWithCheckInMatchingParty).length;

    return {
      totalVoters,
      totalCheckIns,
      totalAbsenteeCheckIns,
      totalNewRegistrations,
      totalUndeclaredDemCheckIns: undeclaredDemVoters,
      totalUndeclaredRepCheckIns: undeclaredRepVoters,
    };
  }

  getPollbookServiceInfo(): PollbookServiceInfo[] {
    const rows = this.client.all(
      `
      SELECT machine_id, status, last_seen, pollbook_information
      FROM machines
      WHERE machine_id != ?
      `,
      this.machineId
    ) as Array<{
      machine_id: string;
      status: string;
      last_seen: number;
      pollbook_information: string;
    }>;

    return rows.map((row) => {
      const pollbookInfo = safeParseJson(
        row.pollbook_information,
        PollbookInformationSchema
      ).unsafeUnwrap();
      return {
        machineId: row.machine_id,
        status: row.status as PollbookConnectionStatus,
        lastSeen: new Date(row.last_seen),
        numCheckIns: this.getCheckInCount(row.machine_id),
        electionBallotHash: pollbookInfo.electionBallotHash,
        pollbookPackageHash: pollbookInfo.pollbookPackageHash,
        electionId: pollbookInfo.electionId,
        electionTitle: pollbookInfo.electionTitle,
        codeVersion: pollbookInfo.codeVersion,
      };
    });
  }
}
