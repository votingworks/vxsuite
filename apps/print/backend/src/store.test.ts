import { test, expect } from 'vitest';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { BallotType, LanguageCode } from '@votingworks/types';
import { Store } from './store';

test('getDbPath', () => {
  const store = Store.memoryStore();
  expect(store.getDbPath()).toEqual(':memory:');
});

test('reset clears the database', () => {
  const store = Store.memoryStore();
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();

  // Set up some data
  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction: 'test-jurisdiction',
    electionPackageHash: 'test-hash',
  });

  expect(store.hasElection()).toEqual(true);

  // Reset the store
  store.reset();

  // Verify data is cleared
  expect(store.hasElection()).toEqual(false);
  expect(store.getElectionRecord()).toBeUndefined();
});

test('unconfigured machine early returns or errors for relevant API calls', () => {
  const store = Store.memoryStore();
  store.setElectionAndJurisdiction();
  expect(() => store.setPrecinctSelection(ALL_PRECINCTS_SELECTION)).toThrow(
    'Cannot set precinct selection without an election.'
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
  ).toBeNull();
});
