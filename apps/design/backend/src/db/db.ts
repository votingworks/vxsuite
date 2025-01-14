/* istanbul ignore file - [TODO] need to update CI image to include postgres. @preserve */

// [TODO] Move to separate libs/ package once it's stable/cleaned up.

import {
  BaseLogger,
  LogDispositionStandardTypes,
  LogEventId,
} from '@votingworks/logging';
import makeDebug from 'debug';
import * as pg from 'pg';
import { Client } from './client';
import { NODE_ENV } from '../globals';

const debug = makeDebug('pg-client');

/**
 * Manages a pool of connections to a PostgreSQL database.
 */
export class Db {
  private readonly pool: pg.Pool;

  constructor(
    private readonly logger: BaseLogger,
    private readonly opts: { defaultSchemaName?: string } = {}
  ) {
    this.pool = new pg.Pool({
      ssl: NODE_ENV === 'production' && {
        rejectUnauthorized: false,
      },
    });
    this.pool.on('error', (error) => {
      void this.logger.log(
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
      // Enable test suites to run concurrently on separate DB schemas.
      // The default schema search path needs to be set on a per-connection
      // basis.
      // [TODO] Figure out if there's a better way to do this.
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
