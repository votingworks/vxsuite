//
// The durable datastore for election data, CVRs, and adjudication info.
//

import { Admin } from '@votingworks/api';
import {
  CastVoteRecord,
  ContestId,
  ContestOptionId,
  err,
  Id,
  Iso8601Timestamp,
  ok,
  Result,
  safeParseElectionDefinition,
  safeParseJson,
} from '@votingworks/types';
import { typedAs } from '@votingworks/utils';
import * as fs from 'fs';
import { basename, join } from 'path';
import * as readline from 'readline';
import { v4 as uuid } from 'uuid';
import { Bindable, DbClient } from './db_client';
import { getWriteInsFromCastVoteRecord } from './util/cvrs';
import { sha256File } from './util/sha256_file';

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
 * Kinds of errors that can occur when adding a CVR file.
 */
export type AddCastVoteRecordErrorKind =
  | 'BallotIdRequired'
  | 'BallotIdAlreadyExistsWithDifferentData';

/**
 * An error caused by a missing ballot ID in a CVR file.
 */
export interface AddCastVoteRecordBallotIdRequiredError {
  readonly kind: 'BallotIdRequired';
}

/**
 * An error caused by a duplicate ballot ID.
 */
export interface AddCastVoteRecordBallotIdExistsWithDifferentDataError {
  readonly kind: 'BallotIdAlreadyExistsWithDifferentData';
  readonly newData: string;
  readonly existingData: string;
}

/**
 * Errors that can occur when adding a CVR file.
 */
export type AddCastVoteRecordError =
  | AddCastVoteRecordBallotIdRequiredError
  | AddCastVoteRecordBallotIdExistsWithDifferentDataError;

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
        created_at as createdAt,
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
        created_at as createdAt,
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
   * Adds a CVR file record and returns its ID. If a CVR file with the same
   * contents has already been added, returns the ID of that record instead.
   *
   * Call with `analyzeOnly` set to `true` to only analyze the file and not add
   * it to the database.
   */
  async addCastVoteRecordFile({
    electionId,
    filePath,
    originalFilename,
    analyzeOnly,
  }: {
    electionId: Id;
    filePath: string;
    originalFilename?: string;
    analyzeOnly?: boolean;
  }): Promise<
    Result<
      {
        id: Id;
        wasExistingFile: boolean;
        newlyAdded: number;
        alreadyPresent: number;
      },
      AddCastVoteRecordError
    >
  > {
    this.client.run('begin transaction');
    let inTransaction = true;
    const sha256Hash = await sha256File(filePath);

    try {
      let id = uuid();
      let newlyAdded = 0;
      let alreadyPresent = 0;

      const existing = this.client.one(
        `
          select id
          from cvr_files
          where election_id = ?
            and sha256_hash = ?
        `,
        electionId,
        sha256Hash
      ) as { id: Id } | undefined;

      if (existing) {
        alreadyPresent = (
          this.client.one(
            `
              select count(cvr_id) as alreadyPresent
              from cvr_file_entries
              where cvr_file_id = ?
            `,
            existing.id
          ) as { alreadyPresent: number }
        ).alreadyPresent;
        id = existing.id;
      } else {
        this.client.run(
          `
            insert into cvr_files (
              id,
              election_id,
              filename,
              sha256_hash
            ) values (
              ?, ?, ?, ?
            )
          `,
          id,
          electionId,
          originalFilename ?? basename(filePath),
          sha256Hash
        );

        const lines = readline.createInterface(fs.createReadStream(filePath));

        for await (const line of lines) {
          if (line.trim() === '') {
            continue;
          }

          const result = this.addCastVoteRecordFileEntry(electionId, id, line);

          if (result.isErr()) {
            return result;
          }

          if (result.ok().isNew) {
            newlyAdded += 1;
          } else {
            alreadyPresent += 1;
          }
        }
      }

      this.client.run(
        analyzeOnly ? 'rollback transaction' : 'commit transaction'
      );
      inTransaction = false;

      return ok({
        id,
        wasExistingFile: !!existing,
        newlyAdded,
        alreadyPresent,
      });
    } catch (error) {
      if (inTransaction) {
        this.client.run('rollback transaction');
      }
      throw error;
    }
  }

  getCastVoteRecordForWriteIn(
    writeInId: Id
  ): Admin.CastVoteRecordData | undefined {
    const result = this.client.one(
      `
      select
        write_ins.id as writeInId,
        write_ins.contest_id as contestId,
        write_ins.option_id as optionId,
        cvrs.election_id as electionId,
        cvrs.data as cvrData
      from write_ins
      inner join
        cvrs on cvrs.id = write_ins.cvr_id
      where write_ins.id = ?
    `,
      writeInId
    ) as
      | {
          writeInId: Id;
          contestId: ContestId;
          optionId: ContestOptionId;
          electionId: Id;
          cvrData: string;
        }
      | undefined;

    if (!result) {
      return undefined;
    }

    return {
      cvr: safeParseJson(result.cvrData).unsafeUnwrap() as CastVoteRecord,
      writeInId: result.writeInId,
      contestId: result.contestId,
      optionId: result.optionId,
      electionId: result.electionId,
    };
  }

  /**
   * Adds a CVR file entry record and returns its ID. If a CVR file entry with
   * the same contents has already been added, returns the ID of that record and
   * associates `cvrFileId` with it.
   */
  addCastVoteRecordFileEntry(
    electionId: Id,
    cvrFileId: Id,
    data: string
  ): Result<{ id: Id; isNew: boolean }, AddCastVoteRecordError> {
    const cvr = safeParseJson(data).unsafeUnwrap() as CastVoteRecord;
    const ballotId = cvr._ballotId;

    if (!ballotId) {
      return err({ kind: 'BallotIdRequired' });
    }

    const existing = this.client.one(
      `
        select
          id,
          data
        from cvrs
        where
          election_id = ? and
          ballot_id = ?
      `,
      electionId,
      ballotId
    ) as { id: Id; data: string } | undefined;

    const id = existing?.id ?? uuid();

    if (existing) {
      if (existing.data !== data) {
        return err({
          kind: 'BallotIdAlreadyExistsWithDifferentData',
          newData: data,
          existingData: existing.data,
        });
      }
    } else {
      this.client.run(
        `
        insert into cvrs (
          id,
          election_id,
          ballot_id,
          data
        ) values (
          ?, ?, ?, ?
        )
      `,
        id,
        electionId,
        ballotId,
        data
      );
    }

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
      id
    );

    for (const [contestId, writeInIds] of getWriteInsFromCastVoteRecord(cvr)) {
      for (const optionId of writeInIds) {
        this.addWriteIn({
          castVoteRecordId: id,
          contestId,
          optionId,
        });
      }
    }

    return ok({ id, isNew: !existing });
  }

  /**
   * Adds a write-in and returns its ID.
   */
  addWriteIn({
    castVoteRecordId,
    contestId,
    optionId,
  }: {
    castVoteRecordId: Id;
    contestId: Id;
    optionId: Id;
  }): Id {
    const id = uuid();

    this.client.run(
      `
        insert or ignore into write_ins (
          id,
          cvr_id,
          contest_id,
          option_id
        ) values (
          ?, ?, ?, ?
        )
      `,
      id,
      castVoteRecordId,
      contestId,
      optionId
    );

    return id;
  }

  getCastVoteRecordFileMetadata(
    cvrFileId: Id
  ): Admin.CastVoteRecordFileRecord | undefined {
    const result = this.client.one(
      `
      select
        election_id as electionId,
        filename,
        sha256_hash as sha256Hash,
        created_at as createdAt
      from cvr_files
      where id = ?
    `,
      cvrFileId
    ) as
      | {
          electionId: Id;
          filename: string;
          sha256Hash: string;
          createdAt: string;
        }
      | undefined;

    if (!result) {
      return undefined;
    }

    return {
      id: cvrFileId,
      electionId: result.electionId,
      sha256Hash: result.sha256Hash,
      filename: result.filename,
      createdAt: convertSqliteTimestampToIso8601(result.createdAt),
    };
  }

  getCastVoteRecordFile(id: Id): Admin.CastVoteRecordFileRecord | undefined {
    const result = this.client.one(
      `
      select
        election_id as electionId,
        filename,
        sha256_hash as sha256Hash,
        created_at as createdAt
      from cvr_files
      where id = ?
    `,
      id
    ) as
      | {
          electionId: Id;
          filename: string;
          sha256Hash: string;
          createdAt: string;
        }
      | undefined;

    if (!result) {
      return undefined;
    }

    return {
      id,
      electionId: result.electionId,
      sha256Hash: result.sha256Hash,
      filename: result.filename,
      createdAt: convertSqliteTimestampToIso8601(result.createdAt),
    };
  }

  /**
   * Gets all CVR entries for an election.
   */
  getCastVoteRecordEntries(
    electionId: Id
  ): Admin.CastVoteRecordFileEntryRecord[] {
    const entries = this.client.all(
      `
        select
          id,
          ballot_id as ballotId,
          data,
          created_at as createdAt
        from cvrs
        where election_id = ?
      `,
      electionId
    ) as Array<{
      id: Id;
      ballotId: string;
      data: string;
      createdAt: Iso8601Timestamp;
    }>;

    return entries.map((entry) => ({
      id: entry.id,
      ballotId: entry.ballotId,
      electionId,
      data: entry.data,
      createdAt: convertSqliteTimestampToIso8601(entry.createdAt),
    }));
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
          write_ins.transcribed_at as transcribedAt
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
