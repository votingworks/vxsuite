import { Client as DbClient } from '@votingworks/db';
// import { Iso8601Timestamp } from '@votingworks/types';
import { join } from 'node:path';
// import { v4 as uuid } from 'uuid';
import { BaseLogger } from '@votingworks/logging';
import { find, groupBy } from '@votingworks/basics';
import { readFileSync } from 'node:fs';
import { Voter, VoterIdentificationMethod, VoterSearchParams } from './types';

const voters: Voter[] = JSON.parse(
  readFileSync(join(__dirname, '../../voters.json'), 'utf-8')
);

// function convertSqliteTimestampToIso8601(
//   sqliteTimestamp: string
// ): Iso8601Timestamp {
//   return new Date(sqliteTimestamp).toISOString();
// }

const SchemaPath = join(__dirname, '../schema.sql');

export class Store {
  private constructor(private readonly client: DbClient) {}

  getDbPath(): string {
    return this.client.getDatabasePath();
  }

  /**
   * Builds and returns a new store at `dbPath`.
   */
  static fileStore(dbPath: string, logger: BaseLogger): Store {
    return new Store(DbClient.fileClient(dbPath, logger, SchemaPath));
  }

  /**
   * Builds and returns a new store whose data is kept in memory.
   */
  static memoryStore(): Store {
    return new Store(DbClient.memoryClient(SchemaPath));
  }

  groupVotersAlphabeticallyByLastName(): Array<Voter[]> {
    return groupBy(voters, (v) => v.lastName[0].toUpperCase()).map(
      ([, voterGroup]) => voterGroup
    );
  }

  searchVoters(searchParams: VoterSearchParams): Voter[] | number {
    const MAX_VOTER_SEARCH_RESULTS = 20;
    const matchingVoters = voters.filter(
      (voter) =>
        voter.lastName
          .toUpperCase()
          .startsWith(searchParams.lastName.toUpperCase()) &&
        voter.firstName
          .toUpperCase()
          .startsWith(searchParams.firstName.toUpperCase())
    );
    if (matchingVoters.length > MAX_VOTER_SEARCH_RESULTS) {
      return matchingVoters.length;
    }
    return matchingVoters;
  }

  recordVoterCheckIn(
    voterId: string,
    identificationMethod: VoterIdentificationMethod,
    machineId: string
  ): void {
    const voter = find(voters, (v) => v.voterId === voterId);
    voter.checkIn = {
      timestamp: new Date().toISOString(),
      identificationMethod,
      machineId,
    };
  }

  getCheckInCount(machineId?: string): number {
    return voters.filter(
      (voter) =>
        voter.checkIn && (!machineId || voter.checkIn.machineId === machineId)
    ).length;
  }
}
