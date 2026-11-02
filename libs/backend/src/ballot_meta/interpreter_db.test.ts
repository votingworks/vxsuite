import { Client } from '@votingworks/db';
import { BaseLogger, LogSource } from '@votingworks/logging';
import {
  electionFamousNames2021Fixtures,
  makeTemporaryFile,
} from '@votingworks/fixtures';
import { expect, test } from 'vitest';
import { createInterpreterDb } from './interpreter_db.js';
import { BallotMetaStore } from './store.js';

test('createInterpreterDb', () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { election } = electionDefinition;
  const dbPath = makeTemporaryFile();
  createInterpreterDb(dbPath, electionDefinition);

  const client = Client.fileClient(dbPath, new BaseLogger(LogSource.System));
  expect(client.one('select election_data, ballot_hash from election')).toEqual(
    {
      election_data: electionDefinition.electionData,
      ballot_hash: electionDefinition.ballotHash,
    }
  );

  const store = new BallotMetaStore(client);
  for (const ballotStyle of election.ballotStyles) {
    expect(store.getPositions(ballotStyle.id)).toEqual(
      ballotStyle.ballotPositions ?? null
    );
  }
});
