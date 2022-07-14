//
// The durable datastore for election data, CVRs, and adjudication info.
//

import { Adjudication, ContestId } from '@votingworks/types';
import { SqliteError } from 'better-sqlite3';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import { DbClient } from './db_client';

const SchemaPath = join(__dirname, '../schema.sql');

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
   * Adds a CVR and returns its id.
   */
  addCvr(ballotId: string, fileId: string, data: string): string | null {
    const id = uuid();
    try {
      this.client.run(
        'insert into cvrs (id, ballot_id, imported_by_file, data) values (?, ?, ?, ?)',
        id,
        ballotId,
        fileId,
        data
      );
    } catch (err) {
      /* istanbul ignore next */
      if (
        err instanceof SqliteError &&
        err.code === 'SQLITE_CONSTRAINT_UNIQUE'
      ) {
        return null;
      }
      throw err;
    }
    return id;
  }

  addCvrFile(
    signature: string,
    filename: string,
    exportTimestamp: string,
    scannerIds: string[],
    precinctIds: string[],
    containsTestModeCvrs: boolean
  ): string {
    const id = uuid();
    this.client.run(
      'insert into cvr_files (id, signature, filename, timestamp, scanner_ids, precinct_ids, contains_test_mode_cvrs) values (?, ?, ?, ?, ?, ?, ?)',
      id,
      signature,
      filename,
      exportTimestamp,
      scannerIds.join(','),
      precinctIds.join(','),
      containsTestModeCvrs.toString()
    );
    return id;
  }

  /**
   * Delete all CVRs
   */
  deleteCvrs(): void {
    this.client.run('delete from cvrs');
  }

  /**
   * Adds an adjudication and returns its id.
   */
  addAdjudication(
    contestId: ContestId,
    cvrId: string,
    transcribedValue = ''
  ): string {
    const id = uuid();
    this.client.run(
      'insert into adjudications (id, contest_id, cvr_id, transcribed_value) values (?, ?, ?, ?)',
      id,
      contestId,
      cvrId,
      transcribedValue
    );
    return id;
  }

  /** Updates an adjudication's transcribedValue. */
  updateAdjudicationTranscribedValue(
    adjudicationId: string,
    transcribedValue: string
  ): void {
    this.client.run(
      'update adjudications set transcribed_value = ? where id = ?',
      transcribedValue,
      adjudicationId
    );
  }

  /**
   * Gets an adjudication by its id.
   */
  getAdjudicationById(id: string): Adjudication | undefined {
    const row = this.client.one(
      'select id, contest_id as contestId, transcribed_value as transcribedValue from adjudications where id = ?',
      id
    ) as Adjudication | undefined;
    return row;
  }

  /**
   * Get adjudication counts grouped by contestId.
   */
  getAdjudicationCountsGroupedByContestId(): Array<{
    contestId: ContestId;
    adjudicationCount: number;
  }> {
    const rows = this.client.all(
      'select contest_id as contestId, count(id) as adjudicationCount from adjudications group by contest_id'
    ) as Array<{ contestId: ContestId; adjudicationCount: number }>;

    return rows;
  }

  /**
   * Get adjudications for a given contestId.
   */
  getAdjudicationsByContestId(contestId: ContestId): Adjudication[] {
    const rows = this.client.all(
      'select id, contest_id as contestId, cvr_id as cvrId, transcribed_value as transcribedValue from adjudications where contest_id = ?',
      contestId
    ) as Adjudication[];

    return rows;
  }

  /**
   * Get adjudications grouped by contestId and transcribedValue.
   */
  getAdjudicationCountsByContestIdAndTranscribedValue(): Array<{
    contestId: ContestId;
    transcribedValue: string;
    adjudicationCount: number;
  }> {
    const rows = this.client.all(
      'select contest_id as contestId, transcribed_value as transcribedValue, count(*) as adjudicationCount from adjudications group by contest_id, transcribed_value order by contest_id, count(*) desc'
    ) as Array<{
      contestId: ContestId;
      transcribedValue: string;
      adjudicationCount: number;
    }>;

    return rows;
  }

  /**
   * Returns a unique list of values for adjudications.transcribed_values.
   */
  getAllTranscribedValues(): string[] {
    const rows = this.client.all(
      'select distinct transcribed_value as transcribedValue from adjudications order by transcribedValue asc'
    ) as Array<{ transcribedValue: string }>;

    return rows.map((r) => r.transcribedValue).filter(Boolean);
  }
}
