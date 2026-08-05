/* istanbul ignore file - [TODO] need to update CI image to include postgres. */

import { Buffer } from 'node:buffer';
// Type-only: see the note in `db.ts` about `pg`'s CommonJS exports.
import type * as pg from 'pg';
import * as migrate from 'node-pg-migrate';
import { NODE_ENV } from '@votingworks/backend';
import { assert } from '@votingworks/basics';

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
  queryPrepared(config: pg.QueryConfig<Bindable[]>): Promise<pg.QueryResult> {
    return this.conn.query(config);
  }

  async runMigrations(params: {
    enableLogging?: boolean;
    schemaName: string;
    noLock?: boolean;
  }): Promise<void> {
    if (params.noLock) {
      assert(
        NODE_ENV === 'test',
        'Running migrations with `noLock` is only permitted in tests, ' +
          'which are run against separate schemas.'
      );
    }

    await migrate.runner({
      createMigrationsSchema: true,
      createSchema: true,
      dbClient: this.conn,
      noLock: params.noLock,
      dir: 'migrations',
      // The migrations dir carries a package.json ("type": "commonjs") so its
      // .js migration files stay CommonJS under this package's "type": "module"
      // (node-pg-migrate loads them with require). Skip that package.json — and
      // any dotfiles — so it is not treated as a migration.
      ignorePattern: '\\..*|.*\\.json',
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
