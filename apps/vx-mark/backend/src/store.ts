import { Client as DbClient } from '@votingworks/db';
import {
  ElectionDefinition,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { join } from 'path';

const SchemaPath = join(__dirname, '../schema.sql');
/**
 * Manages a data store for RAVE VxMark experience.
 */
export class Store {
  private constructor(private readonly client: DbClient) {}

  getDbPath(): string {
    return this.client.getDatabasePath();
  }

  /**
   * Builds and returns a new store at `dbPath`.
   */
  static fileStore(dbPath: string): Store {
    const newStore = new Store(DbClient.fileClient(dbPath, SchemaPath));

    return newStore;
  }

  /**
   * Resets the database and any cached data in the store.
   */
  reset(): void {
    this.client.reset();
  }

  addElection(electionDefinition: ElectionDefinition): void {
    this.client.run(
      'insert into elections (election_data, election_hash) values (?, ?)',
      electionDefinition.electionData,
      electionDefinition.electionHash
    );
  }

  getElectionById(electionId: string): ElectionDefinition | undefined {
    const electionRow = this.client.one(
      'select election_data as electionData from elections where id = ?',
      electionId
    ) as { electionData: string } | undefined;

    if (!electionRow?.electionData) {
      return undefined;
    }
    const electionDefinitionParseResult = safeParseElectionDefinition(
      electionRow.electionData
    );

    if (electionDefinitionParseResult.isErr()) {
      throw new Error('Unable to parse stored election data.');
    }

    return electionDefinitionParseResult.ok();
  }

  getElectionAndBallotStyleForVoter(voterId: string):
    | {
        electionId: string;
        ballotStyleId: string;
      }
    | undefined {
    const voterRow = this.client.one(
      'select election_id as electionId, ballot_style as ballotStyleId from voters where id = ? ',
      voterId
    ) as { electionId: string; ballotStyleId: string };

    if (!voterRow.electionId || !voterRow.ballotStyleId) {
      return undefined;
    }
    return voterRow;
  }
}
