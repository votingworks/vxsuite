import type { BaseLogger } from '@votingworks/logging';
import { randomUUID as uuid } from 'node:crypto';
import { Db } from '@votingworks/design-store-pg';
import { Store } from '../src/store.js';
import { runMigrations } from '../src/migrations.js';

export class TestStore {
  private readonly schemaName: string;
  private readonly db: Db;
  private readonly store: Store;

  private readonly logger: BaseLogger;

  constructor(logger: BaseLogger) {
    this.logger = logger;

    this.schemaName = `test_${uuid().replaceAll('-', '_')}`;
    this.db = new Db(this.logger, {
      defaultSchemaName: this.schemaName,
    });
    this.store = new Store(this.db);
  }

  getStore(): Store {
    return this.store;
  }

  async init(): Promise<void> {
    await this.db.withClient(async (client) => {
      await client.query(`drop schema if exists ${this.schemaName} cascade;`);
      await runMigrations(client, {
        noLock: true,
        schemaName: this.schemaName,
      });
    });
  }

  async cleanUp(): Promise<void> {
    await this.db.withClient(async (client) => {
      await client.query(`drop schema if exists ${this.schemaName} cascade;`);
    });
    await this.db.close();
  }
}
