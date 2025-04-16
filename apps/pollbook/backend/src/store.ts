import { Client as DbClient } from '@votingworks/db';
// import { Iso8601Timestamp } from '@votingworks/types';
import { join } from 'node:path';
import { throwIllegalValue } from '@votingworks/basics';
import {
  Election,
  safeParseElection,
  safeParseInt,
  safeParseJson,
} from '@votingworks/types';
import { customAlphabet } from 'nanoid';
import { rootDebug } from './debug';
import {
  PollbookEvent,
  EventDbRow,
  EventType,
  ValidStreetInfo,
  ValidStreetInfoSchema,
  Voter,
  VoterAddressChangeRequest,
  VoterRegistrationRequest,
  VoterNameChangeRequest,
} from './types';
import { HlcTimestamp, HybridLogicalClock } from './hybrid_logical_clock';
import {
  convertDbRowsToPollbookEvents,
  createVoterFromRegistrationData,
} from './event_helpers';
import {
  getUpdatedVoterFirstName,
  getUpdatedVoterLastName,
} from './voter_helpers';

const debug = rootDebug.extend('store');

export const SchemaPath = join(__dirname, '../schema.sql');

const idGenerator = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

/**
 * Generates a URL-friendly and double-click-copy-friendly unique ID using a
 * cryptographically secure RNG.
 */
export function generateId(): string {
  return idGenerator();
}

export function sortedByVoterName(
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

export abstract class Store {
  protected election?: Election;
  protected validStreetInfo?: ValidStreetInfo[];
  protected currentClock?: HybridLogicalClock;

  protected constructor(
    protected readonly client: DbClient,
    protected readonly machineId: string
  ) {}

  protected incrementClock(): HlcTimestamp {
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

  // Reprocess all events starting from the given HLC timestamp. If no timestamp is given, reprocess all events.
  // Events are idempotent so this function can be called multiple times without side effects. The in memory voters
  // does not need to be cleared when reprocessing.
  protected getAllEventsOrderedSince(
    timestamp?: HlcTimestamp
  ): PollbookEvent[] {
    debug('Reprocessing event log from timestamp %o', timestamp);
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

    return convertDbRowsToPollbookEvents(rows);
  }

  getMachineId(): string {
    return this.machineId;
  }

  getIsOnline(): boolean {
    // TODO-CARO-IMPLEMENT
    return true;
  }

  getDbPath(): string {
    return this.client.getDatabasePath();
  }

  saveEvent(pollbookEvent: PollbookEvent): boolean {
    try {
      debug('Saving event %o', pollbookEvent);
      this.mergeLocalClockWithRemote(pollbookEvent.timestamp);

      const eventData = (() => {
        switch (pollbookEvent.type) {
          case EventType.VoterCheckIn:
            this.client.run(
              `
              INSERT INTO check_in_status (voter_id, machine_id, is_checked_in)
              VALUES (?, ?, 1)
              ON CONFLICT(voter_id) DO UPDATE SET 
              machine_id = ?,
              is_checked_in = 1
              `,
              pollbookEvent.voterId,
              pollbookEvent.machineId,
              pollbookEvent.machineId
            );
            return pollbookEvent.checkInData;
          case EventType.UndoVoterCheckIn:
            this.client.run(
              `
              UPDATE check_in_status
              SET is_checked_in = 0, machine_id = NULL
              WHERE voter_id = ?
              `,
              pollbookEvent.voterId
            );
            return {};
          case EventType.VoterAddressChange:
            return pollbookEvent.addressChangeData;
          case EventType.VoterNameChange: {
            this.client.run(
              `
              UPDATE voters
              SET updated_first_name = ?, updated_last_name = ?
              WHERE voter_id = ?
              `,
              pollbookEvent.nameChangeData.firstName.toUpperCase(),
              pollbookEvent.nameChangeData.lastName.toUpperCase(),
              pollbookEvent.voterId
            );
            return pollbookEvent.nameChangeData;
          }
          case EventType.VoterRegistration: {
            const voter = createVoterFromRegistrationData(
              pollbookEvent.registrationData
            );
            this.client.run(
              `
              INSERT INTO voters (
                voter_id,
                original_first_name,
                original_last_name,
                updated_first_name,
                updated_last_name,
                voter_data
              ) VALUES (?, ?, ?, ?, ?, ?)
              `,
              voter.voterId,
              voter.firstName.toUpperCase(),
              voter.lastName.toUpperCase(),
              getUpdatedVoterFirstName(voter).toUpperCase(),
              getUpdatedVoterLastName(voter).toUpperCase(),
              JSON.stringify(voter)
            );
            return pollbookEvent.registrationData;
          }
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
      const election: Election = safeParseElection(
        row.election_data
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
              original_first_name,
              original_last_name,
              updated_first_name,
              updated_last_name,
              voter_data
            ) values (
              ?, ?, ?, ?, ?, ?
            )
          `,
          voter.voterId,
          voter.firstName.toUpperCase(),
          voter.lastName.toUpperCase(),
          getUpdatedVoterFirstName(voter).toUpperCase(),
          getUpdatedVoterLastName(voter).toUpperCase(),
          JSON.stringify(voter)
        );
      }
    });
  }

  getCurrentClockTime(): HlcTimestamp {
    if (!this.currentClock) {
      this.currentClock = new HybridLogicalClock(this.machineId);
    }
    return this.currentClock.now();
  }

  // Returns the valid street info. Used when registering a voter to populate address typeahead options.
  // TODO the frontend doesn't need to know everything in the ValidStreetInfo object. This could be paired down.
  getStreetInfo(): ValidStreetInfo[] {
    return this.validStreetInfo || [];
  }

  // TODO-CARO move to a helper
  protected getStreetInfoForVoterAddress(
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

  // TODO-CARO move to a helper
  protected isVoterRegistrationValid(
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

  // TODO-CARO move to a helper
  protected isVoterAddressChangeValid(
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

  // TODO-CARO move to a helper
  protected isVoterNameChangeValid(
    nameChange: VoterNameChangeRequest
  ): boolean {
    return nameChange.firstName.length > 0 && nameChange.lastName.length > 0;
  }

  getCheckInCount(machineId?: string): number {
    const query = machineId
      ? `
        SELECT COUNT(*) as checkInCount
        FROM check_in_status
        WHERE is_checked_in = 1 AND machine_id = ?
      `
      : `
        SELECT COUNT(*) as checkInCount
        FROM check_in_status
        WHERE is_checked_in = 1
      `;
    const row = machineId
      ? (this.client.one(query, machineId) as { checkInCount: number })
      : (this.client.one(query) as { checkInCount: number });
    return row ? row.checkInCount : 0;
  }
}
