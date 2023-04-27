//
// The durable datastore for election data, CVRs, and adjudication info.
//

import { Admin } from '@votingworks/api';
import {
  Optional,
  Result,
  err,
  ok,
  typedAs,
  isResult,
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
  Id,
  Iso8601Timestamp,
  safeParse,
  safeParseElectionDefinition,
  safeParseJson,
  Side,
  SystemSettings,
  SystemSettingsDbRow,
} from '@votingworks/types';
import { join } from 'path';
import { Buffer } from 'buffer';
import { v4 as uuid } from 'uuid';
import { CastVoteRecordMetadata, ScannerBatch } from './types';
import {
  areCastVoteRecordMetadataEqual,
  cvrBallotTypeToLegacyBallotType,
} from './util/cvrs';

/**
 * Path to the store's schema file, i.e. the file that defines the database.
 */
const SchemaPath = join(__dirname, '../schema.sql');

function convertSqliteTimestampToIso8601(
  sqliteTimestamp: string
): Iso8601Timestamp {
  return new Date(sqliteTimestamp).toISOString();
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
  getElections(): Admin.ElectionRecord[] {
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
  getElection(electionId: string): Admin.ElectionRecord | undefined {
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
   * Creates a system settings record and returns its ID.
   * Note `system_settings` are logical settings that span other machines eg. VxScan.
   * `settings` are local to VxAdmin
   */
  saveSystemSettings(systemSettings: SystemSettings): void {
    this.client.run('delete from system_settings');
    this.client.run(
      'insert into system_settings (are_poll_worker_card_pins_enabled) values (?)',
      systemSettings.arePollWorkerCardPinsEnabled ? 1 : 0 // No booleans in sqlite3
    );
  }

  /**
   * Gets a specific system settings record.
   */
  getSystemSettings(): SystemSettings | undefined {
    const result = this.client.one(
      `
      select
        are_poll_worker_card_pins_enabled as arePollWorkerCardPinsEnabled
      from system_settings
    `
    ) as SystemSettingsDbRow | undefined;

    if (!result) {
      return undefined;
    }

    return {
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

  addInitialCastVoteRecordFileRecord({
    id,
    electionId,
    isTestMode,
    filename,
    exportedTimestamp,
    sha256Hash,
  }: {
    id: Id;
    electionId: Id;
    isTestMode: boolean;
    filename: string;
    exportedTimestamp: Iso8601Timestamp;
    sha256Hash: string;
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
      JSON.stringify([]),
      sha256Hash
    );
  }

  updateCastVoteRecordFileRecord({
    id,
    precinctIds,
    scannerIds,
  }: {
    id: Id;
    precinctIds: Set<string>;
    scannerIds: Set<string>;
  }): void {
    this.client.run(
      `
        update cvr_files
        set
          precinct_ids = ?,
          scanner_ids = ?
        where id = ?
      `,
      JSON.stringify([...precinctIds]),
      JSON.stringify([...scannerIds]),
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
    metadata,
    votes,
  }: {
    electionId: Id;
    cvrFileId: Id;
    ballotId: BallotId;
    metadata: CastVoteRecordMetadata;
    votes: string;
  }): Result<
    { cvrId: Id; isNew: boolean },
    {
      type: 'ballot-id-already-exists-with-different-data';
    }
  > {
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
          ballotType: string;
          batchId: string;
          precinctId: string;
          sheetNumber: number | null;
          votes: string;
        }
      | undefined;

    const cvrId = existingCvr?.id ?? uuid();
    if (existingCvr) {
      const existingCvrMetadata: CastVoteRecordMetadata = {
        ballotStyleId: existingCvr.ballotStyleId,
        ballotType: existingCvr.ballotType as CVR.vxBallotType,
        batchId: existingCvr.batchId,
        precinctId: existingCvr.precinctId,
        sheetNumber: existingCvr.sheetNumber || undefined,
      };

      // Existing cast vote records are expected, but existing cast vote records
      // with new data indicate a bad or inappropriately manipulated file
      if (
        !areCastVoteRecordMetadataEqual(metadata, existingCvrMetadata) ||
        votes !== existingCvr.votes
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
        metadata.ballotStyleId,
        metadata.ballotType,
        metadata.batchId,
        metadata.precinctId,
        metadata.sheetNumber || null,
        votes
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
  getCurrentCvrFileModeForElection(electionId: Id): Admin.CvrFileMode {
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
      return Admin.CvrFileMode.Unlocked;
    }

    return sampleCastVoteRecordFile.isTestMode
      ? Admin.CvrFileMode.Test
      : Admin.CvrFileMode.Official;
  }

  /**
   * Adds a write-in and returns its ID.
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
  getWriteInWithImage(writeInId: Id): Optional<{
    writeInId: Id;
    contestId: ContestId;
    optionId: ContestOptionId;
    image: Buffer;
    layout: BallotPageLayout;
  }> {
    const result = this.client.one(
      `
        select
          write_ins.id as writeInId,
          write_ins.contest_id as contestId,
          write_ins.option_id as optionId,
          ballot_images.image as image,
          ballot_images.layout as layout
        from write_ins
        inner join
          ballot_images on 
            write_ins.cvr_id = ballot_images.cvr_id and 
            write_ins.side = ballot_images.side
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
        }
      | undefined;

    if (!result) return result;

    return {
      ...result,
      layout: safeParseJson(
        result.layout,
        BallotPageLayoutSchema
      ).unsafeUnwrap(),
    };
  }

  getCvrFiles(electionId: Id): Admin.CastVoteRecordFileRecord[] {
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
        safeParse(Admin.CastVoteRecordFileRecordSchema, {
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
      .map<Admin.CastVoteRecordFileRecord>((parsedResult) => ({
        ...parsedResult,
        precinctIds: [...parsedResult.precinctIds].sort(),
        scannerIds: [...parsedResult.scannerIds].sort(),
      }));
  }

  /**
   * Gets all CVR entries for an election.
   */
  getCastVoteRecordEntries(
    electionId: Id
  ): Admin.CastVoteRecordFileEntryRecord[] {
    const fileMode = this.getCurrentCvrFileModeForElection(electionId);
    if (fileMode === Admin.CvrFileMode.Unlocked) return [];
    const isTestMode = fileMode === Admin.CvrFileMode.Test;

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
          delete from write_in_adjudications
          where election_id = ?
        `,
        electionId
      );
      this.deleteEmptyScannerBatches(electionId);
    });
  }

  /**
   * Gets a summary of the write-in adjudication status.
   */
  getWriteInAdjudicationSummary({
    electionId,
    contestId,
    status,
  }: {
    electionId: Id;
    contestId?: ContestId;
    status?: Admin.WriteInAdjudicationStatus;
  }): Admin.WriteInSummaryEntry[] {
    const whereParts: string[] = ['cvrs.election_id = ?'];
    const params: Bindable[] = [electionId];

    if (contestId) {
      whereParts.push('contest_id = ?');
      params.push(contestId);
    }

    if (status === 'adjudicated') {
      whereParts.push('writeInAdjudicationId is not null');
    }

    if (status === 'transcribed') {
      whereParts.push('write_ins.transcribed_value is not null');
    }

    if (status === 'pending') {
      whereParts.push(
        'writeInAdjudicationId is null and write_ins.transcribed_value is null'
      );
    }

    const rows = this.client.all(
      `
        select
          write_ins.contest_id as contestId,
          write_ins.transcribed_value as transcribedValue,
          count(write_ins.id) as writeInCount,
          (
            select write_in_adjudications.id from write_in_adjudications
            where write_in_adjudications.election_id = cvrs.election_id
              and write_in_adjudications.contest_id = write_ins.contest_id
              and write_in_adjudications.transcribed_value = write_ins.transcribed_value
            limit 1
          ) as writeInAdjudicationId
        from write_ins
        inner join
          cvrs on cvrs.id = write_ins.cvr_id
        where ${whereParts.join(' and ')}
        group by contest_id, transcribed_value
      `,
      ...params
    ) as Array<{
      contestId: ContestId;
      transcribedValue: string | null;
      writeInCount: number;
      writeInAdjudicationId: Id | null;
    }>;

    const writeInAdjudications = this.getWriteInAdjudicationRecords({
      electionId,
      contestId,
    });

    return rows.map((row): Admin.WriteInSummaryEntry => {
      const adjudication = writeInAdjudications.find(
        (a) => a.id === row.writeInAdjudicationId
      );

      if (adjudication && row.transcribedValue) {
        return {
          status: 'adjudicated',
          contestId: row.contestId,
          writeInCount: row.writeInCount,
          transcribedValue: row.transcribedValue,
          writeInAdjudication: adjudication,
        };
      }

      if (row.transcribedValue) {
        return {
          status: 'transcribed',
          contestId: row.contestId,
          writeInCount: row.writeInCount,
          transcribedValue: row.transcribedValue,
        };
      }

      return {
        status: 'pending',
        contestId: row.contestId,
        writeInCount: row.writeInCount,
      };
    });
  }

  /**
   * Gets all write-in records, filtered by the given options.
   */
  getWriteInRecords({
    electionId,
    contestId,
    status,
    limit,
  }: {
    electionId: Id;
    contestId?: ContestId;
    status?: Admin.WriteInAdjudicationStatus;
    limit?: number;
  }): Admin.WriteInRecord[] {
    this.assertElectionExists(electionId);

    const whereParts: string[] = ['cvr_files.election_id = ?'];
    const params: Bindable[] = [electionId];

    if (contestId) {
      whereParts.push('contest_id = ?');
      params.push(contestId);
    }

    if (status === 'adjudicated' || status === 'transcribed') {
      whereParts.push('write_ins.transcribed_value is not null');
    } else if (status === 'pending') {
      whereParts.push('write_ins.transcribed_value is null');
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
          write_ins.transcribed_value as transcribedValue,
          datetime(write_ins.transcribed_at, 'localtime') as transcribedAt
        from write_ins
        inner join
          cvr_file_entries on write_ins.cvr_id = cvr_file_entries.cvr_id
        inner join
          cvr_files on cvr_file_entries.cvr_file_id = cvr_files.id
        where
          ${whereParts.join(' and ')}
        ${typeof limit === 'number' ? 'limit ?' : ''}
      `,
      ...params
    ) as Array<{
      id: Id;
      castVoteRecordId: Id;
      contestId: ContestId;
      optionId: ContestOptionId;
      transcribedValue: string | null;
      transcribedAt: Iso8601Timestamp | null;
    }>;

    const adjudicationRows = this.getWriteInAdjudicationRecords({ electionId });

    return writeInRows
      .map((row) => {
        if (!row.transcribedValue) {
          return typedAs<Admin.WriteInRecordPendingTranscription>({
            id: row.id,
            status: 'pending',
            castVoteRecordId: row.castVoteRecordId,
            contestId: row.contestId,
            optionId: row.optionId,
          });
        }

        const adjudication = adjudicationRows.find(
          (a) =>
            a.contestId === row.contestId &&
            a.transcribedValue === row.transcribedValue
        );

        if (!adjudication) {
          return typedAs<Admin.WriteInRecordTranscribed>({
            id: row.id,
            castVoteRecordId: row.castVoteRecordId,
            contestId: row.contestId,
            optionId: row.optionId,
            status: 'transcribed',
            transcribedValue: row.transcribedValue,
          });
        }

        return typedAs<Admin.WriteInRecordAdjudicated>({
          id: row.id,
          castVoteRecordId: row.castVoteRecordId,
          contestId: row.contestId,
          optionId: row.optionId,
          status: 'adjudicated',
          transcribedValue: row.transcribedValue,
          adjudicatedValue: adjudication.adjudicatedValue,
          adjudicatedOptionId: adjudication.adjudicatedOptionId,
        });
      })
      .filter((writeInRecord) => writeInRecord.status === status || !status);
  }

  /**
   * Transcribes a write-in.
   */
  transcribeWriteIn(id: Id, transcribedValue: string): void {
    this.client.run(
      `
        update write_ins
        set
          transcribed_value = ?,
          transcribed_at = current_timestamp
        where id = ?
      `,
      transcribedValue,
      id
    );
  }

  /**
   * Creates a write-in adjudication, mapping a contest's transcribed value to
   * an adjudicated value or option.
   */
  createWriteInAdjudication({
    electionId,
    contestId,
    transcribedValue,
    adjudicatedValue,
    adjudicatedOptionId,
  }: {
    electionId: Id;
    contestId: ContestId;
    transcribedValue: string;
    adjudicatedValue: string;
    adjudicatedOptionId?: ContestOptionId;
  }): Id {
    const id = uuid();

    try {
      this.client.run(
        `
        insert into write_in_adjudications (
          id,
          election_id,
          contest_id,
          transcribed_value,
          adjudicated_value,
          adjudicated_option_id
        ) values (
          ?, ?, ?, ?, ?, ?
        )
      `,
        id,
        electionId,
        contestId,
        transcribedValue,
        adjudicatedValue,
        adjudicatedOptionId ?? null
      );

      if (adjudicatedValue !== transcribedValue && !adjudicatedOptionId) {
        this.client.run(
          `
          insert into write_in_adjudications (
            id,
            election_id,
            contest_id,
            transcribed_value,
            adjudicated_value
          ) values (
            ?, ?, ?, ?, ?
          )
          `,
          uuid(),
          electionId,
          contestId,
          adjudicatedValue,
          adjudicatedValue
        );
      }
    } catch (error) {
      const { id: writeInAdjudicationId } = this.client.one(
        `
        select id
        from write_in_adjudications
        where election_id = ?
          and contest_id = ?
          and transcribed_value = ?
      `,
        electionId,
        contestId,
        transcribedValue
      ) as { id: Id };

      this.client.run(
        `
        update write_in_adjudications
        set
          adjudicated_value = ?,
          adjudicated_option_id = ?
        where id = ?
      `,
        adjudicatedValue,
        /* istanbul ignore next */
        adjudicatedOptionId ?? null,
        writeInAdjudicationId
      );

      return writeInAdjudicationId;
    }

    return id;
  }

  /**
   * Updates a write-in adjudication by ID.
   */
  updateWriteInAdjudication(
    id: Id,
    {
      adjudicatedValue,
      adjudicatedOptionId,
    }: { adjudicatedValue: string; adjudicatedOptionId?: ContestOptionId }
  ): void {
    this.client.run(
      `
        update write_in_adjudications
        set
          adjudicated_value = ?,
          adjudicated_option_id = ?
        where id = ?
      `,
      adjudicatedValue,
      adjudicatedOptionId ?? null,
      id
    );
  }

  /**
   * Deletes a write-in adjudication by ID.
   */
  deleteWriteInAdjudication(id: Id): void {
    this.client.run(
      `
        delete from write_in_adjudications
        where id = ?
      `,
      id
    );
  }

  /**
   * Gets all write-in adjudications for an election, optionally filtered by
   * contest.
   */
  getWriteInAdjudicationRecords({
    electionId,
    contestId,
  }: {
    electionId: Id;
    contestId?: ContestId;
  }): Admin.WriteInAdjudicationRecord[] {
    const whereParts: string[] = ['election_id = ?'];
    const params: Bindable[] = [electionId];

    if (contestId) {
      whereParts.push('contest_id = ?');
      params.push(contestId);
    }

    return (
      this.client.all(
        `
        select
          id as id,
          contest_id as contestId,
          transcribed_value as transcribedValue,
          adjudicated_value as adjudicatedValue,
          adjudicated_option_id as adjudicatedOptionId
        from write_in_adjudications
        where ${whereParts.join(' and ')}
      `,
        ...params
      ) as Array<{
        id: Id;
        contestId: ContestId;
        transcribedValue: string;
        adjudicatedValue: string;
        adjudicatedOptionId: ContestOptionId | null;
      }>
    ).map((row) => ({
      id: row.id,
      contestId: row.contestId,
      transcribedValue: row.transcribedValue,
      adjudicatedValue: row.adjudicatedValue,
      adjudicatedOptionId: row.adjudicatedOptionId ?? undefined,
    }));
  }

  /**
   * Gets a summary of tables and their counts for debug purposes.
   */
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
}
