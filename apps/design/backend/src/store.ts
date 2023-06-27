import { Client as DbClient } from '@votingworks/db';
import {
  ElectionDefinition,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { join } from 'path';

const SchemaPath = join(__dirname, '../schema.sql');

export class Store {
  private constructor(private readonly client: DbClient) {}

  getDbPath(): string {
    return this.client.getDatabasePath();
  }

  /**
   * Builds and returns a new store at `dbPath`.
   */
  static fileStore(dbPath: string): Store {
    return new Store(DbClient.fileClient(dbPath, SchemaPath));
  }

  /**
   * Gets the current election definition.
   */
  getElection(): ElectionDefinition | undefined {
    const electionRow = this.client.one(
      'select election_data as electionData from election'
    ) as { electionData: string } | undefined;

    if (!electionRow?.electionData) {
      return undefined;
    }

    const parseResult = safeParseElectionDefinition(electionRow.electionData);

    if (parseResult.isErr()) {
      throw new Error('Unable to parse stored election data.');
    }

    return parseResult.ok();
  }

  /**
   * Sets the current election definition.
   */
  setElection(electionDefinition?: ElectionDefinition): void {
    this.client.run('delete from election');
    if (electionDefinition) {
      this.client.run(
        'insert into election (election_data) values (?)',
        electionDefinition.electionData
      );
    }
  }
}
