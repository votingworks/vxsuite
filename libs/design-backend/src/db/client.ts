import { join } from 'node:path';
import type { Buffer } from 'node:buffer';
// Type-only: see the note in `db.ts` about `pg`'s CommonJS exports.
import type * as pg from 'pg';

export const DESIGN_MIGRATIONS_DIR = join(
  import.meta.dirname,
  '../../migrations'
);

export const DESIGN_MIGRATIONS_TABLE = 'design_pgmigrations';

/**
 * Types supported for query value substitution.
 */
export type Bindable =
  | boolean
  | string
  | number
  | bigint
  | Buffer
  | Date
  | null
  | undefined;

/**
 * Manages a client connection to a PostgreSQL database.
 */
export class Client {
  private readonly conn: pg.PoolClient;

  constructor(conn: pg.PoolClient) {
    this.conn = conn;
  }

  /**
   * Usage:
   * ```ts
   *   const kind = 'dog';
   *   const name = 'Scooby';
   *
   *   const res = await client.query(
   *     'select id, age from pets where kind = $1 and name = $2',
   *     kind,
   *     name,
   *   );
   *
   *   for (row of res.rows) {
   *     console.log(`${row.id}: ${row.age}`);
   *   }
   * ```
   */
  query(
    sql: string,
    ...values: pg.QueryConfigValues<Array<Bindable | Bindable[]>>
  ): Promise<pg.QueryResult> {
    return this.conn.query(sql, values);
  }

  /**
   * Runs the given query as a prepared statement identified by the given
   * `name`. Provides improved performance for frequently used queries.
   *
   * Usage:
   * ```ts
   *   const kind = 'dog';
   *   const name = 'Scooby';
   *
   *   const res = await client.query({
   *     name: 'petsByKindAndName',
   *     text: 'select id, age from pets where kind = $1 and name = $2',
   *     values: [kind, name],
   *   });
   *
   *   for (row of res.rows) {
   *     console.log(`${row.id}: ${row.age}`);
   *   }
   * ```
   */
  // @coverage-defer
  queryPrepared(config: pg.QueryConfig<Bindable[]>): Promise<pg.QueryResult> {
    return this.conn.query(config);
  }

  get pgClient(): pg.PoolClient {
    return this.conn;
  }

  async withTransaction(fn: () => Promise<boolean>): Promise<boolean> {
    await this.query('begin');

    let successful = false;

    try {
      successful = await fn();
      return successful;
    } catch (error) {
      // @coverage-defer
      await this.query('rollback').catch((errRollback) => {
        throw errRollback;
      });

      throw error;
    } finally {
      if (successful) {
        await this.query('commit');
      } else {
        await this.query('rollback');
      }
    }
  }
}
