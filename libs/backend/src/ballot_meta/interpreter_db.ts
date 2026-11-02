import { Client } from '@votingworks/db';
import { BaseLogger, LogSource } from '@votingworks/logging';
import type { ElectionDefinition } from '@votingworks/types';
import { BallotMetaStore } from './store.js';

/**
 * Creates a SQLite database at `dbPath` with the subset of an app workspace
 * schema the ballot interpreter reads: the `election` row and the ballot
 * positions embedded in the election definition.
 */
export function createInterpreterDb(
  dbPath: string,
  electionDefinition: ElectionDefinition
): void {
  const client = Client.fileClient(dbPath, new BaseLogger(LogSource.System));
  client.exec(
    `create table election (
      id integer primary key check (id = 1),
      election_data text not null,
      ballot_hash text not null
    ) strict;
    create table ballot_positions (
      style_id text primary key,
      positions text not null
    ) strict`
  );
  client.run(
    'insert into election (id, election_data, ballot_hash) values (1, ?, ?)',
    electionDefinition.electionData,
    electionDefinition.ballotHash
  );
  new BallotMetaStore(client).importPositionsFromElection(
    electionDefinition.election
  );
  client.close();
}
