/* istanbul ignore file - [TODO] need to update CI image to include postgres. @preserve */

import { Buffer } from 'node:buffer';
import * as pg from 'pg';
import * as migrate from 'node-pg-migrate';

/**
 * Types supported for query value substitution.
 */
export type Bindable = string | number | bigint | Buffer | null;

/**
 * Manages a client connection to a PostgreSQL database.
 */
export class Client {
  constructor(private readonly conn: pg.PoolClient) {}

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
    ...values: pg.QueryConfigValues<Bindable[]>
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
  queryPrepared(config: pg.QueryConfig<Bindable[]>): Promise<pg.QueryResult> {
    return this.conn.query(config);
  }

  async runMigrations(params: {
    enableLogging?: boolean;
    schemaName: string;
  }): Promise<void> {
    await migrate.runner({
      createMigrationsSchema: true,
      createSchema: true,
      dbClient: this.conn,
      dir: 'migrations',
      direction: 'up',
      log: params.enableLogging ? undefined : () => {},
      migrationsSchema: params.schemaName,
      migrationsTable: 'pgmigrations',
      schema: params.schemaName,
    });
  }

  async withTransaction(fn: () => Promise<boolean>): Promise<boolean> {
    await this.query('begin');

    let successful = false;

    try {
      successful = await fn();
      return successful;
    } catch (error) {
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
