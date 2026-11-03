import { test, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { BallotType, LanguageCode } from '@votingworks/types';
import { Store } from './store.js';
import { configureStore } from '../test/app.js';

const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();

function encodedBallot(name: string): string {
  return Buffer.from(name).toString('base64');
}

test('getDbPath', () => {
  const store = Store.memoryStore();
  expect(store.getDbPath()).toEqual(':memory:');
});

test('reset clears the database', async () => {
  const store = Store.memoryStore();
  await configureStore(store, { electionDefinition });

  expect(store.hasElection()).toEqual(true);

  store.reset();

  expect(store.hasElection()).toEqual(false);
  expect(store.getElectionRecord()).toBeUndefined();
});

test('unconfigured machine early returns or errors for relevant API calls', () => {
  const store = Store.memoryStore();
  expect(() => store.setPollingPlaceId('foo')).toThrow(
    'Cannot set polling place without an election.'
  );
  expect(
    store.getDistinctBallotStylesCount({
      ballotType: BallotType.Precinct,
      languageCode: LanguageCode.ENGLISH,
      ballotMode: 'official',
    })
  ).toEqual(0);

  expect(() => store.setTestMode(true)).toThrow(
    'Cannot set test mode without an election.'
  );

  expect(
    store.getBallot({
      ballotStyleId: 'nonexistent',
      ballotType: BallotType.Precinct,
      ballotMode: 'official',
      precinctId: 'precinct-1',
    })
  ).toBeUndefined();

  expect(store.hasTestBallots()).toEqual(false);
});

test('hasTestBallots', async () => {
  const officialBallot = {
    ballotStyleId: '1-2',
    precinctId: '21',
    ballotType: BallotType.Precinct,
    ballotMode: 'official',
    encodedBallot: encodedBallot('official-pdf'),
  } as const;

  const officialOnlyStore = Store.memoryStore();
  await configureStore(officialOnlyStore, {
    electionDefinition,
    ballots: [officialBallot],
  });
  expect(officialOnlyStore.hasTestBallots()).toEqual(false);

  const withTestStore = Store.memoryStore();
  await configureStore(withTestStore, {
    electionDefinition,
    ballots: [
      officialBallot,
      {
        ...officialBallot,
        ballotMode: 'test',
        encodedBallot: encodedBallot('test-pdf'),
      },
    ],
  });
  expect(withTestStore.hasTestBallots()).toEqual(true);
});

test('ballot print counts', async () => {
  const store = Store.memoryStore();
  await configureStore(store, {
    electionDefinition,
    ballots: [
      {
        ballotStyleId: '1-2',
        precinctId: '21',
        ballotType: BallotType.Precinct,
        ballotMode: 'official',
        encodedBallot: encodedBallot('precinct'),
      },
      {
        ballotStyleId: '1-2',
        precinctId: '21',
        ballotType: BallotType.Absentee,
        ballotMode: 'official',
        encodedBallot: encodedBallot('absentee'),
      },
    ],
  });

  const key = {
    ballotStyleId: '1-2',
    precinctId: '21',
    ballotMode: 'official',
  } as const;
  store.incrementBallotPrintCount({
    ...key,
    ballotType: BallotType.Precinct,
    count: 2,
  });
  store.incrementBallotPrintCount({
    ...key,
    ballotType: BallotType.Precinct,
    count: 3,
  });
  store.incrementBallotPrintCount({
    ...key,
    ballotType: BallotType.Absentee,
    count: 1,
  });
  store.incrementBallotPrintCount({
    ...key,
    ballotMode: 'test',
    ballotType: BallotType.Absentee,
    count: 7,
  });

  expect(store.getTotalBallotPrintCount()).toEqual(13);
  expect(store.getBallotPrintCounts({ ballotMode: 'official' })).toEqual([
    expect.objectContaining({
      ballotStyleId: '1-2',
      precinctId: '21',
      precinctCount: 5,
      absenteeCount: 1,
      totalCount: 6,
    }),
  ]);
  expect(store.getBallotPrintCounts({ ballotMode: 'test' })).toEqual([]);

  store.resetBallotPrintCounts();
  expect(store.getTotalBallotPrintCount()).toEqual(0);
  expect(store.getBallotPrintCounts({ ballotMode: 'official' })).toEqual([
    expect.objectContaining({ totalCount: 0 }),
  ]);
});
