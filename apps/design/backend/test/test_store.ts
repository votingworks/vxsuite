import { BaseLogger } from '@votingworks/logging';
import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { Db } from '../src/db/db';
import { Store } from '../src/store';

export class TestStore {
  private readonly schemaName: string;
  private readonly db: Db;
  private readonly store: Store;
  private readonly schema: string;

  constructor(private readonly logger: BaseLogger) {
    this.schemaName = `test_${uuid().replaceAll('-', '_')}`;
    this.db = new Db(this.logger, {
      defaultSchemaName: this.schemaName,
    });
    this.store = new Store(this.db);
    this.schema = fs.readFileSync(
      path.join(__dirname, '../schema.sql'),
      'utf8'
    );
  }

  getStore(): Store {
    return this.store;
  }

  async init(): Promise<void> {
    await this.db.withClient(async (client) => {
      await client.query(
        `
          drop schema if exists ${this.schemaName} cascade;
          create schema ${this.schemaName};
          set search_path to ${this.schemaName};
          ${this.schema};
        `
      );
    });
  }

  async cleanUp(): Promise<void> {
    await this.db.withClient(async (client) => {
      await client.query(`drop schema if exists ${this.schemaName} cascade;`);
    });
    await this.db.close();
  }
}
