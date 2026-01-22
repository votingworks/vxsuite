import { BaseLogger } from '@votingworks/logging';
import { v4 as uuid } from 'uuid';
import { Db } from '../src/db/db';
import { Store } from '../src/store';

export class TestStore {
  private readonly schemaName: string;
  private readonly db: Db;
  private readonly store: Store;

  constructor(private readonly logger: BaseLogger) {
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
      await client.runMigrations({ noLock: true, schemaName: this.schemaName });
    });
  }

  async cleanUp(): Promise<void> {
    await this.db.withClient(async (client) => {
      await client.query(`drop schema if exists ${this.schemaName} cascade;`);
    });
    await this.db.close();
  }
}
