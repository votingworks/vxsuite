// [TODO] Move to separate libs/ package once it's stable/cleaned up.

import {
  BaseLogger,
  LogDispositionStandardTypes,
  LogEventId,
} from '@votingworks/logging';
import makeDebug from 'debug';
// `pg` is CommonJS and node's ESM named-export detection cannot see its
// exports, so values have to come off the default import (`module.exports`);
// types still come from `pg` by name.
import pg from 'pg';
import type { Pool } from 'pg';
import { Client } from './client.js';
import { databaseUrl, NODE_ENV } from '../globals.js';

const debug = makeDebug('pg-client');

/**
 * Manages a pool of connections to a PostgreSQL database.
 */
export class Db {
  private readonly pool: Pool;

  constructor(
    private readonly logger: BaseLogger,
    // @coverage-defer
    private readonly opts: { defaultSchemaName?: string } = {}
  ) {
    this.pool = new pg.Pool({
      connectionString: databaseUrl(),
      // @coverage-defer
      ssl: NODE_ENV === 'production' && {
        rejectUnauthorized: false,
      },
    });
    // @coverage-defer
    this.pool.on('error', (error) => {
      this.logger.log(
        LogEventId.UnknownError, // [TODO] Figure out logging/reporting
        'system',
        {
          disposition: LogDispositionStandardTypes.Failure,
          message: `Postgres client error: ${error}`,
        },
        debug
      );
    });
  }

  async close(): Promise<void> {
    this.pool.removeAllListeners();
    await this.pool.end();
  }

  async withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const poolClient = await this.pool.connect();
    const client = new Client(poolClient);

    try {
      // @coverage-defer
      // Enable test suites to run concurrently on separate DB schemas.
      // The default schema search path needs to be set on a per-connection
      // basis.
      if (this.opts.defaultSchemaName) {
        await client.query(
          `set search_path to ${this.opts.defaultSchemaName};`
        );
      }

      return await fn(client);
    } finally {
      poolClient.release();
    }
  }
}
