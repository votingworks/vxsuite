//
// The durable datastore for election data, CVRs, and adjudication info.
//

import {
  Optional,
  Result,
  err,
  ok,
  typedAs,
  isResult,
  assertDefined,
  assert,
} from '@votingworks/basics';
import { Bindable, Client as DbClient } from '@votingworks/db';
import {
  BallotId,
  BallotPageLayout,
  BallotPageLayoutSchema,
  CastVoteRecord,
  ContestId,
  ContestOptionId,
  CVR,
  Election,
  ElectionDefinition,
  Id,
  Iso8601Timestamp,
  safeParse,
  safeParseElectionDefinition,
  safeParseJson,
  Side,
  SystemSettings,
  SystemSettingsDbRow,
  Tabulation,
} from '@votingworks/types';
import { join } from 'path';
import { Buffer } from 'buffer';
import { v4 as uuid } from 'uuid';
import {
  OfficialCandidateNameLookup,
  getBallotStyleIdPartyIdLookup,
  getOfficialCandidateNameLookup,
} from '@votingworks/utils';
import {
  CastVoteRecordFileEntryRecord,
  CastVoteRecordFileRecord,
  CastVoteRecordFileRecordSchema,
  CvrFileMode,
  DatabaseSerializedCastVoteRecordVotes,
  DatabaseSerializedCastVoteRecordVotesSchema,
  ElectionRecord,
  ManualResultsIdentifier,
  ManualResultsMetadataRecord,
  ManualResultsRecord,
  ScannerBatch,
  CastVoteRecordStoreFilter,
  WriteInAdjudicationAction,
  WriteInAdjudicationStatus,
  WriteInCandidateRecord,
  WriteInRecord,
  WriteInRecordAdjudicatedInvalid,
  WriteInRecordAdjudicatedOfficialCandidate,
  WriteInRecordAdjudicatedWriteInCandidate,
  WriteInRecordPending,
  WriteInTally,
  WriteInAdjudicatedInvalidTally,
  WriteInAdjudicatedOfficialCandidateTally,
  WriteInAdjudicatedWriteInCandidateTally,
  WriteInPendingTally,
  ManualResultsStoreFilter,
} from './types';
import { cvrBallotTypeToLegacyBallotType } from './util/cvrs';
import { replacePartyIdFilter } from './tabulation/utils';

/**
 * Path to the store's schema file, i.e. the file that defines the database.
 */
const SchemaPath = join(__dirname, '../schema.sql');

function convertSqliteTimestampToIso8601(
  sqliteTimestamp: string
): Iso8601Timestamp {
  return new Date(sqliteTimestamp).toISOString();
}

function asQueryPlaceholders(list: unknown[]): string {
  const questionMarks = list.map(() => '?');
  return `(${questionMarks.join(', ')})`;
}

interface WriteInTallyRow {
  contestId: ContestId;
  isInvalid: boolean;
  officialCandidateId: string | null;
  writeInCandidateId: string | null;
  writeInCandidateName: string | null;
  tally: number;
}

/**
 * Manages a data store for imported election data, cast vote records, and
 * transcribed and adjudicated write-ins.
 */
export class Store {
  private constructor(private readonly client: DbClient) {}

  getDbPath(): string {
    return this.client.getDatabasePath();
  }

  /**
   * Builds and returns a new store whose data is kept in memory.
   */
  static memoryStore(): Store {
    return new Store(DbClient.memoryClient(SchemaPath));
  }

  /**
   * Builds and returns a new store at `dbPath`.
   */
  static fileStore(dbPath: string): Store {
    return new Store(DbClient.fileClient(dbPath, SchemaPath));
  }

  /**
   * Runs the given function in a transaction. If the function throws an error,
   * the transaction is rolled back. Otherwise, the transaction is committed.
   *
   * If the function returns a `Result` type, the transaction will only be be
   * rolled back if the returned `Result` is an error.
   *
   * Returns the result of the function.
   */
  withTransaction<T>(fn: () => Promise<T>): Promise<T>;
  withTransaction<T>(fn: () => T): T {
    return this.client.transaction(fn, (result: T) => {
      if (isResult(result)) {
        return result.isOk();
      }

      return true;
    });
  }

  /**
   * Creates an election record and returns its ID.
   */
  addElection(electionData: string): Id {
    const id = uuid();
    this.client.run(
      'insert into elections (id, data) values (?, ?)',
      id,
      electionData
    );
    return id;
  }

  /**
   * Gets all election records.
   */
  getElections(): ElectionRecord[] {
    return (
      this.client.all(`
      select
        id,
        data as electionData,
        datetime(created_at, 'localtime') as createdAt,
        is_official_results as isOfficialResults
      from elections
      where deleted_at is null
    `) as Array<{
        id: Id;
        electionData: string;
        createdAt: string;
        isOfficialResults: 0 | 1;
      }>
    ).map((r) => ({
      id: r.id,
      electionDefinition: safeParseElectionDefinition(
        r.electionData
      ).unsafeUnwrap(),
      createdAt: convertSqliteTimestampToIso8601(r.createdAt),
      isOfficialResults: r.isOfficialResults === 1,
    }));
  }

  /**
   * Gets a specific election record.
   */
  getElection(electionId: string): ElectionRecord | undefined {
    const result = this.client.one(
      `
      select
        id,
        data as electionData,
        datetime(created_at, 'localtime') as createdAt,
        is_official_results as isOfficialResults
      from elections
      where deleted_at is null AND id = ?
    `,
      electionId
    ) as
      | {
          id: Id;
          electionData: string;
          createdAt: string;
          isOfficialResults: 0 | 1;
        }
      | undefined;
    if (!result) {
      return undefined;
    }
    return {
      id: result.id,
      electionDefinition: safeParseElectionDefinition(
        result.electionData
      ).unsafeUnwrap(),
      createdAt: convertSqliteTimestampToIso8601(result.createdAt),
      isOfficialResults: result.isOfficialResults === 1,
    };
  }

  /**
   * Deletes an election record.
   */
  deleteElection(id: Id): void {
    this.client.run(
      'update elections set deleted_at = current_timestamp where id = ?',
      id
    );
  }

  /**
   * Asserts that an election with the given ID exists and is not deleted.
   */
  assertElectionExists(electionId: Id): void {
    const election = this.client.one(
      `
        select id from elections
        where id = ? and deleted_at is null
      `,
      electionId
    ) as { id: Id } | undefined;

    if (!election) {
      throw new Error(`Election not found: ${electionId}`);
    }
  }

  /**
   * Sets the id for the current election
   */
  setCurrentElectionId(currentElectionId?: Id): void {
    if (currentElectionId) {
      this.client.run(
        'update settings set current_election_id = ?',
        currentElectionId
      );
    } else {
      this.client.run('update settings set current_election_id = NULL');
    }
  }

  /**
   * Gets the id for the current election
   */
  getCurrentElectionId(): Optional<Id> {
    const settings = this.client.one(
      `
      select current_election_id as currentElectionId from settings
    `
    ) as { currentElectionId: Id } | null;

    return settings?.currentElectionId ?? undefined;
  }

  /**
   * Returns the current election definition or throws an error if it does
   * not exist.
   */
  getCurrentElectionDefinitionOrThrow(): ElectionDefinition {
    return assertDefined(
      this.getElection(assertDefined(this.getCurrentElectionId()))
    ).electionDefinition;
  }

  /**
   * Creates a system settings record and returns its ID.
   * Note `system_settings` are logical settings that span other machines eg. VxScan.
   * `settings` are local to VxAdmin
   */
  saveSystemSettings(systemSettings: SystemSettings): void {
    this.client.run('delete from system_settings');
    this.client.run(
      `
      insert into system_settings (
        are_poll_worker_card_pins_enabled,
        inactive_session_time_limit_minutes,
        num_incorrect_pin_attempts_allowed_before_card_lockout,
        overall_session_time_limit_hours,
        starting_card_lockout_duration_seconds
      ) values (
        ?, ?, ?, ?, ?
      )
      `,
      systemSettings.arePollWorkerCardPinsEnabled ? 1 : 0,
      systemSettings.inactiveSessionTimeLimitMinutes,
      systemSettings.numIncorrectPinAttemptsAllowedBeforeCardLockout,
      systemSettings.overallSessionTimeLimitHours,
      systemSettings.startingCardLockoutDurationSeconds
    );
  }

  /**
   * Gets a specific system settings record.
   */
  getSystemSettings(): SystemSettings | undefined {
    const result = this.client.one(
      `
      select
        are_poll_worker_card_pins_enabled as arePollWorkerCardPinsEnabled,
        inactive_session_time_limit_minutes as inactiveSessionTimeLimitMinutes,
        num_incorrect_pin_attempts_allowed_before_card_lockout as numIncorrectPinAttemptsAllowedBeforeCardLockout,
        overall_session_time_limit_hours as overallSessionTimeLimitHours,
        starting_card_lockout_duration_seconds as startingCardLockoutDurationSeconds
      from system_settings
      `
    ) as SystemSettingsDbRow | undefined;

    if (!result) {
      return undefined;
    }
    return {
      ...result,
      arePollWorkerCardPinsEnabled: result.arePollWorkerCardPinsEnabled === 1,
    };
  }

  getCastVoteRecordFileByHash(
    electionId: Id,
    sha256Hash: string
  ): Optional<Id> {
    return (
      this.client.one(
        `
        select id
        from cvr_files
        where election_id = ?
          and sha256_hash = ?
      `,
        electionId,
        sha256Hash
      ) as { id: Id } | undefined
    )?.id;
  }

  getCastVoteRecordCountByFileId(fileId: Id): number {
    return (
      this.client.one(
        `
          select count(cvr_id) as alreadyPresent
          from cvr_file_entries
          where cvr_file_id = ?
        `,
        fileId
      ) as { alreadyPresent: number }
    ).alreadyPresent;
  }

  addCastVoteRecordFileRecord({
    id,
    electionId,
    isTestMode,
    filename,
    exportedTimestamp,
    sha256Hash,
    scannerIds,
  }: {
    id: Id;
    electionId: Id;
    isTestMode: boolean;
    filename: string;
    exportedTimestamp: Iso8601Timestamp;
    sha256Hash: string;
    scannerIds: Set<string>;
  }): void {
    this.client.run(
      `
        insert into cvr_files (
          id,
          election_id,
          is_test_mode,
          filename,
          export_timestamp,
          precinct_ids,
          scanner_ids,
          sha256_hash
        ) values (
          ?, ?, ?, ?, ?, ?, ?, ?
        )
      `,
      id,
      electionId,
      isTestMode ? 1 : 0,
      filename,
      exportedTimestamp,
      JSON.stringify([]),
      JSON.stringify([...scannerIds]),
      sha256Hash
    );
  }

  updateCastVoteRecordFileRecord({
    id,
    precinctIds,
  }: {
    id: Id;
    precinctIds: Set<string>;
  }): void {
    this.client.run(
      `
        update cvr_files
        set
          precinct_ids = ?
        where id = ?
      `,
      JSON.stringify([...precinctIds]),
      id
    );
  }

  /**
   * Adds a CVR file entry record and returns its ID. If a CVR file entry with
   * the same contents has already been added, returns the ID of that record and
   * merely associates `cvrFileId` with it.
   */
  addCastVoteRecordFileEntry({
    electionId,
    cvrFileId,
    ballotId,
    cvr,
  }: {
    electionId: Id;
    cvrFileId: Id;
    ballotId: BallotId;
    cvr: Omit<Tabulation.CastVoteRecord, 'scannerId'>;
  }): Result<
    { cvrId: Id; isNew: boolean },
    {
      type: 'ballot-id-already-exists-with-different-data';
    }
  > {
    const cvrSheetNumber =
      cvr.card.type === 'bmd' ? null : cvr.card.sheetNumber;
    const serializedVotes = JSON.stringify(cvr.votes);
    const existingCvr = this.client.one(
      `
        select
          id,
          ballot_style_id as ballotStyleId,
          ballot_type as ballotType,
          batch_id as batchId,
          precinct_id as precinctId,
          sheet_number as sheetNumber,
          votes as votes
        from cvrs
        where
          election_id = ? and
          ballot_id = ?
      `,
      electionId,
      ballotId
    ) as
      | {
          id: Id;
          ballotStyleId: string;
          ballotType: CVR.vxBallotType;
          batchId: string;
          precinctId: string;
          sheetNumber: number | null;
          votes: string;
        }
      | undefined;

    const cvrId = existingCvr?.id ?? uuid();
    if (existingCvr) {
      // Existing cast vote records are expected, but existing cast vote records
      // with new data indicate a bad or inappropriately manipulated file
      if (
        !(
          existingCvr.ballotStyleId === cvr.ballotStyleId &&
          existingCvr.ballotType === cvr.votingMethod &&
          existingCvr.batchId === cvr.batchId &&
          existingCvr.precinctId === cvr.precinctId &&
          existingCvr.sheetNumber === cvrSheetNumber &&
          existingCvr.votes === serializedVotes
        )
      ) {
        return err({
          type: 'ballot-id-already-exists-with-different-data',
        });
      }
    } else {
      // Insert new cast vote record metadata and votes
      this.client.run(
        `
        insert into cvrs (
          id,
          election_id,
          ballot_id,
          ballot_style_id,
          ballot_type,
          batch_id,
          precinct_id,
          sheet_number,
          votes
        ) values (
          ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `,
        cvrId,
        electionId,
        ballotId,
        cvr.ballotStyleId,
        cvr.votingMethod,
        cvr.batchId,
        cvr.precinctId,
        cvrSheetNumber,
        serializedVotes
      );
    }

    // Whether the cast vote record itself is new or not, associate it with the new file.
    this.client.run(
      `
        insert or ignore into cvr_file_entries (
          cvr_file_id,
          cvr_id
        ) values (
          ?, ?
        )
      `,
      cvrFileId,
      cvrId
    );

    return ok({ cvrId, isNew: !existingCvr });
  }

  addBallotImage({
    cvrId,
    imageData,
    pageLayout,
    side,
  }: {
    cvrId: Id;
    imageData: Buffer;
    pageLayout: BallotPageLayout;
    side: Side;
  }): void {
    this.client.run(
      `
      insert into ballot_images (
        cvr_id,
        side,
        image,
        layout
      ) values (
        ?, ?, ?, ?
      )
    `,
      cvrId,
      side,
      imageData,
      JSON.stringify(pageLayout)
    );
  }

  addScannerBatch(scannerBatch: ScannerBatch): void {
    this.client.run(
      `
      insert or ignore into scanner_batches (
        id,
        label,
        scanner_id,
        election_id
      ) values (
        ?, ?, ?, ?
      )
    `,
      scannerBatch.batchId,
      scannerBatch.label,
      scannerBatch.scannerId,
      scannerBatch.electionId
    );
  }

  getScannerBatches(electionId: string): ScannerBatch[] {
    return this.client.all(
      `
        select
          id as batchId,
          label as label,
          scanner_id as scannerId,
          election_id as electionId
        from scanner_batches
        where
          election_id = ?
      `,
      electionId
    ) as ScannerBatch[];
  }

  deleteEmptyScannerBatches(electionId: string): void {
    this.client.run(
      `
        delete from scanner_batches
        where election_id = ?
          and not exists (
          select 1 from cvrs where id = cvrs.batch_id
        )
      `,
      electionId
    );
  }

  /**
   * Returns the current CVR file mode for the current election.
   */
  getCurrentCvrFileModeForElection(electionId: Id): CvrFileMode {
    const sampleCastVoteRecordFile = this.client.one(
      `
        select
          is_test_mode as isTestMode
        from cvr_files
        where
          election_id = ?
      `,
      electionId
    ) as { isTestMode: number } | undefined;

    if (!sampleCastVoteRecordFile) {
      return 'unlocked';
    }

    return sampleCastVoteRecordFile.isTestMode ? 'test' : 'official';
  }

  /**
   * Adds a write-in and returns its ID. Used when loading cast vote records.
   */
  addWriteIn({
    castVoteRecordId,
    side,
    contestId,
    optionId,
  }: {
    castVoteRecordId: Id;
    side: Side;
    contestId: Id;
    optionId: Id;
  }): Id {
    const id = uuid();

    this.client.run(
      `
        insert into write_ins (
          id,
          cvr_id,
          side,
          contest_id,
          option_id
        ) values (
          ?, ?, ?, ?, ?
        )
      `,
      id,
      castVoteRecordId,
      side,
      contestId,
      optionId
    );

    return id;
  }

  /**
   * Returns the data necessary to display a single write-in.
   */
  getWriteInWithDetails(writeInId: Id): {
    writeInId: Id;
    contestId: ContestId;
    optionId: ContestOptionId;
    image: Buffer;
    layout: BallotPageLayout;
    castVoteRecordId: Id;
    castVoteRecordVotes: DatabaseSerializedCastVoteRecordVotes;
  } {
    const writeInWithDetails = this.client.one(
      `
        select
          write_ins.id as writeInId,
          write_ins.contest_id as contestId,
          write_ins.option_id as optionId,
          ballot_images.image as image,
          ballot_images.layout as layout,
          cvrs.votes as castVoteRecordVotes,
          write_ins.cvr_id as castVoteRecordId
        from write_ins
        inner join
          ballot_images on 
            write_ins.cvr_id = ballot_images.cvr_id and 
            write_ins.side = ballot_images.side
        inner join
          cvrs on
            write_ins.cvr_id = cvrs.id
        where write_ins.id = ?
      `,
      writeInId
    ) as
      | {
          writeInId: Id;
          contestId: ContestId;
          optionId: ContestOptionId;
          image: Buffer;
          layout: string;
          castVoteRecordVotes: string;
          castVoteRecordId: string;
        }
      | undefined;

    assert(writeInWithDetails, 'write-in does not exist');

    return {
      ...writeInWithDetails,
      layout: safeParseJson(
        writeInWithDetails.layout,
        BallotPageLayoutSchema
      ).unsafeUnwrap(),
      castVoteRecordVotes: safeParseJson(
        writeInWithDetails.castVoteRecordVotes,
        DatabaseSerializedCastVoteRecordVotesSchema
      ).unsafeUnwrap(),
    };
  }

  getCvrFiles(electionId: Id): CastVoteRecordFileRecord[] {
    const results = this.client.all(
      `
      select
        cvr_files.id as id,
        filename,
        export_timestamp as exportTimestamp,
        count(cvr_id) as numCvrsImported,
        precinct_ids as precinctIds,
        scanner_ids as scannerIds,
        sha256_hash as sha256Hash,
        datetime(cvr_files.created_at, 'localtime') as createdAt
      from cvr_files
      join (
        select
          cvr_file_entries.cvr_id,
          min(cvr_files.created_at) as min_import_date,
          cvr_file_entries.cvr_file_id
        from cvr_file_entries, cvr_files
        group by cvr_file_entries.cvr_id
      ) cvrs_by_min_import_date on
        cvrs_by_min_import_date.cvr_file_id = cvr_files.id
      where cvr_files.election_id = ?
      group by cvr_files.id
      order by export_timestamp desc
    `,
      electionId
    ) as Array<{
      id: Id;
      filename: string;
      exportTimestamp: string;
      numCvrsImported: number;
      precinctIds: string;
      scannerIds: string;
      sha256Hash: string;
      createdAt: string;
    }>;

    return results
      .map((result) =>
        safeParse(CastVoteRecordFileRecordSchema, {
          id: result.id,
          electionId,
          sha256Hash: result.sha256Hash,
          filename: result.filename,
          exportTimestamp: convertSqliteTimestampToIso8601(
            result.exportTimestamp
          ),
          numCvrsImported: result.numCvrsImported,
          precinctIds: safeParseJson(result.precinctIds).unsafeUnwrap(),
          scannerIds: safeParseJson(result.scannerIds).unsafeUnwrap(),
          createdAt: convertSqliteTimestampToIso8601(result.createdAt),
        }).unsafeUnwrap()
      )
      .map<CastVoteRecordFileRecord>((parsedResult) => ({
        ...parsedResult,
        precinctIds: [...parsedResult.precinctIds].sort(),
        scannerIds: [...parsedResult.scannerIds].sort(),
      }));
  }

  /**
   * Gets all CVR entries for an election.
   */
  getCastVoteRecordEntries(electionId: Id): CastVoteRecordFileEntryRecord[] {
    const fileMode = this.getCurrentCvrFileModeForElection(electionId);
    if (fileMode === 'unlocked') return [];
    const isTestMode = fileMode === 'test';

    const entries = this.client.all(
      `
        select
          cvrs.id as id,
          cvrs.ballot_id as ballotId,
          cvrs.ballot_style_id as ballotStyleId,
          cvrs.ballot_type as ballotType,
          cvrs.batch_id as batchId,
          scanner_batches.label as batchLabel,
          scanner_batches.scanner_id as scannerId,
          cvrs.precinct_id as precinctId,
          cvrs.sheet_number as sheetNumber,
          cvrs.votes as votes,
          datetime(cvrs.created_at, 'localtime') as createdAt
        from
          cvrs inner join scanner_batches on cvrs.batch_id = scanner_batches.id
        where cvrs.election_id = ?
        order by cvrs.created_at asc
      `,
      electionId
    ) as Array<{
      id: Id;
      ballotId: string;
      ballotStyleId: string;
      ballotType: string;
      batchId: string;
      batchLabel: string;
      precinctId: string;
      scannerId: string;
      sheetNumber: number | null;
      votes: string;
      createdAt: Iso8601Timestamp;
    }>;

    return entries.map((entry) => {
      const castVoteRecordLegacyMetadata: CastVoteRecord = {
        _precinctId: entry.precinctId,
        _scannerId: entry.scannerId,
        _batchId: entry.batchId,
        _batchLabel: entry.batchLabel,
        _ballotStyleId: entry.ballotStyleId,
        _ballotType: cvrBallotTypeToLegacyBallotType(
          entry.ballotType as CVR.vxBallotType
        ),
        _testBallot: isTestMode,
      };
      return {
        id: entry.id,
        ballotId: entry.ballotId,
        electionId,
        data: JSON.stringify({
          ...castVoteRecordLegacyMetadata,
          ...JSON.parse(entry.votes),
        }),
        createdAt: convertSqliteTimestampToIso8601(entry.createdAt),
      };
    });
  }

  private getTabulationFilterAsSql(
    electionId: Id,
    filter: CastVoteRecordStoreFilter
  ): [whereParts: string[], params: Bindable[]] {
    const whereParts = ['cvrs.election_id = ?'];
    const params: Bindable[] = [electionId];

    if (filter.ballotStyleIds) {
      whereParts.push(
        `cvrs.ballot_style_id in ${asQueryPlaceholders(filter.ballotStyleIds)}`
      );
      params.push(...filter.ballotStyleIds);
    }

    if (filter.precinctIds) {
      whereParts.push(
        `cvrs.precinct_id in ${asQueryPlaceholders(filter.precinctIds)}`
      );
      params.push(...filter.precinctIds);
    }

    if (filter.votingMethods) {
      whereParts.push(
        `cvrs.ballot_type in ${asQueryPlaceholders(filter.votingMethods)}`
      );
      params.push(...filter.votingMethods);
    }

    if (filter.batchIds) {
      whereParts.push(
        `cvrs.batch_id in ${asQueryPlaceholders(filter.batchIds)}`
      );
      params.push(...filter.batchIds);
    }

    if (filter.scannerIds) {
      whereParts.push(
        `scanner_batches.scanner_id in ${asQueryPlaceholders(
          filter.scannerIds
        )}`
      );
      params.push(...filter.scannerIds);
    }

    return [whereParts, params];
  }

  /**
   * Returns an iterator of cast vote records for tabulation purposes. Filters
   * the cast vote records by specified filters.
   */
  *getCastVoteRecords({
    electionId,
    election,
    filter,
  }: {
    electionId: Id;
    election: Election;
    filter: Tabulation.Filter;
  }): Generator<Tabulation.CastVoteRecord> {
    const [whereParts, params] = this.getTabulationFilterAsSql(
      electionId,
      replacePartyIdFilter(filter, election)
    );

    for (const row of this.client.each(
      `
        select
          cvrs.ballot_style_id as ballotStyleId,
          cvrs.precinct_id as precinctId,
          cvrs.ballot_type as ballotType,
          cvrs.batch_id as batchId,
          scanner_batches.scanner_id as scannerId,
          cvrs.sheet_number as sheetNumber,
          cvrs.votes as votes
        from
          cvrs inner join scanner_batches on cvrs.batch_id = scanner_batches.id
        where ${whereParts.join(' and ')}
      `,
      ...params
    ) as Iterable<{
      ballotStyleId: string;
      ballotType: string;
      batchId: string;
      precinctId: string;
      scannerId: string;
      sheetNumber: number | null;
      votes: string;
    }>) {
      yield {
        ballotStyleId: row.ballotStyleId,
        votingMethod: row.ballotType as Tabulation.VotingMethod,
        batchId: row.batchId,
        scannerId: row.scannerId,
        precinctId: row.precinctId,
        card: row.sheetNumber
          ? { type: 'hmpb', sheetNumber: row.sheetNumber }
          : { type: 'bmd' },
        votes: JSON.parse(row.votes),
      };
    }
  }

  /**
   * Deletes all CVR files for an election.
   */
  deleteCastVoteRecordFiles(electionId: Id): void {
    this.client.transaction(() => {
      this.client.run(
        `
          delete from cvr_file_entries
          where cvr_file_id in (
            select id from cvr_files where election_id = ?
          )
        `,
        electionId
      );
      this.client.run(
        `
          delete from cvr_files
          where election_id = ?
        `,
        electionId
      );
      this.client.run(
        `
          delete from cvrs
          where not exists (
            select 1 from cvr_file_entries where cvr_id = cvrs.id
          )
        `
      );
      this.client.run(
        `
          delete from write_in_candidates
          where election_id = ?
        `,
        electionId
      );
      this.deleteEmptyScannerBatches(electionId);
    });
  }

  getWriteInCandidates({
    electionId,
    contestId,
  }: {
    electionId: Id;
    contestId?: ContestId;
  }): WriteInCandidateRecord[] {
    const whereParts: string[] = ['election_id = ?'];
    const params: Bindable[] = [electionId];

    if (contestId) {
      whereParts.push('contest_id = ?');
      params.push(contestId);
    }

    const rows = this.client.all(
      `
        select
          id,
          contest_id as contestId,
          name as name
        from write_in_candidates
        where ${whereParts.join(' and ')}
      `,
      ...params
    ) as Array<{
      id: Id;
      contestId: ContestId;
      name: string;
    }>;

    return rows.map((row) => ({
      electionId,
      ...row,
    }));
  }

  addWriteInCandidate({
    electionId,
    contestId,
    name,
  }: Omit<WriteInCandidateRecord, 'id'>): WriteInCandidateRecord {
    const id = uuid();

    this.client.run(
      `
        insert into write_in_candidates 
          (id, election_id, contest_id, name)
        values
          (?, ?, ?, ?)
      `,
      id,
      electionId,
      contestId,
      name
    );

    return {
      id,
      electionId,
      contestId,
      name,
    };
  }

  private deleteWriteInCandidateIfChildless(id: Id): void {
    const adjudicatedWriteIn = this.client.one(
      `
        select id from write_ins
        where write_in_candidate_id = ?
      `,
      id
    ) as { id: Id } | undefined;

    const manualResultId = this.client.one(
      `
        select manual_result_id from manual_result_write_in_candidate_references
        where write_in_candidate_id = ?
      `,
      id
    ) as { id: Id } | undefined;

    if (!adjudicatedWriteIn && !manualResultId) {
      this.client.run(
        `
          delete from write_in_candidates
          where id = ?
        `,
        id
      );
    }
  }

  private deleteAllChildlessWriteInCandidates(): void {
    this.client.run(
      `
      delete from write_in_candidates
      where 
        id not in (
          select distinct write_in_candidate_id
          from write_ins
          where write_in_candidate_id is not null
        ) and 
        id not in (
          select distinct write_in_candidate_id
          from manual_result_write_in_candidate_references
        )
      `
    );
  }

  formatWriteInTallyRow(
    row: WriteInTallyRow,
    officialCandidateNameLookup: OfficialCandidateNameLookup
  ): WriteInTally {
    if (row.officialCandidateId) {
      return typedAs<WriteInAdjudicatedOfficialCandidateTally>({
        status: 'adjudicated',
        adjudicationType: 'official-candidate',
        contestId: row.contestId,
        tally: row.tally,
        candidateId: row.officialCandidateId,
        candidateName: officialCandidateNameLookup.get(
          row.contestId,
          row.officialCandidateId
        ),
      });
    }

    if (row.writeInCandidateId) {
      assert(row.writeInCandidateName !== null);
      return typedAs<WriteInAdjudicatedWriteInCandidateTally>({
        status: 'adjudicated',
        adjudicationType: 'write-in-candidate',
        contestId: row.contestId,
        tally: row.tally,
        candidateId: row.writeInCandidateId,
        candidateName: row.writeInCandidateName,
      });
    }

    if (row.isInvalid) {
      return typedAs<WriteInAdjudicatedInvalidTally>({
        status: 'adjudicated',
        adjudicationType: 'invalid',
        contestId: row.contestId,
        tally: row.tally,
      });
    }

    return typedAs<WriteInPendingTally>({
      status: 'pending',
      contestId: row.contestId,
      tally: row.tally,
    });
  }

  /**
   * Gets write-in adjudication tallies.
   */
  getWriteInTallies({
    electionId,
    contestId,
    status,
  }: {
    electionId: Id;
    contestId?: ContestId;
    status?: WriteInAdjudicationStatus;
  }): WriteInTally[] {
    const whereParts: string[] = ['cvrs.election_id = ?'];
    const params: Bindable[] = [electionId];

    if (contestId) {
      whereParts.push('write_ins.contest_id = ?');
      params.push(contestId);
    }

    if (status === 'adjudicated') {
      whereParts.push(
        '(write_ins.official_candidate_id is not null or write_ins.write_in_candidate_id is not null or write_ins.is_invalid = 1)'
      );
    }

    if (status === 'pending') {
      whereParts.push('write_ins.official_candidate_id is null');
      whereParts.push('write_ins.write_in_candidate_id is null');
      whereParts.push('write_ins.is_invalid = 0');
    }

    const rows = this.client.all(
      `
        select
          write_ins.contest_id as contestId,
          write_ins.official_candidate_id as officialCandidateId,
          write_ins.write_in_candidate_id as writeInCandidateId,
          write_in_candidates.name as writeInCandidateName,
          write_ins.is_invalid as isInvalid,
          count(write_ins.id) as tally
        from write_ins
        inner join
          cvrs on write_ins.cvr_id = cvrs.id
        left join
          write_in_candidates on write_in_candidates.id = write_ins.write_in_candidate_id
        where ${whereParts.join(' and ')}
        group by 
          write_ins.contest_id,
          write_ins.official_candidate_id,
          write_ins.write_in_candidate_id,
          write_ins.is_invalid
      `,
      ...params
    ) as WriteInTallyRow[];
    if (rows.length === 0) {
      return [];
    }

    const { election } = this.getCurrentElectionDefinitionOrThrow();

    const officialCandidateNameLookup =
      getOfficialCandidateNameLookup(election);

    return rows.map((row) =>
      this.formatWriteInTallyRow(row, officialCandidateNameLookup)
    );
  }

  /**
   * Gets write-in tallies specifically for tabulation, filtered and and
   * grouped by cast vote record attributes.
   */
  *getWriteInTalliesForTabulation({
    electionId,
    election,
    filter = {},
    groupBy = {},
  }: {
    electionId: Id;
    election: Election;
    filter?: CastVoteRecordStoreFilter;
    groupBy?: Tabulation.GroupBy;
  }): Generator<Tabulation.GroupOf<WriteInTally>> {
    const [whereParts, params] = this.getTabulationFilterAsSql(
      electionId,
      replacePartyIdFilter(filter, election)
    );

    const cvrSelectParts: string[] = [];
    const groupByParts: string[] = [];

    if (groupBy.groupByBallotStyle || groupBy.groupByParty) {
      cvrSelectParts.push('cvrs.ballot_style_id as ballotStyleId');
      groupByParts.push('cvrs.ballot_style_id');
    }

    if (groupBy.groupByBatch) {
      cvrSelectParts.push('cvrs.batch_id as batchId');
      groupByParts.push('cvrs.batch_id');
    }

    if (groupBy.groupByPrecinct) {
      cvrSelectParts.push('cvrs.precinct_id as precinctId');
      groupByParts.push('cvrs.precinct_id');
    }

    if (groupBy.groupByScanner) {
      cvrSelectParts.push('scanner_batches.scanner_id as scannerId');
      groupByParts.push('scanner_batches.scanner_id');
    }

    if (groupBy.groupByVotingMethod) {
      cvrSelectParts.push('cvrs.ballot_type as votingMethod');
      groupByParts.push('cvrs.ballot_type');
    }

    const officialCandidateNameLookup =
      getOfficialCandidateNameLookup(election);
    const ballotStylePartyLookup = getBallotStyleIdPartyIdLookup(election);

    for (const row of this.client.each(
      `
          select
            ${cvrSelectParts.map((line) => `${line},`).join('\n')}
            write_ins.contest_id as contestId,
            write_ins.official_candidate_id as officialCandidateId,
            write_ins.write_in_candidate_id as writeInCandidateId,
            write_in_candidates.name as writeInCandidateName,
            write_ins.is_invalid as isInvalid,
            count(write_ins.id) as tally
          from write_ins
          inner join
            cvrs on write_ins.cvr_id = cvrs.id
          inner join
            scanner_batches on scanner_batches.id = cvrs.batch_id
          left join
            write_in_candidates on write_in_candidates.id = write_ins.write_in_candidate_id
          where ${whereParts.join(' and ')}
          group by 
            ${groupByParts.map((line) => `${line},`).join('\n')}
            write_ins.contest_id,
            write_ins.official_candidate_id,
            write_ins.write_in_candidate_id,
            write_ins.is_invalid
        `,
      ...params
    ) as Iterable<
      WriteInTallyRow & Partial<Tabulation.CastVoteRecordAttributes>
    >) {
      const groupSpecifier: Tabulation.GroupSpecifier = {
        ballotStyleId: groupBy.groupByBallotStyle
          ? row.ballotStyleId
          : undefined,
        partyId: groupBy.groupByParty
          ? ballotStylePartyLookup[assertDefined(row.ballotStyleId)]
          : undefined,
        batchId: groupBy.groupByBatch ? row.batchId : undefined,
        scannerId: groupBy.groupByScanner ? row.scannerId : undefined,
        precinctId: groupBy.groupByPrecinct ? row.precinctId : undefined,
        votingMethod: groupBy.groupByVotingMethod
          ? row.votingMethod
          : undefined,
      };

      yield {
        ...groupSpecifier,
        ...this.formatWriteInTallyRow(row, officialCandidateNameLookup),
      };
    }
  }

  /**
   * Gets write-in records filtered by the given options.
   */
  getWriteInRecords({
    electionId,
    contestId,
    castVoteRecordId,
    writeInId,
    status,
    limit,
  }: {
    electionId: Id;
    contestId?: ContestId;
    castVoteRecordId?: Id;
    writeInId?: Id;
    status?: WriteInAdjudicationStatus;
    limit?: number;
  }): WriteInRecord[] {
    this.assertElectionExists(electionId);

    const whereParts: string[] = ['cvr_files.election_id = ?'];
    const params: Bindable[] = [electionId];

    if (contestId) {
      whereParts.push('write_ins.contest_id = ?');
      params.push(contestId);
    }

    if (castVoteRecordId) {
      whereParts.push('write_ins.cvr_id = ?');
      params.push(castVoteRecordId);
    }

    if (writeInId) {
      whereParts.push('write_ins.id = ?');
      params.push(writeInId);
    }

    if (status === 'adjudicated') {
      whereParts.push(
        '(write_ins.official_candidate_id is not null or write_ins.write_in_candidate_id is not null or write_ins.is_invalid = 1)'
      );
    } else if (status === 'pending') {
      whereParts.push('write_ins.official_candidate_id is null');
      whereParts.push('write_ins.write_in_candidate_id is null');
      whereParts.push('write_ins.is_invalid = 0');
    }

    if (typeof limit === 'number') {
      params.push(limit);
    }

    const writeInRows = this.client.all(
      `
        select distinct
          write_ins.id as id,
          write_ins.cvr_id as castVoteRecordId,
          write_ins.contest_id as contestId,
          write_ins.option_id as optionId,
          write_ins.official_candidate_id as officialCandidateId,
          write_ins.write_in_candidate_id as writeInCandidateId,
          write_ins.is_invalid as isInvalid,
          datetime(write_ins.adjudicated_at, 'localtime') as adjudicatedAt
        from write_ins
        inner join
          cvr_file_entries on write_ins.cvr_id = cvr_file_entries.cvr_id
        inner join
          cvr_files on cvr_file_entries.cvr_file_id = cvr_files.id
        where
          ${whereParts.join(' and ')}
        order by
          write_ins.cvr_id,
          write_ins.option_id
        ${typeof limit === 'number' ? 'limit ?' : ''}
      `,
      ...params
    ) as Array<{
      id: Id;
      castVoteRecordId: Id;
      contestId: ContestId;
      optionId: ContestOptionId;
      isInvalid: boolean;
      officialCandidateId: string | null;
      writeInCandidateId: Id | null;
      adjudicatedAt: Iso8601Timestamp | null;
    }>;

    return writeInRows
      .map((row) => {
        if (row.officialCandidateId) {
          return typedAs<WriteInRecordAdjudicatedOfficialCandidate>({
            id: row.id,
            castVoteRecordId: row.castVoteRecordId,
            contestId: row.contestId,
            optionId: row.optionId,
            status: 'adjudicated',
            adjudicationType: 'official-candidate',
            candidateId: row.officialCandidateId,
          });
        }

        if (row.writeInCandidateId) {
          return typedAs<WriteInRecordAdjudicatedWriteInCandidate>({
            id: row.id,
            castVoteRecordId: row.castVoteRecordId,
            contestId: row.contestId,
            optionId: row.optionId,
            status: 'adjudicated',
            adjudicationType: 'write-in-candidate',
            candidateId: row.writeInCandidateId,
          });
        }

        if (row.isInvalid) {
          return typedAs<WriteInRecordAdjudicatedInvalid>({
            id: row.id,
            castVoteRecordId: row.castVoteRecordId,
            contestId: row.contestId,
            optionId: row.optionId,
            status: 'adjudicated',
            adjudicationType: 'invalid',
          });
        }

        return typedAs<WriteInRecordPending>({
          id: row.id,
          status: 'pending',
          castVoteRecordId: row.castVoteRecordId,
          contestId: row.contestId,
          optionId: row.optionId,
        });
      })
      .filter((writeInRecord) => writeInRecord.status === status || !status);
  }

  /**
   * Adjudicates a write-in.
   */
  adjudicateWriteIn(adjudicationAction: WriteInAdjudicationAction): void {
    const [initialWriteInRecord] = this.getWriteInRecords({
      electionId: assertDefined(this.getCurrentElectionId()),
      writeInId: adjudicationAction.writeInId,
    });
    assert(initialWriteInRecord, 'write-in record does not exist');

    const params =
      adjudicationAction.type === 'invalid'
        ? [adjudicationAction.writeInId]
        : [adjudicationAction.candidateId, adjudicationAction.writeInId];

    this.client.run(
      `
        update write_ins
        set 
          is_invalid = ${adjudicationAction.type === 'invalid' ? 1 : 0}, 
          official_candidate_id = ${
            adjudicationAction.type === 'official-candidate' ? '?' : 'null'
          }, 
          write_in_candidate_id = ${
            adjudicationAction.type === 'write-in-candidate' ? '?' : 'null'
          }, 
          adjudicated_at = current_timestamp
        where id = ?
      `,
      ...params
    );

    // if we are switching away from a write-in candidate, we may have to clean
    // up the record if it has no references
    if (
      initialWriteInRecord.status === 'adjudicated' &&
      initialWriteInRecord.adjudicationType === 'write-in-candidate'
    ) {
      this.deleteWriteInCandidateIfChildless(initialWriteInRecord.candidateId);
    }
  }

  deleteAllManualResults({ electionId }: { electionId: Id }): void {
    this.client.run(
      `delete from manual_results where election_id = ?`,
      electionId
    );

    // removing manual results may have left unofficial write-in candidates
    // without any references, so we delete them
    this.deleteAllChildlessWriteInCandidates();
  }

  deleteManualResults({
    electionId,
    precinctId,
    ballotStyleId,
    votingMethod,
  }: { electionId: Id } & ManualResultsIdentifier): void {
    this.client.run(
      `
        delete from manual_results
        where 
          election_id = ? and
          precinct_id = ? and
          ballot_style_id = ? and
          voting_method = ?`,
      electionId,
      precinctId,
      ballotStyleId,
      votingMethod
    );

    // removing the manual result may have left unofficial write-in candidates
    // without any references, so we delete them
    this.deleteAllChildlessWriteInCandidates();
  }

  setManualResults({
    electionId,
    precinctId,
    ballotStyleId,
    votingMethod,
    manualResults,
  }: ManualResultsIdentifier & {
    electionId: Id;
    manualResults: Tabulation.ManualElectionResults;
  }): void {
    const { ballotCount } = manualResults;
    const serializedContestResults = JSON.stringify(
      manualResults.contestResults
    );

    const { id: manualResultsRecordId } = this.client.one(
      `
        insert into manual_results (
          election_id,
          precinct_id,
          ballot_style_id,
          voting_method,
          ballot_count,
          contest_results
        ) values 
          (?, ?, ?, ?, ?, ?)
        on conflict
          (election_id, precinct_id, ballot_style_id, voting_method)
        do update set
          ballot_count = excluded.ballot_count,
          contest_results = excluded.contest_results
        returning (id)
      `,
      electionId,
      precinctId,
      ballotStyleId,
      votingMethod,
      ballotCount,
      serializedContestResults
    ) as { id: Id };

    // delete any previous write-in candidate references
    this.client.run(
      `
        delete from manual_result_write_in_candidate_references
        where manual_result_id = ?
      `,
      manualResultsRecordId
    );

    // check for the current write-in candidate references
    const writeInCandidateIds: Id[] = [];
    for (const contesResults of Object.values(manualResults.contestResults)) {
      assert(contesResults);
      if (contesResults.contestType === 'candidate') {
        for (const candidateTally of Object.values(contesResults.tallies)) {
          if (candidateTally.isWriteIn) {
            writeInCandidateIds.push(candidateTally.id);
          }
        }
      }
    }

    if (writeInCandidateIds.length > 0) {
      const params: Bindable[] = [];
      const questionMarks: string[] = [];
      for (const writeInCandidateId of writeInCandidateIds) {
        params.push(manualResultsRecordId, writeInCandidateId);
        questionMarks.push('(?, ?)');
      }

      // insert new write-in candidate references
      this.client.run(
        `
          insert into manual_result_write_in_candidate_references (
            manual_result_id,
            write_in_candidate_id
          ) values ${questionMarks.join(', ')}
        `,
        ...params
      );
    }

    // delete write-in candidates that may have only been included on the
    // previously entered manual results and are now not referenced
    this.deleteAllChildlessWriteInCandidates();
  }

  getManualResults({
    electionId,
    precinctIds,
    ballotStyleIds,
    votingMethods,
  }: {
    electionId: Id;
  } & ManualResultsStoreFilter): ManualResultsRecord[] {
    const whereParts = ['election_id = ?'];
    const params: Bindable[] = [electionId];

    if (precinctIds) {
      whereParts.push(`precinct_id in ${asQueryPlaceholders(precinctIds)}`);
      params.push(...precinctIds);
    }

    if (ballotStyleIds) {
      whereParts.push(
        `ballot_style_id in ${asQueryPlaceholders(ballotStyleIds)}`
      );
      params.push(...ballotStyleIds);
    }

    if (votingMethods) {
      whereParts.push(`voting_method in ${asQueryPlaceholders(votingMethods)}`);
      params.push(...votingMethods);
    }

    return (
      this.client.all(
        `
          select 
            precinct_id as precinctId,
            ballot_style_id as ballotStyleId,
            voting_method as votingMethod,
            ballot_count as ballotCount,
            contest_results as contestResultsData,
            datetime(created_at, 'localtime') as createdAt
          from manual_results
          where ${whereParts.join(' and ')}
        `,
        ...params
      ) as Array<
        ManualResultsIdentifier & {
          contestResultsData: string;
          ballotCount: number;
          createdAt: string;
        }
      >
    ).map((row) => ({
      precinctId: row.precinctId,
      ballotStyleId: row.ballotStyleId,
      votingMethod: row.votingMethod,
      manualResults: {
        ballotCount: row.ballotCount,
        contestResults: JSON.parse(
          row.contestResultsData
        ) as Tabulation.ManualElectionResults['contestResults'],
      },
      createdAt: convertSqliteTimestampToIso8601(row.createdAt),
    }));
  }

  getManualResultsMetadata({
    electionId,
  }: {
    electionId: Id;
  }): ManualResultsMetadataRecord[] {
    return (
      this.client.all(
        `
          select 
            precinct_id as precinctId,
            ballot_style_id as ballotStyleId,
            voting_method as votingMethod,
            ballot_count as ballotCount,
            datetime(created_at, 'localtime') as createdAt
          from manual_results
          where election_id = ?
        `,
        electionId
      ) as Array<
        ManualResultsIdentifier & {
          ballotCount: number;
          createdAt: string;
        }
      >
    ).map((row) => ({
      precinctId: row.precinctId,
      ballotStyleId: row.ballotStyleId,
      votingMethod: row.votingMethod,
      ballotCount: row.ballotCount,
      createdAt: convertSqliteTimestampToIso8601(row.createdAt),
    }));
  }

  /**
   * Sets whether the election with the given ID has had results marked official.
   */
  setElectionResultsOfficial(electionId: Id, isOfficialResults: boolean): void {
    this.client.run(
      `
        update elections
        set is_official_results = ?
        where id = ?
      `,
      isOfficialResults ? 1 : 0,
      electionId
    );
  }

  /* c8 ignore start */
  getDebugSummary(): Map<string, number> {
    const tableNameRows = this.client.all(
      `select name from sqlite_schema where type='table' order by name;`
    ) as Array<{ name: string }>;

    return new Map<string, number>(
      tableNameRows.map(
        (row) =>
          [
            row.name,
            (
              this.client.one(`select count(*) as count from ${row.name}`) as {
                count: number;
              }
            ).count,
          ] as const
      )
    );
  }
  /* c8 ignore stop */
}
