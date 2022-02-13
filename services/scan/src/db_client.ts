import { assert } from '@votingworks/utils';
import { createHash } from 'crypto';
import makeDebug from 'debug';
import { promises as fs } from 'fs';
import * as sqlite3 from 'sqlite3';

const debug = makeDebug('scan:db-client');

const MEMORY_DB_PATH = ':memory:';

/**
 * Manages a connection for a SQLite database.
 */
export class DbClient {
  private db?: sqlite3.Database;

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
    return this.dbPath === MEMORY_DB_PATH;
  }

  /**
   * Gets the sha256 digest of the current schema file.
   */
  private async getSchemaDigest(): Promise<string> {
    assert(typeof this.schemaPath === 'string', 'schemaPath is required');
    const schemaSql = await fs.readFile(this.schemaPath, 'utf-8');
    return createHash('sha256').update(schemaSql).digest('hex');
  }

  /**
   * Builds and returns a new client whose data is kept in memory.
   */
  static async memoryClient(schemaPath?: string): Promise<DbClient> {
    const client = new DbClient(MEMORY_DB_PATH, schemaPath);
    await client.create();
    return client;
  }

  /**
   * Builds and returns a new client at `dbPath`.
   */
  static async fileClient(
    dbPath: string,
    schemaPath?: string
  ): Promise<DbClient> {
    const client = new DbClient(dbPath, schemaPath);

    if (!schemaPath) {
      return client;
    }

    const schemaDigestPath = `${dbPath}.digest`;
    let schemaDigest: string | undefined;
    try {
      schemaDigest = (await fs.readFile(schemaDigestPath, 'utf-8')).trim();
    } catch {
      debug(
        'could not read %s, assuming the database needs to be created',
        schemaDigestPath
      );
    }
    const newSchemaDigest = await client.getSchemaDigest();
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
        await fs.rename(dbPath, backupPath);
        debug('backed up database to be reset to %s', backupPath);
      } catch {
        // ignore for now
      }
    }

    if (shouldResetDatabase) {
      debug('resetting database to updated schema');
      await client.reset();
      await fs.writeFile(schemaDigestPath, newSchemaDigest, 'utf-8');
    } else {
      debug('database schema appears to be up to date');
    }

    return client;
  }

  /**
   * Gets the underlying sqlite3 database.
   */
  private async getDatabase(): Promise<sqlite3.Database> {
    if (!this.db) {
      return this.connect();
    }
    return this.db;
  }

  /**
   * Run {@link fn} within a transaction.
   */
  async transaction(fn: () => Promise<void>): Promise<void> {
    await this.run('begin transaction');
    try {
      await fn();
      await this.run('commit');
    } catch (err) {
      await this.run('rollback');
      throw err;
    }
  }

  /**
   * Runs `sql` with interpolated data.
   *
   * @example
   *
   * await client.run('insert into muppets (name) values (?)', 'Kermit')
   */
  async run<P extends unknown[]>(sql: string, ...params: P): Promise<void> {
    const db = await this.getDatabase();
    return new Promise((resolve, reject) => {
      db.run(sql, ...params, (err: unknown) => {
        if (err) {
          debug('failed to execute %s (%o): %s', sql, params, err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Executes `sql`, which can be multiple statements.
   *
   * @example
   *
   * await client.exec(`
   *   pragma foreign_keys = 1;
   *
   *   create table if not exist muppets (name varchar(255));
   *   create table if not exist images (url integer unique not null);
   * `)
   */
  async exec(sql: string): Promise<void> {
    const db = await this.getDatabase();
    return new Promise((resolve, reject) => {
      db.exec(sql, (err: unknown) => {
        if (err) {
          debug('failed to execute %s (%o): %s', sql, err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Runs `sql` to fetch a list of rows.
   *
   * @example
   *
   * await client.all('select * from muppets')
   */
  async all<P extends unknown[] = []>(
    sql: string,
    ...params: P
  ): Promise<unknown[]> {
    const db = await this.getDatabase();
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err: unknown, rows: unknown[]) => {
        if (err) {
          debug('failed to execute %s (%o): %s', sql, params, err);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Runs `sql` to fetch a single row.
   *
   * @example
   *
   * await client.one('select count(*) as count from muppets')
   */
  async one<P extends unknown[] = []>(
    sql: string,
    ...params: P
  ): Promise<unknown> {
    const db = await this.getDatabase();
    return new Promise<unknown>((resolve, reject) => {
      db.get(sql, params, (err: unknown, row: unknown) => {
        if (err) {
          debug('failed to execute %s (%o): %s', sql, params, err);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Deletes the entire database, including its on-disk representation.
   */
  async destroy(): Promise<void> {
    const db = await this.getDatabase();
    return new Promise((resolve, reject) => {
      db.close(async () => {
        if (!this.isMemoryDatabase()) {
          const dbPath = this.getDatabasePath();
          try {
            debug('deleting the database file at %s', dbPath);
            await fs.unlink(dbPath);
          } catch (error) {
            debug(
              'failed to delete database file %s: %s',
              dbPath,
              error.message
            );
            reject(error);
          }
        }

        resolve();
      });
    });
  }

  async connect(): Promise<sqlite3.Database> {
    debug('connecting to the database at %s', this.getDatabasePath());
    this.db = await new Promise<sqlite3.Database>((resolve, reject) => {
      const db = new sqlite3.Database(
        this.getDatabasePath(),
        (err: unknown) => {
          if (err) {
            reject(err);
          } else {
            resolve(db);
          }
        }
      );
    });

    // Enforce foreign key constraints. This is not in schema.sql because that
    // only runs on db creation.
    await this.run('pragma foreign_keys = 1');

    return this.db;
  }

  /**
   * Creates the database including its tables.
   */
  async create(): Promise<sqlite3.Database> {
    debug('creating the database at %s', this.getDatabasePath());
    const db = await this.connect();
    if (this.schemaPath) {
      const schema = await fs.readFile(this.schemaPath, 'utf-8');
      await this.exec(schema);
    }
    return db;
  }

  /**
   * Writes a copy of the database to the given path.
   */
  async backup(filePath: string): Promise<void> {
    assert(!this.isMemoryDatabase(), 'cannot backup a memory database');
    await this.run('vacuum into ?', filePath);
  }

  /**
   * Resets the database.
   */
  async reset(): Promise<void> {
    if (this.db) {
      await this.destroy();
    }

    await this.create();
  }
}
