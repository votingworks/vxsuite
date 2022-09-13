import { assert } from '@votingworks/utils';
import { Buffer } from 'buffer';
import makeDebug from 'debug';
import * as fs from 'fs';
import { sha256 } from 'js-sha256';
import Database = require('better-sqlite3');

type Database = Database.Database;

const debug = makeDebug('admin:db-client');

const MEMORY_DB_PATH = ':memory:';

/**
 * Values that may be passed to the client as bindable parameters.
 */
export type Bindable = string | number | bigint | Buffer | null;

/**
 * Manages a connection for a SQLite database.
 */
export class DbClient {
  private db?: Database;

  /**
   * @param dbPath a file system path, or ":memory:" for an in-memory database
   */
  private constructor(
    private readonly dbPath: string,
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
    return sha256(schemaSql);
  }

  /**
   * Builds and returns a new client whose data is kept in memory.
   */
  static memoryClient(schemaPath?: string): DbClient {
    const client = new DbClient(MEMORY_DB_PATH, schemaPath);
    client.create();
    return client;
  }

  /**
   * Builds and returns a new client at `dbPath`.
   */
  static fileClient(dbPath: string, schemaPath?: string): DbClient {
    const client = new DbClient(dbPath, schemaPath);

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
        /* istanbul ignore next */
        debug('backed up database to be reset to %s', backupPath);
      } catch {
        // ignore for now
      }
    }

    /* istanbul ignore next */
    if (shouldResetDatabase) {
      debug('resetting database to updated schema');
      client.reset();
      fs.writeFileSync(schemaDigestPath, newSchemaDigest, 'utf-8');
    } else {
      /* istanbul ignore next */
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
   * Run {@link fn} within a transaction.
   */
  transaction(fn: () => void): void {
    const db = this.getDatabase();
    db.transaction(fn)();
  }

  /**
   * Runs `sql` with interpolated data.
   *
   * @example
   *
   * client.run('insert into muppets (name) values (?)', 'Kermit')
   */
  run<P extends Bindable[]>(sql: string, ...params: P): void {
    const db = this.getDatabase();
    const stmt = db.prepare<P>(sql);
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
   * Runs `sql` to fetch a list of rows.
   *
   * @example
   *
   * client.all('select * from muppets')
   */
  all<P extends Bindable[] = []>(sql: string, ...params: P): unknown[] {
    const db = this.getDatabase();
    const stmt = db.prepare<P>(sql);
    return stmt.all(...params);
  }

  /**
   * Runs `sql` to iterate over rows.
   */
  each<P extends Bindable[] = []>(
    sql: string,
    ...params: P
  ): IterableIterator<unknown> {
    const db = this.getDatabase();
    const stmt = db.prepare<P>(sql);
    return stmt.iterate(...params);
  }

  /**
   * Runs `sql` to fetch a single row.
   *
   * @example
   *
   * client.one('select count(*) as count from muppets')
   */
  one<P extends Bindable[] = []>(sql: string, ...params: P): unknown {
    const db = this.getDatabase();
    const stmt = db.prepare<P>(sql);
    return stmt.get(...params);
  }

  /**
   * Deletes the entire database, including its on-disk representation.
   */
  destroy(): void {
    const db = this.getDatabase();
    db.close();

    if (this.isMemoryDatabase()) {
      return;
    }

    const dbPath = this.getDatabasePath();
    try {
      debug('deleting the database file at %s', dbPath);
      fs.unlinkSync(dbPath);
    } catch (error) {
      /* istanbul ignore next */
      assert(error instanceof Error);
      /* istanbul ignore next */
      debug('failed to delete database file %s: %s', dbPath, error.message);
      /* istanbul ignore next */
      throw error;
    }
  }

  /**
   * Connects to the database, creating it if it doesn't exist.
   */
  connect(): Database {
    debug('connecting to the database at %s', this.getDatabasePath());
    this.db = new Database(this.getDatabasePath());

    // Enforce foreign key constraints. This is not in schema.sql because that
    // only runs on db creation.
    this.run('pragma foreign_keys = 1');

    return this.db;
  }

  /**
   * Creates the database including its tables.
   */
  create(): Database {
    debug('creating the database at %s', this.getDatabasePath());
    const db = this.connect();
    if (this.schemaPath) {
      const schema = fs.readFileSync(this.schemaPath, 'utf-8');
      this.exec(schema);
    }
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
}
