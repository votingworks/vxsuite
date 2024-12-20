import { assert } from '@votingworks/basics';
import { BaseLogger, LogEventId, LogSource } from '@votingworks/logging';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import makeDebug from 'debug';
import * as fs from 'node:fs';
import Database = require('better-sqlite3');

type Database = Database.Database;

const debug = makeDebug('db-client');

const MEMORY_DB_PATH = ':memory:';

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
 * Manages a connection for a SQLite database.
 */
export class Client {
  private db?: Database;

  /**
   * @param dbPath a file system path, or ":memory:" for an in-memory database
   */
  private constructor(
    private readonly dbPath: string,
    private readonly logger: BaseLogger,
    private readonly schemaPath?: string
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
    return this.getDatabase().memory;
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
   * Builds and returns a new client whose data is kept in memory.
   */
  static memoryClient(schemaPath?: string): Client {
    const client = new Client(
      MEMORY_DB_PATH,
      new BaseLogger(LogSource.System),
      schemaPath
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
    schemaPath?: string
  ): Client {
    const client = new Client(dbPath, logger, schemaPath);

    if (!schemaPath) {
      return client;
    }

    const schemaDigestPath = `${dbPath}.digest`;
    let schemaDigest: string | undefined;
    try {
      schemaDigest = fs.readFileSync(schemaDigestPath, 'utf-8').trim();
    } catch {
      debug(
        'could not read %s, assuming the database needs to be created',
        schemaDigestPath
      );
    }
    const newSchemaDigest = client.getSchemaDigest();
    const shouldResetDatabase = newSchemaDigest !== schemaDigest;

    if (shouldResetDatabase) {
      debug(
        'database schema has changed (%s ≉ %s)',
        schemaDigest,
        newSchemaDigest
      );
      try {
        const backupPath = `${dbPath}.backup-${new Date()
          .toISOString()
          .replace(/[^\d]+/g, '-')
          .replace(/-+$/, '')}`;
        fs.renameSync(dbPath, backupPath);
        debug('backed up database to be reset to %s', backupPath);
      } catch {
        // ignore for now
      }
    }

    if (shouldResetDatabase) {
      debug('resetting database to updated schema');
      client.reset();
      fs.writeFileSync(schemaDigestPath, newSchemaDigest, 'utf-8');
    } else {
      debug('database schema appears to be up to date');
    }

    return client;
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
   * Deletes the entire database, including its on-disk representation.
   */
  destroy(): void {
    void this.logger.log(
      LogEventId.DatabaseDestroyInit,
      'system',
      {
        message: `Clearing the database at ${this.getDatabasePath()}`,
      },
      debug
    );
    const db = this.getDatabase();
    db.close();

    if (this.isMemoryDatabase()) {
      return;
    }

    const dbPath = this.getDatabasePath();
    try {
      debug('deleting the database file at %s', dbPath);
      fs.unlinkSync(dbPath);
      void this.logger.log(
        LogEventId.DatabaseDestroyComplete,
        'system',
        {
          message: `Successfully deleted data at ${dbPath}`,
          disposition: 'success',
        },
        debug
      );
    } catch (error) {
      void this.logger.log(
        LogEventId.DatabaseDestroyComplete,
        'system',
        {
          message: `Failed to delete the database file ${dbPath} : ${
            (error as Error).message
          }`,
          disposition: 'failure',
        },
        debug
      );
      throw error;
    }
  }

  /**
   * Connects to the database, creating it if it doesn't exist.
   */
  connect(): Database {
    void this.logger.log(
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

    void this.logger.log(
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
    void this.logger.log(
      LogEventId.DatabaseCreateInit,
      'system',
      {
        message: `Creating the database file at ${this.getDatabasePath()}`,
      },
      debug
    );
    const db = this.connect();
    if (this.schemaPath) {
      const schema = fs.readFileSync(this.schemaPath, 'utf-8');
      this.exec(schema);
    }
    void this.logger.log(
      LogEventId.DatabaseCreateComplete,
      'system',
      {
        message: `Created the database file at ${this.getDatabasePath()}`,
        disposition: 'success',
      },
      debug
    );
    return db;
  }

  /**
   * Writes a copy of the database to the given path.
   */
  backup(filePath: string): void {
    assert(!this.isMemoryDatabase(), 'cannot backup a memory database');
    this.run('vacuum into ?', filePath);
  }

  /**
   * Resets the database.
   */
  reset(): void {
    if (this.db) {
      this.destroy();
    }

    this.create();
  }

  /**
   * Runs a full vacuum of the database.
   */
  vacuum(): void {
    this.run('vacuum');
  }
}
