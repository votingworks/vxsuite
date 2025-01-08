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

const debug = makeDebug('pg-client');

/**
 * Manages a pool of connections to a PostgreSQL database.
 */
export class Db {
  private readonly pool: pg.Pool;

  constructor(private readonly logger: BaseLogger) {
    this.pool = new pg.Pool({
      ssl: { rejectUnauthorized: false },
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

  async withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const poolClient = await this.pool.connect();
    const client = new Client(await this.pool.connect());

    try {
      return await fn(client);
    } finally {
      poolClient.release();
    }
  }
}
