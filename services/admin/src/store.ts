//
// The durable datastore for election data, CVRs, and adjudication info.
//

import { Admin } from '@votingworks/api';
import {
  CastVoteRecord,
  err,
  Id,
  Iso8601Timestamp,
  ok,
  Result,
  safeParseElectionDefinition,
  safeParseJson,
} from '@votingworks/types';
import { sha256 } from 'js-sha256';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import { DbClient } from './db_client';

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
        updated_at as updatedAt
      from elections
      where deleted_at is null
    `) as Array<{
        id: Id;
        electionData: string;
        createdAt: string;
        updatedAt: string;
      }>
    ).map((r) => ({
      id: r.id,
      electionDefinition: safeParseElectionDefinition(
        r.electionData
      ).unsafeUnwrap(),
      createdAt: convertSqliteTimestampToIso8601(r.createdAt),
      updatedAt: convertSqliteTimestampToIso8601(r.updatedAt),
    }));
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
  addCastVoteRecordFile({
    electionId,
    filename,
    cvrFile,
    analyzeOnly,
  }: {
    electionId: Id;
    filename: string;
    cvrFile: string;
    analyzeOnly?: boolean;
  }): Result<
    {
      id: Id;
      wasExistingFile: boolean;
      newlyAdded: number;
      alreadyPresent: number;
    },
    AddCastVoteRecordError
  > {
    this.assertElectionExists(electionId);
    this.client.run('begin transaction');
    let inTransaction = true;

    try {
      let id = uuid();
      let newlyAdded = 0;
      let alreadyPresent = 0;
      const sha256Hash = sha256(cvrFile);

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
        data,
        sha256_hash
      ) values (
        ?, ?, ?, ?, ?
      )
    `,
          id,
          electionId,
          filename,
          cvrFile,
          sha256Hash
        );

        for (const line of cvrFile.split('\n')) {
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

    return ok({ id, isNew: !existing });
  }

  getCastVoteRecordFileMetadata(
    cvrFileId: Id
  ): Admin.CastVoteRecordFileMetadata | undefined {
    const result = this.client.one(
      `
      select
        election_id as electionId,
        filename,
        sha256_hash as sha256Hash,
        created_at as createdAt,
        updated_at as updatedAt
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
          updatedAt: string;
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
      updatedAt: convertSqliteTimestampToIso8601(result.updatedAt),
    };
  }

  getCastVoteRecordFile(id: Id): Admin.CastVoteRecordFileRecord | undefined {
    const result = this.client.one(
      `
      select
        election_id as electionId,
        filename,
        sha256_hash as sha256Hash,
        data,
        created_at as createdAt,
        updated_at as updatedAt
      from cvr_files
      where id = ?
    `,
      id
    ) as
      | {
          electionId: Id;
          filename: string;
          sha256Hash: string;
          data: string;
          createdAt: string;
          updatedAt: string;
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
      data: result.data,
      createdAt: convertSqliteTimestampToIso8601(result.createdAt),
      updatedAt: convertSqliteTimestampToIso8601(result.updatedAt),
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
          created_at as createdAt,
          updated_at as updatedAt
        from cvrs
        where election_id = ?
      `,
      electionId
    ) as Array<{
      id: Id;
      ballotId: string;
      data: string;
      createdAt: Iso8601Timestamp;
      updatedAt: Iso8601Timestamp;
    }>;

    return entries.map((entry) => ({
      id: entry.id,
      ballotId: entry.ballotId,
      electionId,
      data: entry.data,
      createdAt: convertSqliteTimestampToIso8601(entry.createdAt),
      updatedAt: convertSqliteTimestampToIso8601(entry.updatedAt),
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
    });
  }
}
