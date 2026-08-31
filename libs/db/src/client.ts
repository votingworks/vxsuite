import { assert, err, ok, Result } from '@votingworks/basics';
import { BaseLogger, LogEventId, LogSource } from '@votingworks/logging';
import {
  isIntegrationTest,
  isNodeEnvProduction,
  isStagingDeploy,
  isVxDev,
} from '@votingworks/utils';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import makeDebug from 'debug';
import * as fs from 'node:fs';
import Database from 'better-sqlite3';
import { dirname, join } from 'node:path';
import { BackupCancelledError } from './backup_cancelled_error';
import { SchemaDigestMismatchError } from './schema_digest_mismatch_error';
import { findSchemaViolations } from './schema_validation';

type Database = Database.Database;

const debug = makeDebug('db-client');

const MEMORY_DB_PATH = ':memory:';

/**
 * Why {@link Client.backup} did not produce a snapshot.
 */
export type BackupError = { type: 'write-in-progress' } | { type: 'cancelled' };

/**
 * Table holding the digest of the schema the database was created with. It is
 * stored inside the database rather than in a sidecar file so that it cannot
 * become separated from the data it describes, e.g. when a database file is
 * copied, moved, or restored from a backup.
 */
const SCHEMA_DIGEST_TABLE = 'vx_schema_digest';

function shouldResetOnSchemaDigestMismatch(): boolean {
  return (
    !isNodeEnvProduction() ||
    isVxDev() ||
    isIntegrationTest() ||
    isStagingDeploy()
  );
}

/**
 * Types supported for database values, i.e. what can be passed to `one`, `all`,
 * `run`, etc. and substituted into the query.
 */
export type Bindable = string | number | bigint | Buffer | null;

/**
 * A symbol used to store the inner statement in a `Statement`. This is used to
 * prevent users from accessing the inner statement directly, so that database
 * interactions always go through the client.
 */
const privateInnerStatementSymbol = Symbol('privateInnerStatement');

/**
 * A prepared statement that can be run with parameters.
 */
export interface Statement<P extends Bindable[] = []> {
  [privateInnerStatementSymbol]: Database.Statement<P>;
}

/**
 * Interface describing options for database connection
 */
export interface DbConnectionOptions {
  registerRegexpFn?: boolean;
}

/**
 * Manages a connection for a SQLite database.
 */
export class Client {
  private db?: Database;
  private closed = false;

  /**
   * @param dbPath a file system path, or ":memory:" for an in-memory database
   */
  private constructor(
    private readonly dbPath: string,
    private readonly logger: BaseLogger,
    private readonly schemaPath?: string,
    private readonly connectionOptions?: DbConnectionOptions
  ) {}

  /**
   * Gets the path to the SQLite database file.
   */
  getDatabasePath(): string {
    return this.dbPath;
  }

  /**
   * Determines whether this client is connected to an in-memory database.
   */
  isMemoryDatabase(): boolean {
    return this.dbPath === MEMORY_DB_PATH;
  }

  /**
   * Gets the sha256 digest of the current schema file.
   */
  private getSchemaDigest(): string {
    assert(typeof this.schemaPath === 'string', 'schemaPath is required');
    const schemaSql = fs.readFileSync(this.schemaPath, 'utf-8');
    return createHash('sha256').update(schemaSql).digest('hex');
  }

  /**
   * Reads the schema digest stored in the database, if any.
   */
  private readStoredSchemaDigest(): string | undefined {
    try {
      const table = this.one(
        `select name from sqlite_master where type = 'table' and name = ?`,
        SCHEMA_DIGEST_TABLE
      ) as { name: string } | undefined;

      if (!table) {
        return undefined;
      }

      const row = this.one(`select digest from ${SCHEMA_DIGEST_TABLE}`) as
        | { digest: string }
        | undefined;
      return row?.digest;
    } catch (error) {
      // An unreadable or corrupt database has no usable digest, which is
      // treated the same as a mismatched one: reset outside production, refuse
      // to touch it in production.
      debug('could not read stored schema digest: %s', error);
      return undefined;
    }
  }

  /**
   * Stores the digest of the current schema file in the database, replacing any
   * previously stored digest.
   */
  private writeSchemaDigest(): void {
    this.exec(
      `create table if not exists ${SCHEMA_DIGEST_TABLE} (digest text not null) strict`
    );
    this.run(`delete from ${SCHEMA_DIGEST_TABLE}`);
    this.run(
      `insert into ${SCHEMA_DIGEST_TABLE} (digest) values (?)`,
      this.getSchemaDigest()
    );
  }

  /**
   * Builds and returns a new client whose data is kept in memory.
   */
  static memoryClient(
    schemaPath?: string,
    connectionOptions?: DbConnectionOptions
  ): Client {
    debug(
      'creating memory client with connectionOptions: %o',
      connectionOptions
    );
    const client = new Client(
      MEMORY_DB_PATH,
      new BaseLogger(LogSource.System),
      schemaPath,
      connectionOptions
    );
    client.create();
    return client;
  }

  /**
   * Builds and returns a new client at `dbPath`.
   */
  static fileClient(
    dbPath: string,
    logger: BaseLogger,
    schemaPath?: string,
    connectionOptions?: DbConnectionOptions
  ): Client {
    const client = new Client(dbPath, logger, schemaPath, connectionOptions);

    debug('creating file client with connectionOptions: %o', connectionOptions);

    if (!schemaPath) {
      return client;
    }

    const newSchemaDigest = client.getSchemaDigest();

    // A zero-length file is treated as no database at all: it holds no data, so
    // creating the schema in place loses nothing. Maybe creating the database
    // was interrupted before anything could be written.
    if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) {
      debug('no database at %s, creating it', dbPath);
      client.create();
      fs.rmSync(client.legacySchemaDigestSidecarPath(), { force: true });
      return client;
    }

    const schemaDigest =
      client.readStoredSchemaDigest() ??
      client.adoptLegacySchemaDigestSidecar(newSchemaDigest);

    if (schemaDigest === newSchemaDigest) {
      debug('database schema appears to be up to date');
      return client;
    }

    debug(
      'database schema has changed (%s ≉ %s)',
      schemaDigest,
      newSchemaDigest
    );

    if (!shouldResetOnSchemaDigestMismatch()) {
      client.logger.log(
        LogEventId.DatabaseSchemaMismatch,
        'system',
        {
          message:
            `Database at ${dbPath} was created with a different schema than ` +
            `the currently running software expects. Refusing to reset it in ` +
            `production because that would discard its data.`,
          expectedDigest: newSchemaDigest,
          actualDigest: schemaDigest,
          disposition: 'failure',
        },
        debug
      );
      throw new SchemaDigestMismatchError(
        dbPath,
        newSchemaDigest,
        schemaDigest
      );
    }

    const backupPath = `${dbPath}.backup-${new Date()
      .toISOString()
      .replace(/[^\d]+/g, '-')
      .replace(/-+$/, '')}`;
    fs.renameSync(dbPath, backupPath);
    debug('backed up database to be reset to %s', backupPath);

    debug('resetting database to updated schema');
    client.reset();

    return client;
  }

  private legacySchemaDigestSidecarPath(): string {
    return `${this.dbPath}.digest`;
  }

  /**
   * Adopts the digest from a legacy `<dbPath>.digest` sidecar file written by
   * older software, storing it in the database and removing the sidecar. Older
   * software wrote the digest alongside the database rather than inside it,
   * which meant the two could become separated. Returns the adopted digest, or
   * `undefined` if there is no sidecar to adopt.
   */
  private adoptLegacySchemaDigestSidecar(
    currentSchemaDigest: string
  ): string | undefined {
    const sidecarPath = this.legacySchemaDigestSidecarPath();
    let sidecarDigest: string;
    try {
      sidecarDigest = fs.readFileSync(sidecarPath, 'utf-8').trim();
    } catch {
      debug('no legacy schema digest sidecar at %s', sidecarPath);
      return undefined;
    }

    debug('adopting legacy schema digest sidecar at %s', sidecarPath);
    if (sidecarDigest === currentSchemaDigest) {
      this.writeSchemaDigest();
    }
    fs.rmSync(sidecarPath, { force: true });
    return sidecarDigest;
  }

  /**
   * Gets the underlying sqlite3 database.
   */
  private getDatabase(): Database {
    if (!this.db) {
      return this.connect();
    }
    return this.db;
  }

  /**
   * Whether a transaction is currently open on this connection. True for a
   * transaction started by {@link transaction} as well as one begun by running
   * `begin` directly.
   */
  isInTransaction(): boolean {
    return this.getDatabase().inTransaction;
  }

  /**
   * Run {@link fn} within a transaction and roll back the transaction if an
   * exception occurs.
   *
   * If {@link shouldCommit} is specified, the transaction
   * will be committed only if {@link shouldCommit} returns true for the result
   * of {@link fn}.
   */
  transaction<T>(fn: () => T, shouldCommit?: (result: T) => boolean): T;
  transaction<T>(
    fn: () => Promise<T>,
    shouldCommit?: (result: T) => boolean
  ): Promise<T>;
  transaction<T>(
    fn: () => T | Promise<T>,
    shouldCommit?: (result: T) => boolean
  ): T | Promise<T> {
    this.run('begin transaction');

    const concludeTransaction = (result: T): void => {
      if (!shouldCommit || shouldCommit(result)) {
        this.run('commit transaction');
      } else {
        this.run('rollback transaction');
      }
    };

    try {
      const resultOrPromise = fn();

      if (typeof (resultOrPromise as PromiseLike<T>)?.then === 'function') {
        void (resultOrPromise as PromiseLike<T>).then(
          concludeTransaction,
          (error) => {
            this.run('rollback transaction');
            return error;
          }
        );
      } else {
        concludeTransaction(resultOrPromise as T);
      }

      return resultOrPromise;
    } catch (error) {
      this.run('rollback transaction');
      throw error;
    }
  }

  /**
   * Prepares a statement for later use. You should use this method when you
   * intend to run the same query multiple times with different parameters.
   * This method is more efficient than using `run` or `exec` with a string.
   *
   * @example
   *
   * const statement: Statement<[string]> = client.prepare(
   *  'insert into muppets (name) values (?)'
   * );
   * client.run(statement, 'Kermit')
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prepare(sql: string): Statement<any[]> {
    const db = this.getDatabase();
    return {
      [privateInnerStatementSymbol]: db.prepare(sql),
    };
  }

  /**
   * Runs `statement` with interpolated data.
   *
   * @example
   *
   * const statement = client.prepare<[string]>(
   *   'insert into muppets (name) values (?)'
   * );
   * client.run(statement, 'Kermit')
   */
  run<P extends Bindable[]>(statement: Statement<P>, ...params: P): void;

  /**
   * Runs `sql` with interpolated data. Consider using `prepare` for better
   * performance when running the same query multiple times.
   *
   * @example
   *
   * client.run('insert into muppets (name) values (?)', 'Kermit')
   */
  run(sql: string, ...params: Bindable[]): void;

  /**
   * Runs `statement` with interpolated data.
   */
  run<P extends Bindable[]>(
    statement: Statement<P> | string,
    ...params: P
  ): void {
    const stmt = this.asStatement<P>(statement);
    stmt.run(...params);
  }

  /**
   * Executes `sql`, which can be multiple statements.
   *
   * @example
   *
   * client.exec(`
   *   pragma foreign_keys = 1;
   *
   *   create table if not exist muppets (name varchar(255));
   *   create table if not exist images (url integer unique not null);
   * `)
   */
  exec(sql: string): void {
    const db = this.getDatabase();
    db.exec(sql);
  }

  /**
   * Runs `statement` to fetch a list of rows.
   *
   * @example
   *
   * const statement: Statement<[string]> = client.prepare('select * from muppets where name like ?');
   * client.all(statement, 'K*')
   */
  all<P extends Bindable[] = []>(
    statement: Statement<P>,
    ...params: P
  ): unknown[];

  /**
   * Runs `sql` to fetch a list of rows.
   *
   * @example
   *
   * client.all('select * from muppets')
   */
  all(sql: string, ...params: Bindable[]): unknown[];

  /**
   * Runs `sql` to fetch a list of rows.
   */
  all<P extends Bindable[] = []>(
    statement: Statement<P> | string,
    ...params: P
  ): unknown[] {
    const stmt = this.asStatement(statement);
    return stmt.all(...params);
  }

  /**
   * Runs `statement` to iterate over rows.
   */
  each<P extends Bindable[] = []>(
    statement: Statement<P>,
    ...params: P
  ): IterableIterator<unknown>;

  /**
   * Runs `sql` to iterate over rows.
   */
  each(sql: string, ...params: Bindable[]): IterableIterator<unknown>;

  /**
   * Runs `statement` to iterate over rows.
   */
  each<P extends Bindable[] = []>(
    statement: Statement<P> | string,
    ...params: P
  ): IterableIterator<unknown> {
    const stmt = this.asStatement(statement);
    return stmt.iterate(...params);
  }

  /**
   * Runs `statement` to fetch a single row.
   *
   * @example
   *
   * const statement: Statement<[string]> = client.prepare(
   *   'select count(*) as count from muppets where name like ?'
   * );
   * client.one(statement, 'K*')
   */
  one<P extends Bindable[] = []>(sql: Statement<P>, ...params: P): unknown;

  /**
   * Runs `sql` to fetch a single row.
   *
   * @example
   *
   * client.one('select count(*) as count from muppets')
   */
  one(sql: string, ...params: Bindable[]): unknown;

  /**
   * Runs `statement` to fetch a single row.
   */
  one<P extends Bindable[] = []>(
    statement: Statement<P> | string,
    ...params: P
  ): unknown {
    const stmt = this.asStatement(statement);
    return stmt.get(...params);
  }

  private asStatement<P extends Bindable[]>(
    statement: Statement<P> | string
  ): Database.Statement<P> {
    return typeof statement === 'string'
      ? this.getDatabase().prepare<P>(statement)
      : statement[privateInnerStatementSymbol];
  }

  /**
   * Connects to the database, creating it if it doesn't exist.
   */
  connect(): Database {
    assert(
      !this.closed,
      `database client for ${this.getDatabasePath()} is closed`
    );

    this.logger.log(
      LogEventId.DatabaseConnectInit,
      'system',
      {
        message: `Connecting to the database at ${this.getDatabasePath()}`,
      },
      debug
    );

    this.db = new Database(this.getDatabasePath());

    // Enforce foreign key constraints. This is not in schema.sql because that
    // only runs on db creation.
    this.run('pragma foreign_keys = 1');

    if (this.connectionOptions?.registerRegexpFn) {
      // sqlite3 has no built-in regexp function
      // This is o(n) and should be used with caution on large tables (>20,000 rows)
      this.db.function('regexp', (pattern: string, value: string) => {
        try {
          return new RegExp(pattern, 'i').test(value) ? 1 : 0;
        } catch {
          return 0;
        }
      });
    }

    this.logger.log(
      LogEventId.DatabaseConnectComplete,
      'system',
      {
        disposition: 'success',
        message: `Successfully established a connection to the database.`,
      },
      debug
    );

    return this.db;
  }

  /**
   * Creates the database including its tables.
   */
  create(): Database {
    this.logger.log(
      LogEventId.DatabaseCreateInit,
      'system',
      {
        message: `Creating database file at ${this.getDatabasePath()}`,
      },
      debug
    );
    const db = this.connect();
    if (this.schemaPath) {
      const schema = fs.readFileSync(this.schemaPath, 'utf-8');
      this.exec(schema);
      this.writeSchemaDigest();
    }
    this.logger.log(
      LogEventId.DatabaseCreateComplete,
      'system',
      {
        message: `Created database file at ${this.getDatabasePath()}`,
        disposition: 'success',
      },
      debug
    );
    return db;
  }

  /**
   * Asserts that the schema follows our conventions, listing every violation
   * found. See {@link findSchemaViolations} for the conventions checked.
   */
  assertSchemaIsValid(): void {
    const violations = findSchemaViolations(this);

    if (violations.length > 0) {
      throw new Error(
        `invalid schema at ${
          this.schemaPath ?? this.getDatabasePath()
        }:\n${violations.map((violation) => `  - ${violation}`).join('\n')}`
      );
    }
  }

  private disconnect(): void {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }

  /**
   * Closes the database connection. Unlike {@link disconnect}, this is
   * terminal: the client will not reconnect and any further use of it throws.
   */
  close(): void {
    this.disconnect();
    this.closed = true;
  }

  /**
   * Closes the client, allowing it to be used with `using`.
   */
  [Symbol.dispose](): void {
    this.close();
  }

  /**
   * Writes a copy of the database to the given path, taken while the database
   * goes on being used: pages written through this connection while the copy
   * runs are picked up by it, so the result is a consistent snapshot rather
   * than a file smeared across the time it took to write.
   *
   * That only holds for writes made through *this* connection. A write from
   * another one takes SQLite's write lock and restarts the copy from the
   * beginning, which for a database of any size never finishes; a write
   * already in progress is reported as `write-in-progress` rather than waited
   * on. SQLite reports a copy it refused to start as one that finished with
   * nothing left to do, removing the destination on its way out, so a write
   * that begins in the moment between the check and the copy is caught after
   * the fact and reported the same way. That is why `filePath` must not
   * already name a file: a destination SQLite did not create is one it does
   * not remove, leaving a refusal indistinguishable from a snapshot.
   *
   * Pass `onProgress` to hear how much of the database has been copied, as a
   * fraction. Pass `signal` to stop partway. A snapshot that stops for any
   * reason leaves no file behind, so nothing partial is left to be mistaken
   * for a copy of the database.
   */
  async backup(
    filePath: string,
    options: {
      onProgress?: (fraction: number) => void;
      signal?: AbortSignal;
    } = {}
  ): Promise<Result<void, BackupError>> {
    const { onProgress, signal } = options;

    if (signal?.aborted) {
      return err({ type: 'cancelled' });
    }

    // A copy cannot start while this connection is partway through writing,
    // and `better-sqlite3` reports that refusal as a copy that succeeded
    // without doing anything.
    if (this.isInTransaction()) {
      return err({ type: 'write-in-progress' });
    }

    try {
      await this.getDatabase().backup(filePath, {
        progress({ totalPages, remainingPages }) {
          if (signal?.aborted) {
            // The only way to stop a copy partway: `better-sqlite3` closes it
            // and rejects when its progress callback throws.
            throw new BackupCancelledError();
          }

          onProgress?.((totalPages - remainingPages) / totalPages);

          // The return type says a number, but that is only for a caller
          // choosing the next chunk's size; `undefined` leaves it to
          // `better-sqlite3`.
          return undefined as unknown as number;
        },
      });
    } catch (error) {
      if (error instanceof BackupCancelledError) {
        fs.rmSync(filePath, { force: true });
        return err({ type: 'cancelled' });
      }

      throw error;
    }

    if (!fs.existsSync(filePath)) {
      return err({ type: 'write-in-progress' });
    }

    // The copy resolves once nothing is left to send without calling the
    // progress callback again, so the last thing a caller hears about is a
    // fraction just short of the whole database.
    onProgress?.(1);

    return ok();
  }

  /**
   * Resets the database.
   */
  reset(): void {
    if (this.isMemoryDatabase()) {
      this.disconnect();
      this.create();
    } else {
      this.atomicDatabaseFileReset();
    }
  }

  /**
   * Resets the database by creating a new empty database in a temporary
   * location and then swapping it in. This is meant to be atomic - either
   * the new database is swapped in or the old database is left intact.
   */
  private atomicDatabaseFileReset(): void {
    const dbPath = this.getDatabasePath();
    const tempDbPath = join(dirname(dbPath), `data-temp-${Date.now()}.db`);

    this.logger.log(
      LogEventId.DatabaseResetInit,
      'system',
      {
        message: `Creating new empty database to swap in for the existing database`,
      },
      debug
    );

    // create new empty database in temporary location
    const tempClient = new Client(
      tempDbPath,
      this.logger,
      this.schemaPath,
      this.connectionOptions
    );
    tempClient.create();
    tempClient.disconnect(); // Close the temporary database

    // close the current database connection
    this.disconnect();

    // swap in newly created database
    fs.renameSync(tempDbPath, dbPath);

    this.logger.log(
      LogEventId.DatabaseResetComplete,
      'system',
      {
        message: `Successfully swapped in new empty database at ${dbPath}`,
        disposition: 'success',
      },
      debug
    );

    // reconnect to the new database
    this.connect();
  }

  /**
   * Runs a full vacuum of the database.
   */
  vacuum(): void {
    this.run('vacuum');
  }
}
