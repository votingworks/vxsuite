import { Client as DbClient } from '@votingworks/db';
// import { Iso8601Timestamp } from '@votingworks/types';
import { join } from 'node:path';
import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  Election,
  ElectionDefinition,
  safeParseElection,
  safeParseJson,
  ValidStreetInfo,
  ValidStreetInfoSchema,
  Voter,
  VoterSchema,
} from '@votingworks/types';
import { customAlphabet } from 'nanoid';
import { BaseLogger, LogEventId } from '@votingworks/logging';
import { rootDebug } from './debug';
import {
  PollbookEvent,
  EventDbRow,
  EventType,
  PollbookConnectionStatus,
  PollbookConfigurationInformation,
  ConfigurationError,
  ConfigurationStatus,
  Anomaly,
  AnomalyDbRow,
  AnomalyType,
  AnomalyDetails,
  DuplicateCheckInDetails,
} from './types';
import { HlcTimestamp, HybridLogicalClock } from './hybrid_logical_clock';
import {
  applyPollbookEventsToVoters,
  convertDbRowsToPollbookEvents,
  createVoterFromRegistrationData,
} from './event_helpers';
import {
  getUpdatedVoterFirstName,
  getUpdatedVoterLastName,
  getUpdatedVoterMiddleName,
  getUpdatedVoterSuffix,
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

export function sortedByVoterNameAndMatchingPrecinct(
  voters: Voter[],
  configuredPrecinctId?: string,
  { useOriginalName = false } = {}
): Voter[] {
  if (!configuredPrecinctId) {
    return sortedByVoterName(voters, { useOriginalName });
  }
  const matching = voters.filter(
    (v) =>
      (v.addressChange ? v.addressChange.precinct : v.precinct) ===
      configuredPrecinctId
  );
  const nonMatching = voters.filter(
    (v) =>
      (v.addressChange ? v.addressChange.precinct : v.precinct) !==
      configuredPrecinctId
  );
  return [
    ...sortedByVoterName(matching, { useOriginalName }),
    ...sortedByVoterName(nonMatching, { useOriginalName }),
  ];
}

export abstract class Store {
  protected election?: Election;
  protected validStreetInfo?: ValidStreetInfo[];
  protected currentClock?: HybridLogicalClock;

  protected constructor(
    protected readonly client: DbClient,
    protected readonly machineId: string,
    protected readonly codeVersion: string,
    protected readonly logger: BaseLogger
  ) {}

  protected incrementClock(): HlcTimestamp {
    if (!this.currentClock) {
      this.currentClock = new HybridLogicalClock(this.machineId);
    }
    const mostRecentSeenTime = this.getMostRecentlySavedEventTimestamp();
    if (mostRecentSeenTime) {
      return this.currentClock.update(mostRecentSeenTime);
    }
    return this.currentClock.tick();
  }

  private mergeLocalClockWithRemote(remoteClock: HlcTimestamp): HlcTimestamp {
    if (!this.currentClock) {
      this.currentClock = new HybridLogicalClock(this.machineId);
    }
    return this.currentClock.update(remoteClock);
  }

  // Retrieve all events starting from the given HLC timestamp. If no timestamp is given, retrieve all events.
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
    const row = this.client.one(
      `
        SELECT status
        FROM machines
        WHERE machine_id = ?
      `,
      this.machineId
    ) as { status: PollbookConnectionStatus } | undefined;

    return (
      row !== undefined && row.status === PollbookConnectionStatus.Connected
    );
  }

  getDbPath(): string {
    return this.client.getDatabasePath();
  }

  getMostRecentlySavedEventTimestamp(): HlcTimestamp | undefined {
    const rows = this.client.all(
      `
        SELECT physical_time, logical_counter, machine_id
        FROM event_log
        ORDER BY physical_time DESC, logical_counter DESC, machine_id DESC
        LIMIT 1
      `
    ) as Array<{
      physical_time: number;
      logical_counter: number;
      machine_id: string;
    }>;
    if (rows.length === 0) {
      return undefined;
    }

    assert(rows.length === 1, 'No events found in the event log.');
    const {
      physical_time: physical,
      logical_counter: logical,
      machine_id: machineId,
    } = rows[0];

    return {
      physical,
      logical,
      machineId,
    };
  }

  getVoter(voterId: string): Voter {
    const { voter } = this.getVoterWithAllEvents(voterId);
    return voter;
  }

  getVoterWithAllEvents(voterId: string): {
    voter: Voter;
    orderedEvents: PollbookEvent[];
  } {
    const voterRows = this.client.all(
      `
              SELECT v.voter_data
              FROM voters v
              WHERE voter_id = ?
              `,
      voterId
    ) as Array<{ voter_data: string }>;

    assert(voterRows.length === 1, `Voter with ID ${voterId} not found.`);

    const voter = safeParseJson(
      voterRows[0].voter_data,
      VoterSchema
    ).unsafeUnwrap();

    const eventRows = this.client.all(
      `
              SELECT *
              FROM event_log
              WHERE voter_id = ?
              ORDER BY physical_time, logical_counter, machine_id
              `,
      voterId
    ) as EventDbRow[];

    const events = convertDbRowsToPollbookEvents(eventRows);
    const updatedVoters = applyPollbookEventsToVoters(
      { [voterId]: voter },
      events
    );

    return {
      voter: updatedVoters[voterId],
      orderedEvents: events,
    };
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
          case EventType.MarkInactive:
            return {};
          case EventType.VoterAddressChange:
            return pollbookEvent.addressChangeData;
          case EventType.VoterMailingAddressChange:
            return pollbookEvent.mailingAddressChangeData;
          case EventType.VoterNameChange:
            return pollbookEvent.nameChangeData;
          case EventType.VoterRegistration: {
            const voter = createVoterFromRegistrationData(
              pollbookEvent.registrationData
            );
            this.client.run(
              `
              INSERT INTO voters (
                voter_id,
                original_first_name,
                original_middle_name,
                original_last_name,
                original_suffix,
                updated_first_name,
                updated_middle_name,
                updated_last_name,
                updated_suffix,
                voter_data
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `,
              voter.voterId,
              voter.firstName.toUpperCase(),
              voter.middleName.toUpperCase(),
              voter.lastName.toUpperCase(),
              voter.suffix.toUpperCase(),
              getUpdatedVoterFirstName(voter).toUpperCase(),
              getUpdatedVoterMiddleName(voter).toUpperCase(),
              getUpdatedVoterLastName(voter).toUpperCase(),
              getUpdatedVoterSuffix(voter).toUpperCase(),
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
          event_type,
          physical_time,
          logical_counter,
          event_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        pollbookEvent.receiptNumber,
        pollbookEvent.machineId,
        pollbookEvent.voterId,
        pollbookEvent.type,
        pollbookEvent.timestamp.physical,
        pollbookEvent.timestamp.logical,
        JSON.stringify(eventData)
      );

      // Update any materialized views necessary for the given event. Refetching the voter ensures
      // that the event is handled in proper order by hlc timestamp with other events.
      switch (pollbookEvent.type) {
        // MarkInactive is included here as it can theoretically cause an "undo" of a check in a rare syncing race condition.
        case EventType.MarkInactive:
        case EventType.UndoVoterCheckIn:
        case EventType.VoterCheckIn: {
          // If we are saving a check in or undo update the materialized check_in_status table.
          const { voter, orderedEvents } = this.getVoterWithAllEvents(
            pollbookEvent.voterId
          );

          // If we are saving a check in event, we want to ensure that there is only one check in event for the voter.
          // Check if we have multiple events and log a warning if so.
          if (pollbookEvent.type === EventType.VoterCheckIn) {
            // Find the index of the last UndoVoterCheckIn event
            const lastUndoIndex = orderedEvents.findLastIndex(
              (e) => e.type === EventType.UndoVoterCheckIn
            );
            // Only keep check-in events after the last undo
            const checkInEventsNotUndone =
              lastUndoIndex === -1
                ? orderedEvents.filter((e) => e.type === EventType.VoterCheckIn)
                : orderedEvents
                    .slice(lastUndoIndex + 1)
                    .filter((e) => e.type === EventType.VoterCheckIn);

            // Check if there is more than one check-in event detected for the same voter, log a warning
            if (checkInEventsNotUndone.length > 1) {
              const message = `Multiple check-in events detected for voter ${
                pollbookEvent.voterId
              }. Check in times by machine: ${checkInEventsNotUndone
                .map(
                  (e) =>
                    `${e.machineId} : ${new Date(
                      e.timestamp.physical
                    ).toISOString()}`
                )
                .join(', ')}`;

              this.logger.log(
                LogEventId.PollbookDuplicateCheckInDetected,
                'system',
                {
                  message,
                  voterId: pollbookEvent.voterId,
                  disposition: 'failure',
                }
              );

              // Record the anomaly in the database
              const duplicateCheckInDetails: DuplicateCheckInDetails = {
                voterId: pollbookEvent.voterId,
                checkInEvents: checkInEventsNotUndone.map((e) => ({
                  machineId: e.machineId,
                  timestamp: new Date(e.timestamp.physical).toISOString(),
                })),
                message,
              };
              this.recordAnomaly(
                'DuplicateCheckIn',
                duplicateCheckInDetails,
                pollbookEvent.voterId
              );
            }
          }
          this.client.run(
            `
            INSERT INTO check_in_status (voter_id, machine_id, is_checked_in)
            VALUES (?, ?, ?)
            ON CONFLICT(voter_id) DO UPDATE SET 
            is_checked_in = EXCLUDED.is_checked_in,
            machine_id = EXCLUDED.machine_id
            `,
            pollbookEvent.voterId,
            voter.checkIn ? voter.checkIn.machineId : null,
            voter.checkIn ? '1' : '0'
          );
          break;
        }
        case EventType.VoterAddressChange:
        case EventType.VoterMailingAddressChange:
        case EventType.VoterRegistration:
          // do nothing
          break;
        case EventType.VoterNameChange: {
          const voter = this.getVoter(pollbookEvent.voterId);
          if (voter.nameChange) {
            this.client.run(
              `
                UPDATE voters
                SET updated_first_name = ?, updated_middle_name = ?, updated_last_name = ?, updated_suffix = ?
                WHERE voter_id = ?
                `,
              voter.nameChange.firstName.toUpperCase(),
              voter.nameChange.middleName.toUpperCase(),
              voter.nameChange.lastName.toUpperCase(),
              voter.nameChange.suffix.toUpperCase(),
              pollbookEvent.voterId
            );
          }
          break;
        }
        default:
          throwIllegalValue(pollbookEvent, 'type');
      }
      return true;
    } catch (error) {
      debug('Failed to save event: %s', error);
      return false;
    }
  }

  getElection(): Election | undefined {
    const row = this.client.one(
      `
          select election_data 
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

    return this.election;
  }

  hasEvents(): boolean {
    const row = this.client.one(
      'SELECT EXISTS(SELECT 1 FROM event_log LIMIT 1) as hasEvents'
    ) as { hasEvents: number };
    return row.hasEvents > 0;
  }

  getPollbookConfigurationInformation(): PollbookConfigurationInformation {
    const row = this.client.one(
      `
          select election_data, ballot_hash, package_hash, configured_precinct_id
          from elections
          order by rowid desc
          limit 1
        `
    ) as {
      election_data: string;
      ballot_hash: string;
      package_hash: string;
      configured_precinct_id: string;
    };
    if (!row) {
      return {
        machineId: this.machineId,
        codeVersion: this.codeVersion,
      };
    }
    const election: Election = safeParseElection(
      row.election_data
    ).unsafeUnwrap();
    return {
      electionId: election.id,
      electionTitle: election.title,
      electionBallotHash: row.ballot_hash,
      pollbookPackageHash: row.package_hash,
      machineId: this.machineId,
      codeVersion: this.codeVersion,
      configuredPrecinctId: row.configured_precinct_id
        ? row.configured_precinct_id
        : undefined,
    };
  }

  setElectionAndVoters(
    electionDefinition: ElectionDefinition,
    packageHash: string,
    validStreets: ValidStreetInfo[],
    voters: Voter[]
  ): undefined | ConfigurationError {
    this.election = electionDefinition.election;
    this.validStreetInfo = validStreets;
    try {
      this.client.transaction(() => {
        this.client.run(
          `
            insert into elections (
              election_id,
              election_data,
              ballot_hash,
              package_hash,
              valid_street_data,
              is_absentee_mode
            ) values (
              ?, ?, ?, ?, ?, 0
            )
          `,
          electionDefinition.election.id,
          JSON.stringify(electionDefinition.election),
          electionDefinition.ballotHash,
          packageHash,
          JSON.stringify(validStreets)
        );
        for (const voter of voters) {
          this.client.run(
            `
              insert into voters (
                voter_id,
                original_first_name,
                original_middle_name,
                original_last_name,
                original_suffix,
                updated_first_name,
                updated_middle_name,
                updated_last_name,
                updated_suffix,
                voter_data
              ) values (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
              )
            `,
            voter.voterId,
            voter.firstName.toUpperCase(),
            voter.middleName.toUpperCase(),
            voter.lastName.toUpperCase(),
            voter.suffix.toUpperCase(),
            getUpdatedVoterFirstName(voter).toUpperCase(),
            getUpdatedVoterMiddleName(voter).toUpperCase(),
            getUpdatedVoterLastName(voter).toUpperCase(),
            getUpdatedVoterSuffix(voter).toUpperCase(),
            JSON.stringify(voter)
          );
        }
        if (electionDefinition.election.precincts.length === 1) {
          this.client.run(
            `
              update elections
              set configured_precinct_id = ?
            `,
            electionDefinition.election.precincts[0].id
          );
        }
      });
      this.logger.log(LogEventId.PollbookConfigurationStatus, 'system', {
        message: 'Election and voters set successfully',
        electionId: electionDefinition.election.id,
        pollbookPackageHash: packageHash,
        disposition: 'success',
      });
    } catch (error) {
      debug('Failed to set election and voters: %s', error);

      if (
        error instanceof Error &&
        error.message.includes('UNIQUE constraint failed')
      ) {
        return 'already-configured';
      }
      throw error;
    }
  }

  setConfiguredPrecinct(precinctId: string): void {
    const election = this.getElection();
    assert(election !== undefined);
    this.client.transaction(() => {
      // Check that there are no events
      const eventCount = this.client.one(
        `
        SELECT COUNT(*) as count
        FROM event_log
      `
      ) as { count: number };
      if (eventCount.count !== 0) {
        throw new Error('Can not change precinct when there are events.');
      }

      assert(
        election.precincts.some((precinct) => precinct.id === precinctId),
        `Precinct with id ${precinctId} does not exist in the election`
      );
      this.client.run(
        `
          update elections
          set configured_precinct_id = ?
          `,
        precinctId
      );
    });
  }

  // Returns the valid street info. Used when registering a voter to populate address typeahead options.
  // TODO the frontend doesn't need to know everything in the ValidStreetInfo object. This could be pared down.
  getStreetInfo(): ValidStreetInfo[] {
    if (this.validStreetInfo) {
      return this.validStreetInfo;
    }
    const row = this.client.one(
      `
          select valid_street_data 
          from elections
          order by rowid desc
          limit 1
        `
    ) as { election_data: string; valid_street_data: string };
    if (!row) {
      return [];
    }

    const validStreetInfo: ValidStreetInfo[] = safeParseJson(
      row.valid_street_data,
      ValidStreetInfoSchema
    ).unsafeUnwrap();
    this.validStreetInfo = validStreetInfo;
    return this.validStreetInfo || [];
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

  getConfigurationStatus(): ConfigurationStatus | undefined {
    const row = this.client.one(
      `
        SELECT configuration_status as configurationStatus
        FROM config_data
      `
    ) as { configurationStatus: string } | undefined;
    if (row) {
      return row.configurationStatus as ConfigurationStatus;
    }
    return undefined;
  }

  setConfigurationStatus(status?: ConfigurationStatus): void {
    const previousStatus = this.getConfigurationStatus();
    if ((status ?? null) !== previousStatus) {
      this.logger.log(LogEventId.PollbookConfigurationStatus, 'system', {
        message: 'Configuration Status Update',
        previousStatus,
        newStatus: status,
      });
    }

    this.client.run(
      `
      UPDATE config_data
      SET configuration_status = ?
      `,
      status ?? null
    );
  }

  getMostRecentEventIdPerMachine(): Record<string, number> {
    const rows = this.client.all(
      `SELECT machine_id, max(event_id) as max_event_id FROM event_log GROUP BY machine_id`
    ) as Array<{ machine_id: string; max_event_id: number }>;
    const lastEventSyncedPerNode: Record<string, number> = {};
    for (const row of rows) {
      lastEventSyncedPerNode[row.machine_id] = row.max_event_id;
    }
    return lastEventSyncedPerNode;
  }

  // Anomaly management methods
  recordAnomaly(
    anomalyType: AnomalyType,
    anomalyDetails: AnomalyDetails,
    voterId?: string
  ): void {
    const detectedAt = Date.now();
    this.client.run(
      `
      INSERT INTO anomalies (
        anomaly_type,
        detected_at,
        voter_id,
        anomaly_details,
        dismissed
      ) VALUES (?, ?, ?, ?, 0)
      `,
      anomalyType,
      detectedAt,
      voterId ?? null,
      JSON.stringify(anomalyDetails)
    );
  }

  getActiveAnomalies(): Anomaly[] {
    const rows = this.client.all(
      `
      SELECT *
      FROM anomalies
      WHERE dismissed = 0
      ORDER BY detected_at DESC
      `
    ) as AnomalyDbRow[];

    return rows.map((row) => ({
      anomalyId: row.anomaly_id,
      anomalyType: row.anomaly_type,
      detectedAt: new Date(row.detected_at),
      voterId: row.voter_id,
      anomalyDetails: JSON.parse(row.anomaly_details) as AnomalyDetails,
      dismissedAt: row.dismissed_at ? new Date(row.dismissed_at) : undefined,
      dismissed: row.dismissed === 1,
    }));
  }

  dismissAnomaly(anomalyId: number): void {
    const dismissedAt = Date.now();
    this.client.run(
      `
      UPDATE anomalies
      SET dismissed = 1, dismissed_at = ?
      WHERE anomaly_id = ?
      `,
      dismissedAt,
      anomalyId
    );
  }
}
